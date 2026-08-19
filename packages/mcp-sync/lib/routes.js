/**
 * dsh-mcp-sync routes: the /api/dsh-mcp-sync family.
 *
 * 统一 MCP 管理 API：
 *   GET    /api/dsh-mcp-sync/registry        列出所有注册的 MCP 服务器
 *   POST   /api/dsh-mcp-sync/registry        添加/更新 MCP 服务器
 *   DELETE /api/dsh-mcp-sync/registry        删除 MCP 服务器
 *   POST   /api/dsh-mcp-sync/sync            从各来源同步到注册表
 *   GET    /api/dsh-mcp-sync/sources         查看各来源配置（只读）
 *   GET    /api/dsh-mcp-sync/connections     MCP 连接状态
 *   POST   /api/dsh-mcp-sync/connect         连接到 MCP 服务器
 *   POST   /api/dsh-mcp-sync/disconnect      断开连接
 *   GET    /api/dsh-mcp-sync/tools           列出所有已发现的 MCP 工具
 *   POST   /api/dsh-mcp-sync/call            调用 MCP 工具
 *   GET    /api/dsh-mcp-sync/stats           获取统计信息
 *   POST   /api/dsh-mcp-sync/reconnect       重新连接失败的服务器
 *   GET    /api/dsh-mcp-sync/health          健康检查
 */
import { loadRegistry, upsertServer, removeServer, listServers, importServers } from "./registry.js";

const API = {
  registry: "/api/dsh-mcp-sync/registry",
  sync: "/api/dsh-mcp-sync/sync",
  sources: "/api/dsh-mcp-sync/sources",
  connections: "/api/dsh-mcp-sync/connections",
  connect: "/api/dsh-mcp-sync/connect",
  disconnect: "/api/dsh-mcp-sync/disconnect",
  tools: "/api/dsh-mcp-sync/tools",
  call: "/api/dsh-mcp-sync/call",
  stats: "/api/dsh-mcp-sync/stats",
  reconnect: "/api/dsh-mcp-sync/reconnect",
  health: "/api/dsh-mcp-sync/health",
};

/* ─────────────── loopback trust fence ─────────────── */

