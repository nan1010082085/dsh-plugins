/**
 * dsh-mcp-sync sources: scan and parse MCP configurations from
 * Claude Code, Codex CLI, and Cursor Agent.
 *
 * Config locations:
 *  - Claude: ~/.claude/claude_desktop_config.json
 *  - Cursor: ~/.cursor/mcp.json
 *  - Codex:  ~/.codex/config.toml (mcp_servers section)
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

/** Source metadata. */
export const SOURCES = [
  { id: "claude", label: "Claude Code", configPath: (home) => join(home, ".claude", "claude_desktop_config.json") },
  { id: "cursor", label: "Cursor Agent", configPath: (home) => join(home, ".cursor", "mcp.json") },
  { id: "codex", label: "Codex CLI", configPath: (home) => join(home, ".codex", "config.toml") },
];

/* ───────────────────────── small helpers ───────────────────────── */

/** Safe JSON.parse. */
function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Parse TOML (simple key-value and sections only). */
function parseToml(text) {
  const result = {};
  let currentSection = result;
  let currentPath = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Section header [a.b.c]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const parts = sectionMatch[1].split(".");
      currentPath = parts;
      currentSection = result;
      for (const part of parts) {
        if (!currentSection[part]) currentSection[part] = {};
        currentSection = currentSection[part];
      }
      continue;
    }

    // Key-value pair
    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      currentSection[key] = parseTomlValue(value.trim());
      continue;
    }

    // Array of strings (for args)
    const arrayMatch = trimmed.match(/^(\w+)\s*=\s*\[(.*)\]$/);
    if (arrayMatch) {
      const [, key, content] = arrayMatch;
      currentSection[key] = parseTomlArray(content);
    }
  }

  return result;
}

/** Parse a TOML value (string, number, boolean, inline array). */
function parseTomlValue(value) {
  // String
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  // Boolean
  if (value === "true") return true;
  if (value === "false") return false;
  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;
  // Inline array [...]
  if (value.startsWith("[") && value.endsWith("]")) {
    return parseTomlArray(value.slice(1, -1));
  }
  return value;
}

/** Parse TOML array content. */
function parseTomlArray(content) {
  if (!content.trim()) return [];
  return content.split(",").map((item) => {
    const trimmed = item.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }).filter(Boolean);
}

/** Read file safely. */
function readFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Get file mtime. */
function getFileMtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** Normalize MCP server config to a common format. */
function normalizeServer(name, config, source) {
  if (!config || typeof config !== "object") return null;

  const type = config.type || "stdio";
  const command = config.command || "";
  const args = Array.isArray(config.args) ? config.args : [];
  const env = config.env && typeof config.env === "object" ? config.env : {};
  const url = config.url || config.baseURL || "";

  return {
    name,
    source,
    type,
    command,
    args,
    env,
    url,
    // Fingerprint for dedup
    fingerprint: type === "stdio"
      ? `${command} ${args.join(" ")}`
      : url,
  };
}

/* ───────────────────────── McpSources ───────────────────────── */

/**
 * The scanner engine for MCP configurations.
 */
export class McpSources {
  /**
   * @param {object} opts
   * @param {string} [opts.home] home directory override
   * @param {object} [opts.sources] which sources to scan
   * @param {boolean} [opts.dedupeByCommand] deduplicate by command+args
   */
  constructor(opts = {}) {
    this.home = opts.home || os.homedir();
    this.sources = opts.sources || { claude: true, codex: true, cursor: true };
    this.dedupeByCommand = opts.dedupeByCommand ?? true;

    /** @type {Map<string, {mtimeMs: number, servers: object[]}>} keyed by source id */
    this.cache = new Map();
    this.scannedAt = 0;
  }

  /* ── public API ── */

  /** Scan all sources and return deduped MCP servers. */
  scan() {
    const all = [];
    const timestamps = {};

    for (const source of SOURCES) {
      if (!this.sources[source.id]) continue;

      const configPath = source.configPath(this.home);
      const mtime = getFileMtime(configPath);
      const cached = this.cache.get(source.id);

      // Use cache if file unchanged
      if (cached && cached.mtimeMs === mtime) {
        all.push(...cached.servers);
        timestamps[source.id] = mtime;
        continue;
      }

      // Parse config
      const servers = this.parseSource(source.id, configPath);
      this.cache.set(source.id, { mtimeMs: mtime, servers });
      all.push(...servers);
      timestamps[source.id] = mtime;
    }

    this.scannedAt = Date.now();

    // Dedup
    const deduped = this.dedupeByCommand ? this.dedupeServers(all) : all;

    return {
      servers: deduped,
      total: deduped.length,
      bySource: {
        claude: all.filter((s) => s.source === "claude").length,
        codex: all.filter((s) => s.source === "codex").length,
        cursor: all.filter((s) => s.source === "cursor").length,
      },
      timestamps,
      scannedAt: this.scannedAt,
    };
  }

  /** Get status without full scan. */
  status() {
    const result = { sources: [] };
    for (const source of SOURCES) {
      const configPath = source.configPath(this.home);
      const exists = existsSync(configPath);
      const cached = this.cache.get(source.id);
      result.sources.push({
        id: source.id,
        label: source.label,
        path: configPath,
        available: exists,
        serverCount: cached?.servers.length || 0,
        lastSync: cached?.mtimeMs || 0,
      });
    }
    result.scannedAt = this.scannedAt;
    return result;
  }

  /* ── parsing ── */

  /** Parse a source's MCP config file. */
  parseSource(sourceId, configPath) {
    const content = readFile(configPath);
    if (!content) return [];

    if (sourceId === "codex") {
      return this.parseCodexConfig(content);
    }
    return this.parseJsonConfig(content, sourceId);
  }

  /** Parse JSON config (Claude, Cursor). */
  parseJsonConfig(content, source) {
    const config = parseJSON(content);
    if (!config || typeof config.mcpServers !== "object") return [];

    const servers = [];
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const normalized = normalizeServer(name, serverConfig, source);
      if (normalized) servers.push(normalized);
    }
    return servers;
  }

  /** Parse Codex TOML config. */
  parseCodexConfig(content) {
    const config = parseToml(content);
    if (!config.mcp_servers || typeof config.mcp_servers !== "object") return [];

    const servers = [];
    for (const [name, serverConfig] of Object.entries(config.mcp_servers)) {
      if (typeof serverConfig !== "object") continue;
      const normalized = normalizeServer(name, serverConfig, "codex");
      if (normalized) servers.push(normalized);
    }
    return servers;
  }

  /* ── dedup ── */

  /** Deduplicate servers by fingerprint (command+args or url). */
  dedupeServers(servers) {
    if (!this.dedupeByCommand) return servers;

    const seen = new Map();
    for (const server of servers) {
      const key = server.fingerprint;
      if (!seen.has(key)) {
        seen.set(key, { ...server, sources: [server.source] });
      } else {
        // Merge sources
        const existing = seen.get(key);
        if (!existing.sources.includes(server.source)) {
          existing.sources.push(server.source);
        }
      }
    }
    return Array.from(seen.values());
  }
}
