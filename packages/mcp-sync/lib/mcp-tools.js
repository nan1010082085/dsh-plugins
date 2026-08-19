/**
 * dsh-mcp-sync tool registration.
 *
 * Registers MCP server tools into DSH's tool system so the model can call them
 * directly. Each MCP tool becomes a DSH tool with the naming pattern:
 *   mcp__<serverId>__<toolName>
 *
 * Also registers meta-tools: mcp_call and mcp_list_tools.
 */
import { defineTool } from "@deepseek-ai/dsh-tools";

/**
 * Convert MCP JSON Schema input to DSH ParameterSchemaSpec.
 * @param {object} jsonSchema - MCP tool's inputSchema (JSON Schema)
 * @returns {object} DSH ParameterSchemaSpec
 */
function jsonSchemaToParameterSpec(jsonSchema) {
  if (!jsonSchema || jsonSchema.type !== "object" || !jsonSchema.properties) {
    return {
      args: {
        type: "json",
        description: "Tool arguments as a JSON object",
      },
    };
  }

  const spec = {};
  const required = new Set(jsonSchema.required || []);

  for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
    const prop = { ...jsonSchemaPropToSpec(propSchema) };
    if (required.has(key)) prop.required = true;
    spec[key] = prop;
  }

  return spec;
}

/**
 * Convert a single JSON Schema property to DSH ValueSchemaSpec.
 * @param {object} prop
 * @returns {object}
 */
function jsonSchemaPropToSpec(prop) {
  if (!prop || typeof prop !== "object") return { type: "json", description: "" };

  const base = {
    description: prop.description || "",
    ...(prop.title ? { title: prop.title } : {}),
    ...(prop.default !== undefined ? { default: prop.default } : {}),
    ...(prop.examples ? { examples: prop.examples } : {}),
  };

  const type = prop.type;

  if (type === "string") {
    const result = { type: "string", ...base };
    if (prop.enum) result.enum = prop.enum;
    return result;
  }
  if (type === "number" || type === "integer") {
    const result = { type: type === "integer" ? "integer" : "number", ...base };
    if (prop.enum) result.enum = prop.enum;
    return result;
  }
  if (type === "boolean") return { type: "boolean", ...base };
  if (type === "null") return { type: "null", ...base };
  if (type === "array") {
    const result = { type: "array", ...base };
    if (prop.items) result.items = jsonSchemaPropToSpec(prop.items);
    return result;
  }
  if (type === "object") {
    const result = { type: "object", additionalProperties: true, ...base };
    if (prop.properties) {
      result.properties = {};
      for (const [k, v] of Object.entries(prop.properties)) {
        result.properties[k] = jsonSchemaPropToSpec(v);
      }
    }
    return result;
  }

  return { type: "json", ...base };
}

/**
 * Build a DSH tool definition for one MCP tool.
 * @param {string} serverId
 * @param {object} mcpTool - {name, description, inputSchema}
 * @param {import("./mcp-client.js").McpClientManager} clientManager
 * @returns {object} DSH ToolDefinition
 */
function buildToolDefinition(serverId, mcpTool, clientManager) {
  const toolName = "mcp__" + serverId + "__" + mcpTool.name;
  const parameters = jsonSchemaToParameterSpec(mcpTool.inputSchema);

  return defineTool({
    name: toolName,
    description: "[MCP:" + serverId + "] " + (mcpTool.description || mcpTool.name),
    parameters,
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          content: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          error: { type: "string" },
          serverId: { type: "string", required: true },
          toolName: { type: "string", required: true },
        },
      },
      render: (_args, value) => {
        if (!value.ok) {
          return [{ type: "text", text: "[MCP error] " + value.error }];
        }
        const blocks = (value.content || []).map((block) => {
          if (block.type === "text") return { type: "text", text: block.text };
          if (block.type === "image") return { type: "text", text: "[image: " + block.mimeType + "]" };
          return { type: "text", text: JSON.stringify(block, null, 2) };
        });
        return blocks.length > 0 ? blocks : [{ type: "text", text: "(empty result)" }];
      },
    },
    async execute(args) {
      const toolArgs = {};
      for (const [k, v] of Object.entries(args)) {
        if (k !== "sandbox_permissions" && k !== "justification") {
          toolArgs[k] = v;
        }
      }

      const result = await clientManager.callTool(serverId, mcpTool.name, toolArgs);
      return {
        ok: result.ok,
        content: result.ok ? (result.result?.content || []) : [],
        error: result.error || undefined,
        serverId,
        toolName: mcpTool.name,
      };
    },
  });
}

