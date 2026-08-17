/**
 * dsh-chat-sync routes: the /api/dsh-chat-sync family plus the SSE event
 * stream and the file watchers that drive live updates.
 *
 *   GET /api/dsh-chat-sync/status    source availability + counts
 *   GET /api/dsh-chat-sync/sessions  filtered session list (cached scan)
 *   GET /api/dsh-chat-sync/session   messages, byte-offset incremental
 *   GET /api/dsh-chat-sync/events    SSE change stream (fs.watch driven)
 *
 * Every route is loopback-only: conversation content is private.
 */

import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { SOURCES } from "./sources.js";

const API = {
  status: "/api/dsh-chat-sync/status",
  sessions: "/api/dsh-chat-sync/sessions",
  session: "/api/dsh-chat-sync/session",
  events: "/api/dsh-chat-sync/events",
};

/* ─────────────── loopback trust fence (dsh-web-ui shared semantics) ─────────────── */

function isIPv4Loopback(v4) {
  const parts = v4.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isLoopbackAddress(address) {
  if (address === undefined) return false;
  const n = address.toLowerCase();
  if (n === "::1") return true;
  if (n.startsWith("::ffff:")) return isIPv4Loopback(n.slice(7));
  return isIPv4Loopback(n);
}

function isLoopbackRequest(req) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;
  const host = req.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL("http://" + host);
  } catch {
    return false;
  }
  const hn = hostUrl.hostname;
  if (hn !== "localhost" && hn !== "[::1]" && !isIPv4Loopback(hn)) return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

/* ─────────────── response helpers ─────────────── */

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "referrer-policy": "no-referrer" });
  res.end(payload);
}

function query(url, name) {
  const v = url.searchParams.get(name);
  return v === null ? undefined : v;
}

/* ─────────────── live change hub (watchers + SSE) ─────────────── */

/**
 * Owns watchers and the SSE client set. Batches change notifications so a
 * burst of file events produces one SSE frame per ~400ms window.
 */
class ChangeHub {
  /**
   * @param {import("./sources.js").ChatSources} sources
   * @param {{watch?:boolean, pollFallbackMs?:number, debounceMs?:number, home?:string}} config
   */
  constructor(sources, config) {
    this.sources = sources;
    this.config = config;
    /** @type {Set<import("node:http").ServerResponse>} */
    this.clients = new Set();
    this.watchers = [];
    this.timers = new Set();
    this.pending = new Map(); // id -> session ref
    this.flushTimer = undefined;
    this.disposed = false;
    this.mode = "idle"; // watch | poll | off
  }

  start() {
    if (!this.config.watch) {
      this.mode = "off";
      return;
    }
    let watching = 0;
    for (const source of SOURCES) {
      const root = source.root(this.config.home ?? this.sources.home);
      if (!existsSync(root)) continue;
      try {
        const w = watch(root, { recursive: true }, () => this.scheduleScan());
        w.on("error", () => this.dropWatcher(w));
        this.watchers.push(w);
        watching += 1;
      } catch {
        // recursive watch unsupported (platform) - poll fallback below
      }
    }
    if (watching > 0) {
      this.mode = "watch";
    } else if ((this.config.pollFallbackMs ?? 0) > 0) {
      this.mode = "poll";
      const t = setInterval(() => this.scanAndBroadcast(), this.config.pollFallbackMs);
      this.timers.add(t);
    } else {
      this.mode = "off";
    }
  }

  dropWatcher(w) {
    this.watchers = this.watchers.filter((x) => x !== w);
    w.close();
    if (this.watchers.length === 0 && !this.disposed && (this.config.pollFallbackMs ?? 0) > 0 && this.mode === "watch") {
      this.mode = "poll";
      const t = setInterval(() => this.scanAndBroadcast(), this.config.pollFallbackMs);
      this.timers.add(t);
    }
  }

