/**
 * dsh-chat-sync sources: scan + parse local AI CLI conversation stores into
 * one unified session/message model, with byte-offset incremental reads.
 *
 * Sources (all read-only):
 *  - claude : ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl   (Claude Code)
 *  - codex  : ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl (Codex CLI)
 *             + ~/.codex/session_index.jsonl (thread names)
 *  - cursor : ~/.cursor/projects/<encoded-path>/agent-transcripts/<uuid>/<uuid>.jsonl
 *             + Cursor conversation-search.db (titles, via node:sqlite, optional)
 *
 * Session files are append-only JSONL, so reads are incremental: a per-file
 * cache keeps parsed messages plus the byte offset they end at, and callers
 * pass the last `next` offset back to receive only new messages.
 */
import { closeSync, openSync, readSync, readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import os from "node:os";

/** UUID shape used for local ids across sources. */
const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

/** Fallback read chunk when continuing an incremental parse. */
const READ_CHUNK = 512 * 1024;

/** Noise prefixes: local-command echoes / injected context, never a good title. */
const NOISE_PREFIXES = [
  "<command-name>", "<command-message>", "<command-args>", "<local-command-stdout>", "<local-command-stderr>",
  "<system-reminder>", "<app-context>", "<environment_context>", "<user-memory>", "<permissions",
  "<bash", "<ide", "# AGENTS.md", "# Files mentioned", "# Instructions", "~/.ssh", "Caveat:",
];

/** Whether a first-user text is real user prose (vs tooling/injected noise). */
function isRealUserText(text) {
  const t = String(text ?? "").trim();
  if (!t) return false;
  return !NOISE_PREFIXES.some((p) => t.startsWith(p));
}

/** Source metadata (order = UI filter order). */
export const SOURCES = [
  { id: "claude", label: "Claude Code", root: (home) => join(home, ".claude", "projects") },
  { id: "codex", label: "Codex CLI", root: (home) => join(home, ".codex", "sessions") },
  { id: "cursor", label: "Cursor Agent", root: (home) => join(home, ".cursor", "projects") },
];

/* ───────────────────────── small helpers ───────────────────────── */

/** One-line-ify + clamp a string for display. */
function clamp(text, max) {
  const one = String(text ?? "").replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1) + "…" : one;
}

/** Decode an encoded project dir back to a plausible path (best effort). */
function decodeProjectDir(dir) {
  if (!dir) return "";
  const raw = dir.replace(/^-+/, "");
  if (/^Users-/.test(raw) || /^home-/.test(raw)) return "/" + raw.replace(/-/g, "/");
  if (/^[A-Za-z]:-/.test(raw)) return raw.slice(0, 2) + "\\" + raw.slice(3).replace(/-/g, "\\");
  return raw;
}

/** First absolute unix path found in a text blob. */
function extractPath(text) {
  const m = /\/Users\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+/.exec(String(text ?? ""));
  return m ? m[0] : "";
}