/**
 * Register all discovered MCP tools into DSH tool registry.
 * @param {object} ctx - DSH context with ctx.tools
 * @param {import("./mcp-client.js").McpClientManager} clientManager
 * @param {function} logger
 * @returns {{registered: string[], disposers: function[]}}
 */
export function registerMcpTools(ctx, clientManager, logger) {
  const registered = [];
  const disposers = [];

  const allTools = clientManager.getAllTools();
  for (const { serverId, tool } of allTools) {
    try {
      const def = buildToolDefinition(serverId, tool, clientManager);
      const disposer = ctx.tools.register(def);
      disposers.push(disposer);
      registered.push(def.name);
      logger("info", "[mcp-tools] registered " + def.name);
    } catch (error) {
      logger("warn", "[mcp-tools] failed to register mcp__" + serverId + "__" + tool.name + ": " + (error?.message || error));
    }
  }

  return { registered, disposers };
}

/**
 * Register the meta mcp_call tool for dynamic invocation.
 * @param {object} ctx
 * @param {import("./mcp-client.js").McpClientManager} clientManager
 * @returns {function} disposer
 */
export function registerMcpCallTool(ctx, clientManager) {
  return ctx.tools.register(defineTool({
    name: "mcp_call",
    description: "Call a tool on a connected MCP server. Use mcp_list_tools first to discover available tools.",
    parameters: {
      server: {
        type: "string",
        required: true,
        description: "MCP server id (e.g. 'cursor_web-search', 'codex_fetch')",
      },
      tool: {
        type: "string",
        required: true,
        description: "Tool name on the MCP server",
      },
      args: {
        type: "json",
        description: "Tool arguments as a JSON object (default: {})",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          ok: { type: "boolean", required: true },
          content: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          error: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (!value.ok) {
          return [{ type: "text", text: "[MCP error] " + value.error }];
        }
        const blocks = (value.content || []).map((block) => {
          if (block.type === "text") return { type: "text", text: block.text };
          return { type: "text", text: JSON.stringify(block, null, 2) };
        });
        return blocks.length > 0 ? blocks : [{ type: "text", text: "(empty result)" }];
      },
    },
    async execute(args) {
      const result = await clientManager.callTool(args.server, args.tool, args.args || {});
      return {
        ok: result.ok,
        content: result.ok ? (result.result?.content || []) : [],
        error: result.error || undefined,
      };
    },
  }));
}

/**
 * Register the meta mcp_list_tools tool for discovery.
 * @param {object} ctx
 * @param {import("./mcp-client.js").McpClientManager} clientManager
 * @returns {function} disposer
 */
export function registerMcpListTools(ctx, clientManager) {
  return ctx.tools.register(defineTool({
    name: "mcp_list_tools",
    description: "List all available MCP tools across connected servers. Use this to discover what MCP tools you can call.",
    parameters: {
      server: {
        type: "string",
        description: "Filter by server id (omit to list all)",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          servers: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          totalTools: { type: "number", required: true },
        },
      },
      render: (_args, value) => {
        const lines = [];
        for (const s of value.servers) {
          lines.push("## " + s.id + " (" + s.state + ") \u2014 " + s.tools.length + " tools");
          for (const t of s.tools) {
            lines.push("- **" + t.name + "**: " + (t.description || "(no description)"));
          }
          lines.push("");
        }
        return [{ type: "text", text: lines.join("\n") || "No MCP servers connected." }];
      },
    },
    async execute(args) {
      if (args.server) {
        const tools = clientManager.getTools(args.server);
        return {
          servers: [{ id: args.server, state: "connected", tools }],
          totalTools: tools.length,
        };
      }
      return clientManager.listServers();
    },
  }));
}