  /** Debounced scan trigger from watcher events. */
  scheduleScan() {
    if (this.disposed || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.scanAndBroadcast();
    }, this.config.debounceMs ?? 400);
    this.timers.add(this.flushTimer);
  }

  /** Scan, diff against the cache snapshot, and notify SSE clients. */
  scanAndBroadcast() {
    if (this.disposed) return;
    const before = new Map();
    for (const [file, e] of this.sources.sessionCache) before.set(file, e.mtimeMs + ":" + e.size);
    this.sources.scan();
    const changed = [];
    for (const [file, e] of this.sources.sessionCache) {
      if (before.get(file) !== e.mtimeMs + ":" + e.size) changed.push({ id: e.session.id, source: e.session.source, title: e.session.title });
    }
    for (const [file] of before) if (!this.sources.sessionCache.has(file)) changed.push({ id: "removed:" + file, source: "removed", title: "" });
    if (changed.length > 0) this.broadcast({ type: "changed", changed });
  }

  /** Send one SSE frame to every connected client. */
  broadcast(payload) {
    const frame = "data: " + JSON.stringify(payload) + "\n\n";
    for (const res of [...this.clients]) {
      try {
        res.write(frame);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  /** Admit one SSE response; returns a cleanup fn. */
  addClient(res) {
    this.clients.add(res);
    res.write("retry: 3000\n\n");
    res.write("data: " + JSON.stringify({ type: "hello", mode: this.mode, at: Date.now() }) + "\n\n");
    const beat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        cleanup();
      }
    }, 20_000);
    this.timers.add(beat);
    const cleanup = () => {
      clearInterval(beat);
      this.timers.delete(beat);
      this.clients.delete(res);
    };
    return cleanup;
  }

  dispose() {
    this.disposed = true;
    for (const w of this.watchers) {
      try {
        w.close();
      } catch { /* already closed */ }
    }
    this.watchers = [];
    for (const t of this.timers) clearInterval(t);
    this.timers.clear();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    for (const res of [...this.clients]) {
      try {
        res.end();
      } catch { /* gone */ }
    }
    this.clients.clear();
  }
}

/* ─────────────── route family ─────────────── */

/**
 * Build the route family.
 * @param {{sources: import("./sources.js").ChatSources, config: object}} deps
 */
export function makeRoutes(deps) {
  const { sources, config } = deps;
  const hub = new ChangeHub(sources, config);

  const guard = (req, res) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: "forbidden: loopback-only" });
      return false;
    }
    return true;
  };

  const routes = [
    {
      kind: "exact",
      path: API.status,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        try {
          writeJson(res, 200, { ...sources.status(), mode: hub.mode, recentLiveMs: sources.recentLiveMs });
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },
    {
      kind: "exact",
      path: API.sessions,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        const url = new URL(req.url ?? "/", "http://localhost");
        try {
          const result = sources.listSessions({
            source: query(url, "source"),
            q: query(url, "q"),
            limit: Number(query(url, "limit") ?? 200),
            offset: Number(query(url, "offset") ?? 0),
            liveOnly: query(url, "live") === "1",
          });
          writeJson(res, 200, result);
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },
    {
      kind: "exact",
      path: API.session,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        const url = new URL(req.url ?? "/", "http://localhost");
        const id = query(url, "id");
        if (!id) {
          writeJson(res, 400, { error: "id is required" });
          return;
        }
        const from = Number(query(url, "from") ?? 0);
        try {
          const result = sources.readMessages(id, Number.isFinite(from) ? from : 0);
          if (result.error) writeJson(res, 404, result);
          else writeJson(res, 200, result);
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },
    {
      kind: "exact",
      path: API.events,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
          "referrer-policy": "no-referrer",
        });
        const cleanup = hub.addClient(res);
        req.on("close", cleanup);
        res.on("error", cleanup);
      },
    },
  ];

  return {
    routes,
    hub,
    start: () => hub.start(),
    dispose: () => hub.dispose(),
  };
}
