/**
 * dsh-chat-sync - host half.
 *
 * 将本地 AI CLI 对话（Claude Code / Codex CLI / Cursor Agent）同步到工作区目录，
 * 并可选自动导入为 DSH 会话。
 */
import z from "@deepseek-ai/schemastery";
import { join } from "node:path";
import { ChatSources } from "./sources.js";
import { makeRoutes } from "./routes.js";
import { WorkspaceSync } from "./workspace-sync.js";
import { AutoImporter } from "./auto-import.js";

/** Stable cordis plugin name. */
export const name = "chat-sync";

/** Requires web server + api proxy for session/workspace management. */
export const inject = ["webServer", "apiProxy"];

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
  /** 是否同步到工作区（文件复制） */
  syncToWorkspace: z.boolean().default(true),
  /** 是否自动导入为 DSH 会话 */
  autoImport: z.boolean().default(true),
  /** 自动导入扫描间隔（ms） */
  autoImportIntervalMs: z.number().step(1).min(10000).default(60000),
});

/** Resolve raw config with defaults. */
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
    autoImport: c.autoImport ?? true,
    autoImportIntervalMs: c.autoImportIntervalMs ?? 60000,
  };
}

/**
 * Mount the scanner, routes, live hub, and auto-importer.
 */
export function apply(ctx, config) {
  const opts = resolve(config);
  if (!opts.enabled) {
    ctx.logger.info("[chat-sync] 插件已禁用（enabled=false）");
    return;
  }

  ctx.logger.info(`[chat-sync] 初始化 | watch=${opts.watch} | syncToWorkspace=${opts.syncToWorkspace} | autoImport=${opts.autoImport}`);

  const sources = new ChatSources({
    maxSessions: opts.maxSessions,
    maxMessageChars: opts.maxMessageChars,
    recentLiveMs: opts.recentLiveMs,
    titleHeadBytes: opts.titleHeadBytes,
  });
  const engine = makeRoutes({ sources, config: opts });

  // 工作区同步器（文件复制）
  let workspaceSync = null;
  if (opts.syncToWorkspace) {
    workspaceSync = new WorkspaceSync({
      sources,
      workspaceDir: opts.workspaceDir,
      logger: ctx.logger,
    });
  }

  // 自动导入器（创建 DSH 会话）
  let autoImporter = null;
  if (opts.autoImport) {
    autoImporter = new AutoImporter({
      sources,
      apiProxy: ctx.apiProxy,
      logger: ctx.logger,
      importStateFile: join(opts.workspaceDir, "imported.json"),
    });
  }

  ctx.effect(() => {
    // Warm the scan cache off the boot path
    const warm = setTimeout(async () => {
      try {
        sources.scan();
        ctx.logger.info(`[chat-sync] 初始扫描完成`);

        // 启动工作区同步
        if (workspaceSync) {
          workspaceSync.start();
          ctx.logger.info(`[chat-sync] 工作区同步已启动 | target=${opts.workspaceDir}`);
        }

        // 启动自动导入
        if (autoImporter) {
          await autoImporter.start();
          ctx.logger.info(`[chat-sync] 自动导入已启动 | interval=${opts.autoImportIntervalMs}ms`);
        }
      } catch (error) {
        ctx.logger.warn(`[chat-sync] 初始化失败: ${error?.message || error}`);
      }
    }, 100);

    engine.start();
    ctx.logger.info(`[chat-sync] 实时同步已启动 | routes=${engine.routes.length}`);

    const disposers = engine.routes.map((route) => ctx.webServer.register(route));

    // 定期扫描导入
    let importTimer = null;
    if (autoImporter) {
      importTimer = setInterval(async () => {
        try {
          await autoImporter.scanAndImport();
        } catch (error) {
          ctx.logger.warn(`[chat-sync] 自动导入失败: ${error?.message}`);
        }
      }, opts.autoImportIntervalMs);
    }

    return () => {
      clearTimeout(warm);
      if (importTimer) clearInterval(importTimer);
      for (const dispose of disposers) dispose();
      engine.dispose();
      if (workspaceSync) workspaceSync.stop();
      if (autoImporter) autoImporter.stop();
      ctx.logger.info("[chat-sync] 已卸载");
    };
  }, "dsh-chat-sync: routes + live hub + auto-import");
}