/** Safe JSON.parse for one jsonl line. */
function parseLine(line) {
  if (!line) return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** Read up to `bytes` from the head of a file as utf8 text. */
function readHead(file, bytes) {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/** Read bytes [from, to) of a file as a Buffer. */
function readRange(file, from, to) {
  const fd = openSync(file, "r");
  try {
    const len = Math.max(0, to - from);
    const buf = Buffer.alloc(len);
    if (len === 0) return buf;
    const n = readSync(fd, buf, 0, len, from);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

/** readdirSync that tolerates missing dirs. */
function ls(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/* ───────────────────────── node:sqlite (optional) ───────────────────────── */

let DatabaseSync = undefined;
try {
  // Top-level await import; failure (old node / sandbox) just disables titles.
  DatabaseSync = (await import("node:sqlite")).DatabaseSync;
} catch {
  DatabaseSync = undefined;
}

/* ───────────────────────── ChatSources ───────────────────────── */

/**
 * The scanner/parser engine. All methods are synchronous (scan cost is a few
 * hundred stats plus cached head reads) and guarded by per-file caches, so
 * repeated calls are cheap and safe on the host event loop.
 */
export class ChatSources {
  /**
   * @param {object} opts
   * @param {string} [opts.home] home directory override (tests)
   * @param {number} [opts.titleHeadBytes] head bytes read for titles
   * @param {number} [opts.maxMessageChars] per-message text clamp
   * @param {number} [opts.maxSessions] scan result cap
   * @param {number} [opts.recentLiveMs] window marking a session "live"
   */
  constructor(opts = {}) {
    this.home = opts.home || os.homedir();
    this.titleHeadBytes = opts.titleHeadBytes ?? 64 * 1024;
    this.maxMessageChars = opts.maxMessageChars ?? 8000;
    this.maxSessions = opts.maxSessions ?? 500;
    this.recentLiveMs = opts.recentLiveMs ?? 180_000;

    /** @type {Map<string, {mtimeMs:number,size:number,session:object}>} keyed by file path */
    this.sessionCache = new Map();
    /** @type {Map<string, {mtimeMs:number,size:number,offset:number,tail:string,messages:object[],marks:{offset:number,seq:number}[]}>} */
    this.readCache = new Map();
    /** codex thread-name index: {mtimeMs, size, names: Map} */
    this.codexIndex = { mtimeMs: 0, size: 0, names: new Map() };
    /** cursor title db cache: {mtimeMs, titles: Map|null} */
    this.cursorDb = { mtimeMs: 0, titles: null };
    this.scannedAt = 0;
  }

  /* ── public API ── */

  /** Source roots with availability + counts. */
  status() {
    this.scan();
    const counts = { claude: 0, codex: 0, cursor: 0 };
    for (const { session } of this.sessionCache.values()) counts[session.source] += 1;
    return {
      sources: SOURCES.map((s) => ({ id: s.id, label: s.label, root: s.root(this.home), available: existsSync(s.root(this.home)), count: counts[s.id] })),
      scannedAt: this.scannedAt,
      sqlite: Boolean(DatabaseSync),
    };
  }

  /**
   * Scan every source (cached per file by mtime+size). Returns sessions
   * sorted by updatedAt desc, capped at maxSessions.
   * @param {{source?:string,q?:string,limit?:number,offset?:number,liveOnly?:boolean}} [filter]
   */
  listSessions(filter = {}) {
    this.scan();
    const q = (filter.q || "").trim().toLowerCase();
    let all = [...this.sessionCache.values()].map((e) => ({ ...e.session, live: Date.now() - e.session.updatedAt < this.recentLiveMs }));
    if (filter.source && filter.source !== "all") all = all.filter((s) => s.source === filter.source);
    if (filter.liveOnly) all = all.filter((s) => s.live);
    if (q) all = all.filter((s) => s.title.toLowerCase().includes(q) || s.project.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q));
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    const total = all.length;
    const offset = Math.max(0, filter.offset || 0);
    const limit = Math.min(Math.max(1, filter.limit || 200), this.maxSessions);
    return { sessions: all.slice(offset, offset + limit), total, scannedAt: this.scannedAt };
  }

  /** Resolve a session id ("source:localId") to its cache entry (rescans once if unknown). */
  findSession(id) {
    const idx = id.indexOf(":");
    if (idx <= 0) return undefined;
    const source = id.slice(0, idx);
    const localId = id.slice(idx + 1);
    const hit = [...this.sessionCache.values()].find((e) => e.session.source === source && e.session.localId === localId);
    if (hit) return hit;
    this.scan();
    return [...this.sessionCache.values()].find((e) => e.session.source === source && e.session.localId === localId);
  }

  /**
   * Read a session's messages incrementally.
   * @param {string} id session id ("source:localId")
   * @param {number} from last `next` offset the client holds
   * @returns {{session:object,messages:object[],next:number,reset:boolean,count:number}|{error:string}}
   */
  readMessages(id, from) {
    const entry = this.findSession(id);
    if (!entry) return { error: "session not found: " + id };
    const file = entry.session.file;
    let st;
    try {
      st = statSync(file);
    } catch {
      return { error: "session file unreadable" };
    }
    let cache = this.readCache.get(file);
    // Full reset when: no cache, file shrank (rewritten), or mtime changed with no growth.
    if (!cache || st.size < cache.offset || (st.size === cache.offset && st.mtimeMs !== cache.mtimeMs && cache.size !== st.size)) {
      cache = { mtimeMs: st.mtimeMs, size: st.size, offset: 0, tail: "", messages: [], marks: [] };
      this.readCache.set(file, cache);
    }
    // Pull new bytes.
    if (st.size > cache.offset) {
      let cursor = cache.offset;
      while (cursor < st.size) {
        const end = Math.min(cursor + READ_CHUNK, st.size);
        const chunk = readRange(file, cursor, end).toString("utf8");
        cursor = end;
        cache.tail += chunk;
        const lines = cache.tail.split("\n");
        const complete = cache.tail.endsWith("\n") ? lines : lines.slice(0, -1);
        cache.tail = cache.tail.endsWith("\n") ? "" : lines[lines.length - 1] ?? "";
        for (const line of complete) this.parseLineInto(entry.session.source, line, cache);
      }
      cache.offset = st.size;
      cache.size = st.size;
      cache.mtimeMs = st.mtimeMs;
    }
    // Marks: recent (offset -> message count) anchors for incremental slices.
    cache.marks.push({ offset: cache.offset, seq: cache.messages.length });
    if (cache.marks.length > 32) cache.marks.shift();

    const fromOffset = Number.isFinite(from) && from > 0 ? from : 0;
    let startSeq = 0;
    let reset = true;
    if (fromOffset > 0 && fromOffset <= cache.offset) {
      let mark = cache.marks[0];
      for (const m of cache.marks) if (m.offset <= fromOffset) mark = m;
      if (mark && mark.offset === fromOffset) {
        startSeq = mark.seq;
        reset = false;
      } else {
        // Unknown anchor (stale client): full payload, explicit reset.
        startSeq = 0;
        reset = true;
      }
    }
    // Trim memory: keep at most the last 4000 parsed messages per file.
    if (cache.messages.length > 4000) cache.messages.splice(0, cache.messages.length - 4000);
    this.evictReadCache();
    return {
      session: { ...entry.session, updatedAt: st.mtimeMs, size: st.size },
      messages: cache.messages.slice(startSeq).map((m) => ({ ...m })),
      next: cache.offset,
      reset,
      count: cache.messages.length,
    };
  }

  /** Keep the read cache bounded (LRU-ish by insertion order + size). */
  evictReadCache() {
    if (this.readCache.size <= 64) return;
    const keys = [...this.readCache.keys()];
    for (const k of keys.slice(0, this.readCache.size - 64)) this.readCache.delete(k);
  }

  /* ── scanning ── */

  /** Scan all sources, refreshing the session cache. */
  scan() {
    const seen = new Set();
    for (const source of SOURCES) {
      const root = source.root(this.home);
      const files = source.id === "claude" ? this.scanClaude(root)
        : source.id === "codex" ? this.scanCodex(root)
        : this.scanCursor(root);
      for (const file of files) {
        seen.add(file);
        let st;
        try {
          st = statSync(file);
        } catch {
          continue;
        }
        if (!st.isFile() || st.size === 0) continue;
        const prev = this.sessionCache.get(file);
        if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) continue;
        const head = this.head(source.id, file, st);
        this.sessionCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, session: head });
      }
    }
    // Drop vanished files.
    for (const file of [...this.sessionCache.keys()]) if (!seen.has(file)) this.sessionCache.delete(file);
    this.scannedAt = Date.now();
  }

  /** Claude: projects/<encoded>/<sessionId>.jsonl */
  scanClaude(root) {
    const out = [];
    for (const proj of ls(root)) {
      if (!proj.isDirectory()) continue;
      for (const f of ls(join(root, proj.name))) {
        if (f.isFile() && f.name.endsWith(".jsonl")) out.push(join(root, proj.name, f.name));
      }
    }
    return out;
  }

  /** Codex: sessions/YYYY/MM/DD/rollout-*.jsonl */
  scanCodex(root) {
    const out = [];
    for (const y of ls(root)) {
      if (!y.isDirectory()) continue;
      for (const mo of ls(join(root, y.name))) {
        if (!mo.isDirectory()) continue;
        for (const d of ls(join(root, y.name, mo.name))) {
          if (!d.isDirectory()) continue;
          const dayDir = join(root, y.name, mo.name, d.name);
          for (const f of ls(dayDir)) {
            if (f.isFile() && f.name.startsWith("rollout-") && f.name.endsWith(".jsonl")) out.push(join(dayDir, f.name));
          }
        }
      }
    }
    return out;
  }

  /** Cursor: projects/<encoded>/agent-transcripts/<uuid>/<uuid>.jsonl */
  scanCursor(root) {
    const out = [];
    for (const proj of ls(root)) {
      if (!proj.isDirectory()) continue;
      const tDir = join(root, proj.name, "agent-transcripts");
      for (const u of ls(tDir)) {
        if (!u.isDirectory()) continue;
        const f = join(tDir, u.name, u.name + ".jsonl");
        try {
          if (statSync(f).isFile()) out.push(f);
        } catch {
          /* renamed mid-scan */
        }
      }
    }
    return out;
  }

  /** Build the session summary from a head read (title, project, startedAt). */
  head(source, file, st) {
    const text = readHead(file, this.titleHeadBytes);
    const lines = text.split("\n");
    if (source === "claude") return this.headClaude(file, st, lines);
    if (source === "codex") return this.headCodex(file, st, lines);
    return this.headCursor(file, st, lines);
  }

  /** Claude head: ai-title/summary + first real user message + cwd. */
  headClaude(file, st, lines) {
    let title = "";
    let cwd = "";
    let startedAt;
    let firstUser = "";
    for (const line of lines) {
      const o = parseLine(line);
      if (!o) continue;
      if (o.type === "ai-title" && o.aiTitle) title = String(o.aiTitle);
      else if (o.type === "summary" && o.summary) title = title || String(o.summary);
      else if (!cwd && o.cwd) cwd = String(o.cwd);
      if (!startedAt && o.timestamp) startedAt = Date.parse(o.timestamp) || undefined;
      if (o.type === "user" && !o.isMeta && !o.isSidechain) {
        const msg = o.message;
        let text = "";
        if (typeof msg?.content === "string") text = msg.content;
        else if (Array.isArray(msg?.content)) {
          text = msg.content.filter((b) => b?.type === "text").map((b) => b.text).join(" ");
        }
        if (isRealUserText(text)) {
          firstUser = text;
          break;
        }
      }
    }
    const uuid = UUID_RE.exec(basename(file))?.[0] || basename(file, ".jsonl");
    return {
      id: "claude:" + uuid,
      localId: uuid,
      source: "claude",
      title: clamp(title || firstUser || "未命名会话", 90),
      project: cwd ? basename(cwd) : "claude",
      cwd,
      file,
      startedAt: startedAt || st.birthtimeMs || st.mtimeMs,
      updatedAt: st.mtimeMs,
      size: st.size,
    };
  }

  /** Codex head: session_meta (cwd, ts) + index thread name + first input. */
  headCodex(file, st, lines) {
    let cwd = "";
    let startedAt;
    let firstUser = "";
    for (const line of lines) {
      const o = parseLine(line);
      if (!o) continue;
      if (o.type === "session_meta") {
        cwd = o.payload?.cwd || cwd;
        startedAt = Date.parse(o.payload?.timestamp || "") || startedAt;
      }
      if (o.type === "response_item" && o.payload?.type === "message" && o.payload.role === "user") {
        const text = (o.payload.content || []).filter((c) => c?.type === "input_text").map((c) => c.text).join(" ");
        if (isRealUserText(text)) {
          firstUser = text;
          break;
        }
      }
    }
    const uuid = UUID_RE.exec(basename(file))?.[0] || basename(file, ".jsonl");
    const name = this.codexThreadNames().get(uuid) || "";
    return {
      id: "codex:" + uuid,
      localId: uuid,
      source: "codex",
      title: clamp(name || firstUser || "未命名会话", 90),
      project: cwd ? basename(cwd) : "codex",
      cwd,
      file,
      startedAt: startedAt || st.birthtimeMs || st.mtimeMs,
      updatedAt: st.mtimeMs,
      size: st.size,
    };
  }

  /** Cursor head: first user message (+ db title, + cwd from a shell path). */
  headCursor(file, st, lines) {
    let firstUser = "";
    let blob = "";
    for (const line of lines) {
      const o = parseLine(line);
      if (!o) continue;
      blob += line;
      if (o.role === "user") {
        const blocks = o.message?.content;
        if (Array.isArray(blocks)) firstUser = blocks.filter((b) => b?.type === "text").map((b) => b.text).join(" ");
        if (firstUser) break;
      }
    }
    const uuid = basename(file, ".jsonl");
    const projDir = file.split("/agent-transcripts/")[0]?.split("/").pop() || "cursor";
    const inner = /<user_query>([\s\S]*?)<\/user_query>/.exec(firstUser)?.[1] || firstUser;
    const title = this.cursorTitle(uuid) || inner;
    const cwd = extractPath(blob) || decodeProjectDir(projDir);
    return {
      id: "cursor:" + uuid,
      localId: uuid,
      source: "cursor",
      title: clamp(title || "未命名会话", 90),
      project: cwd ? basename(cwd) : projDir,
      cwd,
      file,
      startedAt: st.birthtimeMs || st.mtimeMs,
      updatedAt: st.mtimeMs,
      size: st.size,
    };
  }

  /* ── per-source title indexes ── */

  /** id -> thread_name from ~/.codex/session_index.jsonl (tail refresh). */
  codexThreadNames() {
    const file = join(this.home, ".codex", "session_index.jsonl");
    try {
      const st = statSync(file);
      if (st.mtimeMs === this.codexIndex.mtimeMs && st.size === this.codexIndex.size) return this.codexIndex.names;
      const names = new Map();
      // Index is append-mostly; reading the whole file is fine (small), tail
      // entries win so later updates overwrite earlier ones.
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const o = parseLine(line);
        if (o?.id && typeof o.thread_name === "string") names.set(o.id, o.thread_name);
      }
      this.codexIndex = { mtimeMs: st.mtimeMs, size: st.size, names };
      return names;
    } catch {
      return this.codexIndex.names;
    }
  }

  /** Cursor conversation title from conversation-search.db (refresh on db mtime). */
  cursorTitle(uuid) {
    const dbPath = join(this.home, "Library", "Application Support", "Cursor", "User", "globalStorage", "conversation-search.db");
    if (!DatabaseSync) return "";
    try {
      const st = statSync(dbPath);
      if (this.cursorDb.titles === null || st.mtimeMs !== this.cursorDb.mtimeMs) {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        try {
          const rows = db.prepare("select id, title from conversations where source = 'local'").all();
          const titles = new Map();
          for (const r of rows) if (r.title) titles.set(r.id, r.title);
          this.cursorDb = { mtimeMs: st.mtimeMs, titles };
        } finally {
          db.close();
        }
      }
      return this.cursorDb.titles.get(uuid) || "";
    } catch {
      return "";
    }
  }

  /* ── line parsers (append into readCache) ── */

  /** Dispatch one raw jsonl line to the source parser. */
  parseLineInto(source, line, cache) {
    const o = parseLine(line);
    if (!o) return;
    const push = (msg) => {
      if (!msg) return;
      msg.seq = cache.messages.length;
      msg.text = clamp(msg.text ?? "", this.maxMessageChars);
      cache.messages.push(msg);
    };
    if (source === "claude") this.parseClaude(o, push);
    else if (source === "codex") this.parseCodex(o, push);
    else this.parseCursor(o, push);
  }

  /** Claude Code line -> messages. */
  parseClaude(o, push) {
    const ts = o.timestamp ? Date.parse(o.timestamp) || undefined : undefined;
    if (o.type === "user" && !o.isMeta) {
      const content = o.message?.content;
      if (typeof content === "string") {
        if (content.trim()) push({ role: "user", text: content, ts });
      } else if (Array.isArray(content)) {
        const texts = content.filter((b) => b?.type === "text").map((b) => b.text).join("\n");
        if (texts.trim()) push({ role: "user", text: texts, ts });
        for (const b of content) {
          if (b?.type !== "tool_result") continue;
          const rc = typeof b.content === "string" ? b.content
            : Array.isArray(b.content) ? b.content.filter((c) => c?.type === "text").map((c) => c.text).join("\n") : "";
          push({ role: "tool", text: rc, toolUseId: b.tool_use_id, isError: Boolean(b.is_error), ts });
        }
      }
    } else if (o.type === "assistant") {
      const blocks = o.message?.content;
      if (!Array.isArray(blocks)) return;
      const texts = blocks.filter((b) => b?.type === "text").map((b) => b.text).join("\n");
      const tools = blocks.filter((b) => b?.type === "tool_use").map((b) => ({ name: b.name, input: clamp(JSON.stringify(b.input ?? {}), 240) }));
      if (texts.trim() || tools.length) {
        push({ role: "assistant", text: texts, toolUses: tools.length ? tools : undefined, model: o.message?.model, ts });
      }
    } else if (o.type === "system") {
      const text = typeof o.content === "string" ? o.content : o.subtype ? "[" + o.subtype + "]" : "";
      if (text.trim()) push({ role: "system", text, ts });
    }
    // ai-title / mode / attachment / file-history-* / queue-operation: ignored here.
  }

  /** Codex CLI line -> messages. */
  parseCodex(o, push) {
    if (o.type !== "response_item") return; // session_meta captured in head; event_msg dedupes
    const p = o.payload;
    if (!p) return;
    const ts = o.timestamp ? Date.parse(o.timestamp) || undefined : undefined;
    if (p.type === "message") {
      const text = (p.content || []).filter((c) => c?.type === "input_text" || c?.type === "output_text").map((c) => c.text).join("\n");
      if (text.trim()) push({ role: p.role === "user" ? "user" : "assistant", text, ts });
    } else if (p.type === "function_call") {
      push({ role: "tool", text: p.output || p.arguments || "", name: p.name, ts });
    }
  }

  /** Cursor Agent transcript line -> messages. */
  parseCursor(o, push) {
    const role = o.role;
    if (role !== "user" && role !== "assistant") return; // turn_ended etc.
    const blocks = o.message?.content;
    if (!Array.isArray(blocks)) return;
    const texts = [];
    const tools = [];
    for (const b of blocks) {
      if (b?.type === "text") texts.push(b.text);
      else if (b?.type === "tool_use") tools.push({ name: b.name, input: clamp(JSON.stringify(b.input ?? {}), 240) });
      else if (b?.type === "tool_result") {
        const rc = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.filter((c) => c?.type === "text").map((c) => c.text).join("\n") : "";
        push({ role: "tool", text: rc, toolUseId: b.tool_use_id, ts: undefined });
      }
    }
    let text = texts.join("\n");
    if (role === "user") text = /<user_query>([\s\S]*?)<\/user_query>/.exec(text)?.[1] || text.replace(/<timestamp>[^<]*<\/timestamp>/, "").trim();
    if (text.trim() || tools.length) {
      push({ role, text, toolUses: tools.length ? tools : undefined, ts: undefined });
    }
  }
}
