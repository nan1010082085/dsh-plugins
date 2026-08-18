/**
 * dsh-mcp-sync routes: the /api/dsh-mcp-sync family.
 *
 *   GET    /api/dsh-mcp-sync/status    source availability + counts
 *   GET    /api/dsh-mcp-sync/servers   deduped MCP server list
 *   GET    /api/dsh-mcp-sync/config    raw config from each source
 *   GET    /api/dsh-mcp-sync/custom    list custom MCP servers
 *   POST   /api/dsh-mcp-sync/custom    add custom MCP server
 *   DELETE /api/dsh-mcp-sync/custom    delete custom MCP server
 *
 * Every route is loopback-only: MCP configs may contain secrets.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const API = {
  status: "/api/dsh-mcp-sync/status",
  servers: "/api/dsh-mcp-sync/servers",
  config: "/api/dsh-mcp-sync/config",
  custom: "/api/dsh-mcp-sync/custom",
};

/* ─────────────── loopback trust fence ─────────────── */

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

/** Read POST body as JSON. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/* ─────────────── custom MCP storage ─────────────── */

/**
 * Custom MCP servers are stored in ~/.dsh/mcp-sync/custom.json
 * Format: { "server-name": { type, command, args, env, url }, ... }
 */
function getCustomPath(home) {
  return join(home, ".dsh", "mcp-sync", "custom.json");
}

function readCustomServers(home) {
  const path = getCustomPath(home);
  try {
    const content = readFileSync(path, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function writeCustomServers(home, servers) {
  const path = getCustomPath(home);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(servers, null, 2), "utf8");
}

/* ─────────────── route family ─────────────── */

/**
 * Build the route family.
 * @param {{sources: import("./sources.js").McpSources, config: object}} deps
 */
export function makeRoutes(deps) {
  const { sources, config } = deps;

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
          writeJson(res, 200, sources.status());
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },
    {
      kind: "exact",
      path: API.servers,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        try {
          const url = new URL(req.url ?? "/", "http://localhost");
          const source = query(url, "source");
          const result = sources.scan();

          // Add custom servers
          const customServers = readCustomServers(sources.home);
          const customList = Object.entries(customServers).map(([name, cfg]) => ({
            name,
            source: "custom",
            type: cfg.type || "stdio",
            command: cfg.command || "",
            args: Array.isArray(cfg.args) ? cfg.args : [],
            env: cfg.env || {},
            url: cfg.url || "",
            fingerprint: cfg.type === "stdio"
              ? `${cfg.command} ${(cfg.args || []).join(" ")}`
              : cfg.url || "",
          }));

          // Merge with scanned servers
          result.servers = [...result.servers, ...customList];
          result.bySource.custom = customList.length;
          result.total = result.servers.length;

          // Dedup custom servers too
          if (sources.dedupeByCommand) {
            result.servers = sources.dedupeServers(result.servers);
            result.total = result.servers.length;
          }

          // Filter by source if requested
          if (source && source !== "all") {
            result.servers = result.servers.filter((s) =>
              s.source === source || (s.sources && s.sources.includes(source))
            );
            result.total = result.servers.length;
          }

          writeJson(res, 200, result);
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },
    {
      kind: "exact",
      path: API.config,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        try {
          const url = new URL(req.url ?? "/", "http://localhost");
          const source = query(url, "source");

          const configs = {};
          for (const src of ["claude", "codex", "cursor"]) {
            if (source && source !== "all" && source !== src) continue;
            const configPath = src === "codex"
              ? join(sources.home, ".codex", "config.toml")
              : src === "claude"
                ? join(sources.home, ".claude", "claude_desktop_config.json")
                : join(sources.home, ".cursor", "mcp.json");

            try {
              const content = readFileSync(configPath, "utf8");
              configs[src] = { path: configPath, content };
            } catch {
              configs[src] = { path: configPath, content: null, error: "file not found" };
            }
          }

          // Include custom config
          if (!source || source === "all" || source === "custom") {
            const customPath = getCustomPath(sources.home);
            try {
              const content = readFileSync(customPath, "utf8");
              configs.custom = { path: customPath, content };
            } catch {
              configs.custom = { path: customPath, content: "{}" };
            }
          }

          writeJson(res, 200, configs);
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },
    {
      kind: "exact",
      path: API.custom,
      handler: async (req, res) => {
        if (!guard(req, res)) return;

        try {
          if (req.method === "GET") {
            const servers = readCustomServers(sources.home);
            writeJson(res, 200, { servers });
          } else if (req.method === "POST") {
            const body = await readBody(req);
            if (!body.name || !body.config) {
              writeJson(res, 400, { error: "name and config are required" });
              return;
            }

            const servers = readCustomServers(sources.home);
            servers[body.name] = body.config;
            writeCustomServers(sources.home, servers);
            writeJson(res, 200, { ok: true, name: body.name });
          } else if (req.method === "DELETE") {
            const url = new URL(req.url ?? "/", "http://localhost");
            const name = query(url, "name");
            if (!name) {
              writeJson(res, 400, { error: "name is required" });
              return;
            }

            const servers = readCustomServers(sources.home);
            if (!(name in servers)) {
              writeJson(res, 404, { error: "not found" });
              return;
            }

            delete servers[name];
            writeCustomServers(sources.home, servers);
            writeJson(res, 200, { ok: true });
          } else {
            writeJson(res, 405, { error: "method not allowed" });
          }
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },
  ];

  return { routes };
}
