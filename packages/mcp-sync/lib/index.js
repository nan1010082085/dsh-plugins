/**
 * dsh-mcp-sync - host half.
 *
 * Scans MCP configurations from Claude Code, Codex CLI, and Cursor Agent,
 * provides deduped list and sync capabilities via API routes.
 */
import z from "@deepseek-ai/schemastery";
import { McpSources } from "./sources.js";
import { makeRoutes } from "./routes.js";

/** Stable cordis plugin name. */
export const name = "mcp-sync";

/** Requires the web server service (routes). */
export const inject = ["webServer"];

/** Plugin config schema. */
export const Config = z.object({
  /** Master switch. */
  enabled: z.boolean().default(true),
  /** Auto sync on startup. */
  autoSync: z.boolean().default(true),
  /** Periodic sync interval (ms), 0 to disable. */
  syncInterval: z.number().step(1).min(0).default(60000),
  /** Deduplicate by command+args. */
  dedupeByCommand: z.boolean().default(true),
  /** Which sources to scan. */
  sources: z.object({
    claude: z.boolean().default(true),
    codex: z.boolean().default(true),
    cursor: z.boolean().default(true),
  }).default({}),
});

/** Resolve raw config with defaults. */
function resolve(config) {
  const c = config && typeof config === "object" ? config : {};
  return {
    enabled: c.enabled ?? true,
    autoSync: c.autoSync ?? true,
    syncInterval: c.syncInterval ?? 60000,
    dedupeByCommand: c.dedupeByCommand ?? true,
    sources: {
      claude: c.sources?.claude ?? true,
      codex: c.sources?.codex ?? true,
      cursor: c.sources?.cursor ?? true,
    },
  };
}

/**
 * Mount the scanner and routes.
 * @param {import("@deepseek-ai/cordis").Context} ctx - host context with webServer.
 * @param {object} [config] - plugin config.
 */
export function apply(ctx, config) {
  const opts = resolve(config);
  if (!opts.enabled) {
    ctx.logger.info("[mcp-sync] 插件已禁用（enabled=false）");
    return;
  }

  ctx.logger.info(`[mcp-sync] 初始化 | autoSync=${opts.autoSync} | syncInterval=${opts.syncInterval}ms | sources=${JSON.stringify(opts.sources)}`);

  const sources = new McpSources({
    home: undefined, // use default home
    sources: opts.sources,
    dedupeByCommand: opts.dedupeByCommand,
  });
  const engine = makeRoutes({ sources, config: opts });

  ctx.effect(() => {
    // Initial sync
    if (opts.autoSync) {
      const warm = setTimeout(() => {
        try {
          const result = sources.scan();
          ctx.logger.info(`[mcp-sync] 初始扫描完成 | configs=${result?.length ?? 0}`);
        } catch (error) {
          ctx.logger.warn(`[mcp-sync] 初始扫描失败: ${error?.message || error}`);
        }
      }, 100);
    }

    // Periodic sync
    let syncTimer;
    if (opts.syncInterval > 0) {
      syncTimer = setInterval(() => {
        try {
          const result = sources.scan();
          ctx.logger.info(`[mcp-sync] 定期同步完成 | configs=${result?.length ?? 0}`);
        } catch (error) {
          ctx.logger.warn(`[mcp-sync] 定期同步失败: ${error?.message || error}`);
        }
      }, opts.syncInterval);
    }

    ctx.logger.info(`[mcp-sync] 路由已注册 | routes=${engine.routes.length}`);
    const disposers = engine.routes.map((route) => ctx.webServer.register(route));
    return () => {
      if (syncTimer) clearInterval(syncTimer);
      for (const dispose of disposers) dispose();
      ctx.logger.info("[mcp-sync] 已卸载");
    };
  }, "dsh-mcp-sync: routes");
}
