/**
 * dsh-mcp-sync - host half.
 *
 * 统一 MCP 管理：扫描各来源 → 同步到注册表 → 连接 → 注册工具
 * 
 * 核心理念：同步后的 MCP 是一等公民，可编辑、可删除、可直接调用。
 */
import z from "@deepseek-ai/schemastery";
import { McpSources } from "./sources.js";
import { McpClientManager } from "./mcp-client.js";
import { loadRegistry, importServers, listServers } from "./registry.js";
import { registerMcpTools, registerMcpCallTool, registerMcpListTools } from "./mcp-tools.js";
import { makeRoutes } from "./routes.js";

/** Stable cordis plugin name. */
export const name = "mcp-sync";

/** Requires webServer for routes and tools for tool registration. */
export const inject = ["webServer"];

/** Plugin config schema. */
export const Config = z.object({
  enabled: z.boolean().default(true),
  autoSync: z.boolean().default(true),
  autoConnect: z.boolean().default(true),
  syncInterval: z.number().step(1).min(0).default(60000),
  dedupeByCommand: z.boolean().default(true),
  sources: z.object({
    claude: z.boolean().default(true),
    codex: z.boolean().default(true),
    cursor: z.boolean().default(true),
    dsh: z.boolean().default(true),
  }).default({}),
  registerTools: z.boolean().default(true),
  callTimeoutMs: z.number().step(1).min(1000).default(30000),
});

function resolve(config) {
  const c = config && typeof config === "object" ? config : {};
  return {
    enabled: c.enabled ?? true,
    autoSync: c.autoSync ?? true,
    autoConnect: c.autoConnect ?? true,
    syncInterval: c.syncInterval ?? 60000,
    dedupeByCommand: c.dedupeByCommand ?? true,
    sources: {
      claude: c.sources?.claude ?? true,
      codex: c.sources?.codex ?? true,
      cursor: c.sources?.cursor ?? true,
      dsh: c.sources?.dsh ?? true,
    },
    registerTools: c.registerTools ?? true,
    callTimeoutMs: c.callTimeoutMs ?? 30000,
  };
}

/**
 * Mount the scanner, MCP client, tool registration, and routes.
 */
export function apply(ctx, config) {
  const opts = resolve(config);
  if (!opts.enabled) {
    ctx.logger.info("[mcp-sync] plugin disabled");
    return;
  }

  ctx.logger.info("[mcp-sync] initializing | autoSync=" + opts.autoSync + " autoConnect=" + opts.autoConnect);

  const sources = new McpSources({
    home: undefined,
    sources: opts.sources,
    dedupeByCommand: opts.dedupeByCommand,
  });

  const clientManager = new McpClientManager({
    logger: (level, msg) => ctx.logger[level](msg),
    callTimeoutMs: opts.callTimeoutMs,
  });

  const engine = makeRoutes({ sources, config: opts, clientManager });

  let toolDisposers = [];

  function disposeTools() {
    for (const d of toolDisposers) {
      try { d(); } catch {}
    }
    toolDisposers = [];
  }

  /**
   * 同步流程：扫描来源 → 导入注册表 → 连接所有注册的服务器 → 注册工具
   */
  async function sync(trigger) {
    try {
      ctx.logger.info("[mcp-sync] " + trigger);

      // 1. 扫描各来源
      const scanResult = sources.scan();
      const serverCount = scanResult?.servers?.length || 0;
      ctx.logger.info("[mcp-sync] scanned " + serverCount + " servers from sources");

      // 2. 导入到注册表（不覆盖已存在的）
      if (serverCount > 0) {
        const importResult = importServers(scanResult.servers || []);
        ctx.logger.info("[mcp-sync] imported=" + importResult.imported + " skipped=" + importResult.skipped);
      }

      // 3. 连接所有注册的服务器
      if (opts.autoConnect) {
        await connectAll();
      }
    } catch (error) {
      ctx.logger.warn("[mcp-sync] " + trigger + " failed: " + (error?.message || error));
    }
  }

  /**
   * 连接注册表中的所有服务器并注册工具
   */
  async function connectAll() {
    const registry = loadRegistry();
    const serverNames = Object.keys(registry);
    
    if (serverNames.length === 0) {
      ctx.logger.info("[mcp-sync] no servers in registry");
      return;
    }

    ctx.logger.info("[mcp-sync] connecting " + serverNames.length + " servers...");

    let connectedCount = 0;
    for (const name of serverNames) {
      const serverConfig = registry[name];
      
      // Skip disabled servers
      if (serverConfig.enabled === false) continue;
      
      try {
        const result = await clientManager.connect(name, serverConfig);
        if (result.ok) {
          connectedCount++;
          ctx.logger.info("[mcp-sync] connected " + name + " | tools=" + result.tools.length);
        } else {
          ctx.logger.warn("[mcp-sync] connect failed " + name + ": " + (result.error || "unknown"));
        }
      } catch (error) {
        ctx.logger.warn("[mcp-sync] connect exception " + name + ": " + (error?.message || error));
      }
    }

    ctx.logger.info("[mcp-sync] connected " + connectedCount + "/" + serverNames.length + " servers");

    // 注册工具到 DSH（需要 tools 服务，仅 headless/agent profile 可用）
    if (opts.registerTools && connectedCount > 0 && ctx.tools) {
      disposeTools();
      try {
        const { registered, disposers } = registerMcpTools(ctx, clientManager, (level, msg) => ctx.logger[level](msg));
        toolDisposers = disposers;
        if (registered.length > 0) {
          ctx.logger.info("[mcp-sync] registered " + registered.length + " MCP tools into DSH");
        }
      } catch (error) {
        ctx.logger.warn("[mcp-sync] tool registration failed: " + (error?.message || error));
      }
    } else if (opts.registerTools && connectedCount > 0 && !ctx.tools) {
      ctx.logger.info("[mcp-sync] tools service not available (web profile), skipping tool registration");
    }
  }

  ctx.effect(() => {
    // Initial sync
    if (opts.autoSync) {
      setTimeout(() => void sync("initial sync"), 200);
    }

    // Periodic sync
    let syncTimer;
    if (opts.syncInterval > 0) {
      syncTimer = setInterval(() => void sync("periodic sync"), opts.syncInterval);
    }

    // Register routes
    ctx.logger.info("[mcp-sync] routes registered | count=" + engine.routes.length);
    const routeDisposers = engine.routes.map((route) => ctx.webServer.register(route));

    return () => {
      if (syncTimer) clearInterval(syncTimer);
      disposeTools();
      clientManager.disconnectAll().catch(() => {});
      for (const dispose of routeDisposers) dispose();
      ctx.logger.info("[mcp-sync] unloaded");
    };
  }, "dsh-mcp-sync: routes & tools");

  // 注册 meta 工具（需要 tools 服务）
  if (ctx.tools) {
    const dCall = registerMcpCallTool(ctx, clientManager);
    const dList = registerMcpListTools(ctx, clientManager);
    ctx.logger.info("[mcp-sync] meta tools registered (mcp_call, mcp_list_tools)");
  }
}
