/**
 * dsh-mcp-sync - host half.
 *
 * Scans MCP configurations from Claude Code, Codex CLI, Cursor Agent,
 * and DSH's own config. Connects to MCP servers and registers their tools
 * into DSH's tool system for direct model invocation.
 */
import z from "@deepseek-ai/schemastery";
import { McpSources } from "./sources.js";
import { McpClientManager } from "./mcp-client.js";
import { registerMcpTools, registerMcpCallTool, registerMcpListTools } from "./mcp-tools.js";
import { makeRoutes } from "./routes.js";

/** Stable cordis plugin name. */
export const name = "mcp-sync";

/** Requires webServer for routes and tools for tool registration. */
export const inject = ["webServer", "tools"];

/** Plugin config schema. */
export const Config = z.object({
  /** Master switch. */
  enabled: z.boolean().default(true),
  /** Auto sync on startup. */
  autoSync: z.boolean().default(true),
  /** Auto connect to discovered MCP servers. */
  autoConnect: z.boolean().default(true),
  /** Periodic sync interval (ms), 0 to disable. */
  syncInterval: z.number().step(1).min(0).default(60000),
  /** Deduplicate by command+args. */
  dedupeByCommand: z.boolean().default(true),
  /** Which sources to scan. */
  sources: z.object({
    claude: z.boolean().default(true),
    codex: z.boolean().default(true),
    cursor: z.boolean().default(true),
    dsh: z.boolean().default(true),
  }).default({}),
  /** Auto-register MCP tools into DSH tool system. */
  registerTools: z.boolean().default(true),
  /** Default tool call timeout in ms. */
  callTimeoutMs: z.number().step(1).min(1000).default(30000),
});

/** Resolve raw config with defaults. */
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
 * @param {import("@deepseek-ai/cordis").Context} ctx - host context.
 * @param {object} [config] - plugin config.
 */
export function apply(ctx, config) {
  const opts = resolve(config);
  if (!opts.enabled) {
    ctx.logger.info("[mcp-sync] plugin disabled (enabled=false)");
    return;
  }

  ctx.logger.info("[mcp-sync] initializing | autoSync=" + opts.autoSync + " autoConnect=" + opts.autoConnect + " registerTools=" + opts.registerTools + " syncInterval=" + opts.syncInterval + "ms callTimeout=" + opts.callTimeoutMs + "ms");

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

  /** Tool registration disposers. */
  let toolDisposers = [];

  /** Clean up registered tools. */
  function disposeTools() {
    for (const d of toolDisposers) {
      try { d(); } catch {}
    }
    toolDisposers = [];
  }

  /**
   * Scan sources, optionally auto-connect, and optionally register tools.
   * @param {string} trigger - log context
   */
  async function sync(trigger) {
    try {
      const result = sources.scan();
      const serverCount = result?.servers?.length || 0;
      ctx.logger.info("[mcp-sync] " + trigger + " | servers=" + serverCount);

      if (opts.autoConnect && serverCount > 0) {
        await connectAll(result);
      }
    } catch (error) {
      ctx.logger.warn("[mcp-sync] " + trigger + " failed: " + (error?.message || error));
    }
  }

  /**
   * Connect to all scanned MCP servers and register their tools.
   * @param {object} scanResult - result from sources.scan()
   */
  async function connectAll(scanResult) {
    if (!scanResult?.servers || scanResult.servers.length === 0) {
      ctx.logger.info("[mcp-sync] no MCP servers found to connect");
      return;
    }

    ctx.logger.info("[mcp-sync] found " + scanResult.servers.length + " MCP servers, connecting...");

    // Build server config map from scan result
    const serverConfigs = new Map();
    for (const server of scanResult.servers) {
      const sources = server.sources || [server.source];
      const serverId = sources.join("_") + "_" + server.name.replace(/[^a-zA-Z0-9_-]/g, "_");
      if (!serverConfigs.has(serverId)) {
        serverConfigs.set(serverId, { ...server, id: serverId });
      }
    }

    // Connect to each server
    let connectedCount = 0;
    for (const [id, serverCfg] of serverConfigs) {
      try {
        const result = await clientManager.connect(id, serverCfg);
        if (result.ok) {
          connectedCount++;
          ctx.logger.info("[mcp-sync] connected " + id + " | tools=" + result.tools.length);
        } else {
          ctx.logger.warn("[mcp-sync] connect failed " + id + ": " + (result.error || "unknown"));
        }
      } catch (error) {
        ctx.logger.warn("[mcp-sync] connect exception " + id + ": " + (error?.message || error));
      }
    }

    ctx.logger.info("[mcp-sync] connected " + connectedCount + "/" + serverConfigs.size + " servers");

    // Register tools if enabled
    if (opts.registerTools && connectedCount > 0) {
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
    }
  }

  ctx.effect(() => {
    // Initial sync
    if (opts.autoSync) {
      setTimeout(() => void sync("initial scan"), 200);
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

  // Expose clientManager for harness.handle RPC from client
  ctx.effect(() => {
    const d1 = ctx.harness.handle("mcp-sync:status", async () => {
      return {
        sources: sources.status(),
        connections: clientManager.getStatus(),
        servers: clientManager.listServers(),
      };
    });

    const d2 = ctx.harness.handle("mcp-sync:connect", async (args) => {
      const { id, config: serverConfig } = args;
      return await clientManager.connect(id, serverConfig);
    });

    const d3 = ctx.harness.handle("mcp-sync:disconnect", async (args) => {
      await clientManager.disconnect(args.id);
      return { ok: true };
    });

    const d4 = ctx.harness.handle("mcp-sync:callTool", async (args) => {
      return await clientManager.callTool(args.server, args.tool, args.args || {});
    });

    const d5 = ctx.harness.handle("mcp-sync:listTools", async () => {
      return clientManager.listServers();
    });

    return () => { d1(); d2(); d3(); d4(); d5(); };
  }, "dsh-mcp-sync: harness handles");
}
