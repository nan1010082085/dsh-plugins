/**
 * dsh-chat-sync - host half.
 *
 * 将本地 AI CLI 对话（Claude Code / Codex CLI / Cursor Agent）同步到工作区目录。
 * 监听源目录变化，自动复制新的对话文件到工作区。
 */
import z from "@deepseek-ai/schemastery";
import { ChatSources } from "./sources.js";
import { makeRoutes } from "./routes.js";
import { WorkspaceSync } from "./workspace-sync.js";

/** Stable cordis plugin name. */
export const name = "chat-sync";

/** Requires the web server service (routes + SSE). */
export const inject = ["webServer"];

/** Plugin config schema. */
export const Config = z.object({
  /** Master switch. */
  enabled: z.boolean().default(true),
  /** Live sync: recursive fs.watch on the three roots + SSE push. */
  watch: z.boolean().default(true),
  /** Poll interval when recursive fs.watch is unavailable (0 disables). */
  pollFallbackMs: z.number().step(1).min(0).default(5000),
  /** Watch-event debounce window (ms). */
  debounceMs: z.number().step(1).min(100).default(400),
  /** Session list hard cap. */
  maxSessions: z.number().step(1).min(10).default(500),
  /** Per-message text clamp (chars). */
  maxMessageChars: z.number().step(1).min(200).default(8000),
  /** Window (ms) in which an updated session counts as "live". */
  recentLiveMs: z.number().step(1).min(1000).default(180000),
  /** Head bytes read per new file for titles. */
  titleHeadBytes: z.number().step(1).min(4096).default(65536),
  /** 工作区同步目标目录（相对路径基于当前工作目录） */
  workspaceDir: z.string().default(".chat-sync"),
  /** 是否同步到工作区 */
  syncToWorkspace: z.boolean().default(true),
});

/** Resolve raw config with defaults (robust to unvalidated config objects). */
function resolve(config) {
  const c = config && typeof config === "object" ? config : {};
  return {
    enabled: c.enabled ?? true,
    watch: c.watch ?? true,
    pollFallbackMs: c.pollFallbackMs ?? 5000,
    debounceMs: c.debounceMs ?? 400,
    maxSessions: c.maxSessions ?? 500,
    maxMessageChars: c.maxMessageChars ?? 8000,
    recentLiveMs: c.recentLiveMs ?? 180000,
    titleHeadBytes: c.titleHeadBytes ?? 65536,
    workspaceDir: c.workspaceDir ?? ".chat-sync",
    syncToWorkspace: c.syncToWorkspace ?? true,
  };
}

/**
 * Mount the scanner, routes, and the live hub.
 * @param {import("@deepseek-ai/cordis").Context} ctx - host context with webServer.
 * @param {object} [config] - plugin config (schema defaults applied by the loader).
 */
export function apply(ctx, config) {
  const opts = resolve(config);
  if (!opts.enabled) {
    ctx.logger.info("[chat-sync] 插件已禁用（enabled=false）");
    return;
  }

  ctx.logger.info(`[chat-sync] 初始化 | watch=${opts.watch} | syncToWorkspace=${opts.syncToWorkspace} | workspaceDir=${opts.workspaceDir}`);

  const sources = new ChatSources({
    maxSessions: opts.maxSessions,
    maxMessageChars: opts.maxMessageChars,
    recentLiveMs: opts.recentLiveMs,
    titleHeadBytes: opts.titleHeadBytes,
  });
  const engine = makeRoutes({ sources, config: opts });

  // 工作区同步器
  let workspaceSync = null;
  if (opts.syncToWorkspace) {
    workspaceSync = new WorkspaceSync({
      sources,
      workspaceDir: opts.workspaceDir,
      logger: ctx.logger,
    });
  }

  ctx.effect(() => {
    // Warm the scan cache off the boot path; later scans are incremental.
    const warm = setTimeout(() => {
      try {
        sources.scan();
        ctx.logger.info(`[chat-sync] 初始扫描完成`);

        // 启动工作区同步
        if (workspaceSync) {
          workspaceSync.start();
          ctx.logger.info(`[chat-sync] 工作区同步已启动 | target=${opts.workspaceDir}`);
        }
      } catch (error) {
        ctx.logger.warn(`[chat-sync] 初始扫描失败: ${error?.message || error}`);
      }
    }, 100);
    engine.start();
    ctx.logger.info(`[chat-sync] 实时同步已启动 | routes=${engine.routes.length}`);
    const disposers = engine.routes.map((route) => ctx.webServer.register(route));
    return () => {
      clearTimeout(warm);
      for (const dispose of disposers) dispose();
      engine.dispose();
      if (workspaceSync) workspaceSync.stop();
      ctx.logger.info("[chat-sync] 已卸载");
    };
  }, "dsh-chat-sync: routes + live hub");
}
