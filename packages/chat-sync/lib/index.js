/**
 * dsh-chat-sync - host half.
 *
 * Mounts the conversation scanner (Claude Code / Codex CLI / Cursor Agent
 * local stores), the /api/dsh-chat-sync route family, and the live-change hub
 * (recursive fs.watch -> debounced rescan -> SSE frames). The browser half
 * (./client) renders the sidebar entry and the browsing panel.
 */
import z from "@deepseek-ai/schemastery";
import { ChatSources } from "./sources.js";
import { makeRoutes } from "./routes.js";

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
  };
}

/**
 * Mount the scanner, routes, and the live hub.
 * @param {import("@deepseek-ai/cordis").Context} ctx - host context with webServer.
 * @param {object} [config] - plugin config (schema defaults applied by the loader).
 */
export function apply(ctx, config) {
  const opts = resolve(config);
  if (!opts.enabled) return;

  const sources = new ChatSources({
    maxSessions: opts.maxSessions,
    maxMessageChars: opts.maxMessageChars,
    recentLiveMs: opts.recentLiveMs,
    titleHeadBytes: opts.titleHeadBytes,
  });
  const engine = makeRoutes({ sources, config: opts });

  ctx.effect(() => {
    // Warm the scan cache off the boot path; later scans are incremental.
    const warm = setTimeout(() => {
      try {
        sources.scan();
      } catch (error) {
        console.warn("[dsh-chat-sync] initial scan failed:", error?.message || error);
      }
    }, 100);
    engine.start();
    const disposers = engine.routes.map((route) => ctx.webServer.register(route));
    return () => {
      clearTimeout(warm);
      for (const dispose of disposers) dispose();
      engine.dispose();
    };
  }, "dsh-chat-sync: routes + live hub");
}
