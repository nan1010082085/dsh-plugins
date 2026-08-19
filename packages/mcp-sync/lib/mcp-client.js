/**
 * dsh-mcp-sync MCP client manager.
 *
 * Manages persistent connections to MCP servers via stdio/SSE transports.
 * Each server gets a Client instance that handles the MCP protocol lifecycle:
 * initialize → tools/list → tools/call → close.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Connection states.
 * @enum {string}
 */
export const ConnectionState = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
};

/**
 * Manages MCP server connections and tool discovery.
 */
export class McpClientManager {
  /**
   * @param {object} opts
   * @param {function} opts.logger - logging function (level, msg)
   * @param {number} [opts.callTimeoutMs=30000] - default tool call timeout
   */
  constructor(opts = {}) {
    /** @type {Map<string, {client: Client, transport: object, tools: object[], state: string, error: string|null, connectedAt: number, config: object}>} */
    this.connections = new Map();
    this.logger = opts.logger || (() => {});
    this.callTimeoutMs = opts.callTimeoutMs || 30000;
  }

  /* ── public API ── */

  /**
   * Connect to an MCP server.
   * @param {string} id - unique server id
   * @param {object} serverConfig - MCP server config {type, command, args, env, url}
   * @returns {Promise<{ok: boolean, tools: object[], error?: string}>}
   */
  async connect(id, serverConfig) {
    const existing = this.connections.get(id);
    if (existing?.state === ConnectionState.CONNECTED) {
      return { ok: true, tools: existing.tools };
    }

    // If in error state, disconnect first
    if (existing?.state === ConnectionState.ERROR) {
      await this.disconnect(id);
    }

    this._setState(id, ConnectionState.CONNECTING);
    this.logger("info", `[mcp-client] connecting to ${id} | type=${serverConfig.type || "stdio"}`);

    try {
      const transport = this._createTransport(serverConfig);
      const client = new Client(
        { name: "dsh-mcp-sync", version: "1.0.0" },
        { capabilities: { tools: {} } }
      );

      await client.connect(transport);

      // Discover tools
      const toolsResult = await client.listTools();
      const tools = (toolsResult.tools || []).map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema || { type: "object", properties: {} },
        annotations: t.annotations || {},
      }));

      this.connections.set(id, {
        client,
        transport,
        tools,
        state: ConnectionState.CONNECTED,
        error: null,
        connectedAt: Date.now(),
        config: serverConfig,
      });

      this.logger("info", `[mcp-client] connected to ${id} | tools=${tools.length}`);
      return { ok: true, tools };
    } catch (error) {
      const msg = String(error?.message || error);
      this._setState(id, ConnectionState.ERROR, msg);
      this.logger("warn", `[mcp-client] failed to connect to ${id}: ${msg}`);
      return { ok: false, tools: [], error: msg };
    }
  }

  /**
   * Disconnect from an MCP server.
   * @param {string} id
   */
  async disconnect(id) {
    const conn = this.connections.get(id);
    if (!conn) return;

    try {
      if (conn.client) {
        await conn.client.close();
      }
    } catch {
      // ignore close errors
    }

    this.connections.delete(id);
    this.logger("info", `[mcp-client] disconnected from ${id}`);
  }

  /**
   * Disconnect from all servers.
   */
  async disconnectAll() {
    const ids = [...this.connections.keys()];
    await Promise.all(ids.map((id) => this.disconnect(id)));
  }

  /**
   * Call a tool on a connected MCP server.
   * @param {string} serverId
   * @param {string} toolName
   * @param {object} args
   * @param {number} [timeoutMs] - call timeout in ms (overrides default)
   * @returns {Promise<{ok: boolean, result?: object, error?: string}>}
   */
  async callTool(serverId, toolName, args = {}, timeoutMs) {
    const conn = this.connections.get(serverId);
    if (!conn || conn.state !== ConnectionState.CONNECTED) {
      return { ok: false, error: `server ${serverId} is not connected (state: ${conn?.state || "unknown"})` };
    }

    const timeout = timeoutMs || this.callTimeoutMs;

    try {
      this.logger("info", `[mcp-client] calling ${serverId}/${toolName}`);
      
      // Add timeout to tool calls
      const callPromise = conn.client.callTool({ name: toolName, arguments: args });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Tool call timed out after ${timeout}ms`)), timeout);
      });
      
      const result = await Promise.race([callPromise, timeoutPromise]);
      
      // 确保 result 是可序列化的 JSON
      const safeResult = {
        content: Array.isArray(result?.content) ? result.content.map(block => {
          if (block.type === "text") return { type: "text", text: String(block.text || "") };
          if (block.type === "image") return { type: "image", mimeType: String(block.mimeType || ""), data: String(block.data || "") };
          // 其他类型转为字符串
          return { type: "text", text: JSON.stringify(block) };
        }) : [],
        isError: result?.isError || false,
      };
      
      return { ok: true, result: safeResult };
    } catch (error) {
      const msg = String(error?.message || error);
      this.logger("warn", `[mcp-client] call failed ${serverId}/${toolName}: ${msg}`);
      
      // Mark connection as error if it's a connection issue
      if (msg.includes('ECONNRESET') || msg.includes('EPIPE') || msg.includes('timeout') || msg.includes('closed')) {
        this._setState(serverId, ConnectionState.ERROR, msg);
      }
      
      return { ok: false, error: msg };
    }
  }

  /**
   * Reconnect to a server if it's in error state.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async reconnect(id) {
    const conn = this.connections.get(id);
    if (!conn) return false;
    
    if (conn.state === ConnectionState.CONNECTED) {
      return true;
    }
    
    if (conn.state !== ConnectionState.ERROR || !conn.config) {
      return false;
    }
    
    // Disconnect first
    await this.disconnect(id);
    
    // Reconnect with saved config
    const result = await this.connect(id, conn.config);
    return result.ok;
  }

  /**
   * Get all connected servers and their tools.
   * @returns {{servers: object[], totalTools: number}}
   */
  listServers() {
    const servers = [];
    for (const [id, conn] of this.connections) {
      servers.push({
        id,
        state: conn.state,
        error: conn.error,
        tools: conn.tools,
        connectedAt: conn.connectedAt,
        config: { type: conn.config?.type || "stdio", command: conn.config?.command, url: conn.config?.url },
      });
    }
    return {
      servers,
      totalTools: servers.reduce((sum, s) => sum + (s.state === ConnectionState.CONNECTED ? s.tools.length : 0), 0),
    };
  }

  /**
   * Get tools from a specific server.
   * @param {string} serverId
   * @returns {object[]}
   */
  getTools(serverId) {
    const conn = this.connections.get(serverId);
    return conn?.state === ConnectionState.CONNECTED ? conn.tools : [];
  }

  /**
   * Get all tools across all connected servers.
   * @returns {{serverId: string, tool: object}[]}
   */
  getAllTools() {
    const result = [];
    for (const [id, conn] of this.connections) {
      if (conn.state === ConnectionState.CONNECTED) {
        for (const tool of conn.tools) {
          result.push({ serverId: id, tool });
        }
      }
    }
    return result;
  }

  /**
   * Get connection status summary.
   * @returns {object}
   */
  getStatus() {
    const status = { total: 0, connected: 0, connecting: 0, error: 0, disconnected: 0, totalTools: 0 };
    for (const [, conn] of this.connections) {
      status.total++;
      status[conn.state] = (status[conn.state] || 0) + 1;
      if (conn.state === ConnectionState.CONNECTED) {
        status.totalTools += conn.tools.length;
      }
    }
    return status;
  }

  /* ── internals ── */

  /** @private */
  _createTransport(config) {
    const type = config.type || "stdio";

    if (type === "stdio") {
      if (!config.command) throw new Error("stdio transport requires 'command'");
      return new StdioClientTransport({
        command: config.command,
        args: Array.isArray(config.args) ? config.args : [],
        env: config.env && typeof config.env === "object" ? { ...process.env, ...config.env } : undefined,
        stderr: "pipe",
      });
    }

    if (type === "sse") {
      if (!config.url) throw new Error("sse transport requires 'url'");
      return new SSEClientTransport(new URL(config.url));
    }

    if (type === "streamable-http" || type === "http") {
      if (!config.url) throw new Error("streamable-http transport requires 'url'");
      return new StreamableHTTPClientTransport(new URL(config.url));
    }

    throw new Error(`unsupported transport type: ${type}`);
  }

  /** @private */
  _setState(id, state, error = null) {
    const existing = this.connections.get(id);
    if (existing) {
      existing.state = state;
      existing.error = error;
    } else {
      this.connections.set(id, {
        client: null,
        transport: null,
        tools: [],
        state,
        error,
        connectedAt: 0,
        config: null,
      });
    }
  }
}