function isIPv4Loopback(v4) {
  const parts = v4.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((p) => /^d{1,3}$/.test(p) && Number(p) <= 255);
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

/* ─────────────── route family ─────────────── */

/**
 * Build the route family.
 * @param {{sources: object, config: object, clientManager: object}} deps
 */
export function makeRoutes(deps) {
  const { sources, config, clientManager } = deps;
  const home = deps.home || undefined;
  const startTime = Date.now();

  const guard = (req, res) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: "forbidden: loopback-only" });
      return false;
    }
    return true;
  };

  const routes = [
    /* ── /registry - MCP 服务器注册表（GET/POST/DELETE） ── */
    {
      kind: "exact",
      path: API.registry,
      handler: async (req, res) => {
        if (!guard(req, res)) return;
        try {
          if (req.method === "GET") {
            const servers = listServers(home);
            writeJson(res, 200, { servers, total: servers.length });
          } else if (req.method === "POST") {
            const body = await readBody(req);
            if (!body.name || !body.config) {
              writeJson(res, 400, { error: "name and config are required" });
              return;
            }
            const result = upsertServer(body.name, body.config, home);
            writeJson(res, 200, result);
          } else if (req.method === "DELETE") {
            const url = new URL(req.url ?? "/", "http://localhost");
            const name = query(url, "name");
            if (!name) {
              writeJson(res, 400, { error: "name is required" });
              return;
            }
            const result = removeServer(name, home);
            writeJson(res, 200, result);
          } else {
            writeJson(res, 405, { error: "Method Not Allowed" });
          }
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── POST /sync - 从各来源同步到注册表 ── */
    {
      kind: "exact",
      path: API.sync,
      handler: async (req, res) => {
        if (req.method !== "POST" || !guard(req, res)) return;
        try {
          const scanResult = sources.scan();
          const importResult = importServers(scanResult.servers || [], home);
          
          writeJson(res, 200, {
            ok: true,
            scanned: scanResult.servers?.length || 0,
            imported: importResult.imported,
            skipped: importResult.skipped,
            bySource: scanResult.bySource,
          });
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── GET /sources - 查看各来源配置（只读） ── */
    {
      kind: "exact",
      path: API.sources,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        try {
          const result = sources.scan();
          writeJson(res, 200, result);
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── GET /connections - MCP 连接状态 ── */
    {
      kind: "exact",
      path: API.connections,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        try {
          const status = clientManager.getStatus();
          const servers = clientManager.listServers();
          writeJson(res, 200, { status, servers });
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── POST /connect - 连接到 MCP 服务器 ── */
    {
      kind: "exact",
      path: API.connect,
      handler: async (req, res) => {
        if (req.method !== "POST" || !guard(req, res)) return;
        try {
          const body = await readBody(req);
          if (!body.name) {
            writeJson(res, 400, { error: "name is required" });
            return;
          }
          
          const registry = loadRegistry(home);
          const serverConfig = registry[body.name];
          if (!serverConfig) {
            writeJson(res, 404, { error: "server not found in registry" });
            return;
          }
          
          const result = await clientManager.connect(body.name, serverConfig);
          writeJson(res, 200, result);
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── POST /disconnect - 断开连接 ── */
    {
      kind: "exact",
      path: API.disconnect,
      handler: async (req, res) => {
        if (req.method !== "POST" || !guard(req, res)) return;
        try {
          const body = await readBody(req);
          if (!body.name) {
            writeJson(res, 400, { error: "name is required" });
            return;
          }
          await clientManager.disconnect(body.name);
          writeJson(res, 200, { ok: true });
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── GET /tools - 列出所有已发现的 MCP 工具 ── */
    {
      kind: "exact",
      path: API.tools,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        try {
          const servers = clientManager.listServers();
          writeJson(res, 200, servers);
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── POST /call - 调用 MCP 工具 ── */
    {
      kind: "exact",
      path: API.call,
      handler: async (req, res) => {
        if (req.method !== "POST" || !guard(req, res)) return;
        try {
          const body = await readBody(req);
          if (!body.server || !body.tool) {
            writeJson(res, 400, { error: "server and tool are required" });
            return;
          }
          const result = await clientManager.callTool(body.server, body.tool, body.args || {});
          writeJson(res, 200, result);
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── GET /stats - 获取统计信息 ── */
    {
      kind: "exact",
      path: API.stats,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        try {
          const stats = clientManager.getStats();
          const status = clientManager.getStatus();
          const uptime = Date.now() - startTime;
          
          writeJson(res, 200, {
            stats,
            status,
            uptime,
            uptimeFormatted: formatUptime(uptime),
          });
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── POST /reconnect - 重新连接失败的服务器 ── */
    {
      kind: "exact",
      path: API.reconnect,
      handler: async (req, res) => {
        if (req.method !== "POST" || !guard(req, res)) return;
        try {
          const body = await readBody(req);
          if (!body.name) {
            writeJson(res, 400, { error: "name is required" });
            return;
          }
          
          const result = await clientManager.reconnect(body.name);
          writeJson(res, 200, { ok: result });
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },

    /* ── GET /health - 健康检查 ── */
    {
      kind: "exact",
      path: API.health,
      handler: (req, res) => {
        if (req.method !== "GET" || !guard(req, res)) return;
        try {
          const status = clientManager.getStatus();
          const stats = clientManager.getStats();
          const uptime = Date.now() - startTime;
          
          const health = {
            status: "ok",
            uptime,
            uptimeFormatted: formatUptime(uptime),
            connections: status,
            stats: {
              totalConnections: stats.totalConnections,
              successfulConnections: stats.successfulConnections,
              failedConnections: stats.failedConnections,
              totalCalls: stats.totalCalls,
              successfulCalls: stats.successfulCalls,
              failedCalls: stats.failedCalls,
            },
            successRate: stats.totalConnections > 0 
              ? Math.round((stats.successfulConnections / stats.totalConnections) * 100) 
              : 0,
            callSuccessRate: stats.totalCalls > 0 
              ? Math.round((stats.successfulCalls / stats.totalCalls) * 100) 
              : 0,
          };
          
          writeJson(res, 200, health);
        } catch (error) {
          writeJson(res, 500, { error: String(error?.message || error) });
        }
      },
    },
  ];

  return { routes };
}

/* ─────────────── helpers ─────────────── */

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}