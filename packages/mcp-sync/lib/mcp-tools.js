/**
 * dsh-mcp-sync tool registration.
 *
 * Registers MCP server tools into DSH's tool system.
 * Naming: mcp__<serverId>__<toolName>
 * Plus meta-tools: mcp_call, mcp_list_tools
 */
import { defineTool } from "@deepseek-ai/dsh-tools";

/**
 * Convert JSON Schema properties to DSH ParameterSchemaSpec.
 */
function jsonSchemaToParameters(jsonSchema) {
  if (!jsonSchema || jsonSchema.type !== "object" || !jsonSchema.properties) {
    return { args: { type: "json", description: "Tool arguments as JSON" } };
  }

  const spec = {};
  const required = new Set(jsonSchema.required || []);

  for (const [key, prop] of Object.entries(jsonSchema.properties)) {
    const base = { description: prop.description || "" };
    if (required.has(key)) base.required = true;

    switch (prop.type) {
      case "string":
        spec[key] = { type: "string", ...base };
        if (prop.enum) spec[key].enum = prop.enum;
        break;
      case "number":
      case "integer":
        spec[key] = { type: prop.type === "integer" ? "integer" : "number", ...base };
        break;
      case "boolean":
        spec[key] = { type: "boolean", ...base };
        break;
      case "array":
        spec[key] = { type: "json", ...base };
        break;
      case "object":
        spec[key] = { type: "json", ...base };
        break;
      default:
        spec[key] = { type: "json", ...base };
    }
  }
  return spec;
}

/**
 * Build a DSH tool definition for one MCP tool.
 */
function buildToolDefinition(serverId, mcpTool, clientManager) {
  const toolName = "mcp__" + serverId + "__" + mcpTool.name;
  const parameters = jsonSchemaToParameters(mcpTool.inputSchema);

  return defineTool({
    name: toolName,
    description: "[MCP:" + serverId + "] " + (mcpTool.description || mcpTool.name),
    parameters,
    output: {
      // Use 'json' type - accepts any lossless JSON value
      schema: { type: "json", description: "MCP tool result" },
      render: (_args, value) => {
        // value is the raw JSON returned by execute
        if (!value || typeof value !== "object") {
          return [{ type: "text", text: String(value || "(empty)") }];
        }
        if (value.error) {
          return [{ type: "text", text: "[MCP error] " + value.error }];
        }
        // Extract text content from MCP response
        const content = value.content;
        if (Array.isArray(content)) {
          return content.map((block) => {
            if (block && block.type === "text") return { type: "text", text: String(block.text || "") };
            if (block && block.type === "image") return { type: "text", text: "[image: " + (block.mimeType || "unknown") + "]" };
            return { type: "text", text: JSON.stringify(block) };
          });
        }
        return [{ type: "text", text: JSON.stringify(value, null, 2) }];
      },
    },
    async execute(args) {
      // Extract tool args (skip DSH meta fields)
      const toolArgs = {};
      for (const [k, v] of Object.entries(args)) {
        if (k !== "sandbox_permissions" && k !== "justification") {
          toolArgs[k] = v;
        }
      }

      const result = await clientManager.callTool(serverId, mcpTool.name, toolArgs);
      
      // Return plain JSON-serializable value
      if (!result.ok) {
        return { error: result.error || "unknown error" };
      }
      
      // Normalize MCP content to plain JSON
      const mcpResult = result.result;
      const safeContent = Array.isArray(mcpResult?.content)
        ? mcpResult.content.map((block) => {
            if (!block || typeof block !== "object") return { type: "text", text: String(block || "") };
            if (block.type === "text") return { type: "text", text: String(block.text || "") };
            if (block.type === "image") return { type: "image", mimeType: String(block.mimeType || ""), data: String(block.data || "") };
            return { type: "text", text: JSON.stringify(block) };
          })
        : [];
      
      return { content: safeContent };
    },
  });
}

/**
 * Register all MCP tools into DSH.
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
 * Register the meta mcp_call tool.
 */
export function registerMcpCallTool(ctx, clientManager) {
  return ctx.tools.register(defineTool({
    name: "mcp_call",
    description: "Call a tool on a connected MCP server. Use mcp_list_tools first to discover available tools.",
    parameters: {
      server: { type: "string", required: true, description: "MCP server id" },
      tool: { type: "string", required: true, description: "Tool name on the MCP server" },
      args: { type: "json", description: "Tool arguments as JSON (default: {})" },
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => {
        if (!value || typeof value !== "object") return [{ type: "text", text: String(value || "(empty)") }];
        if (value.error) return [{ type: "text", text: "[MCP error] " + value.error }];
        const content = value.content;
        if (Array.isArray(content)) {
          return content.map((b) => {
            if (b?.type === "text") return { type: "text", text: String(b.text || "") };
            return { type: "text", text: JSON.stringify(b) };
          });
        }
        return [{ type: "text", text: JSON.stringify(value, null, 2) }];
      },
    },
    async execute(args) {
      const result = await clientManager.callTool(args.server, args.tool, args.args || {});
      if (!result.ok) return { error: result.error || "unknown error" };
      const mcpResult = result.result;
      const safeContent = Array.isArray(mcpResult?.content)
        ? mcpResult.content.map((b) => {
            if (b?.type === "text") return { type: "text", text: String(b.text || "") };
            return { type: "text", text: JSON.stringify(b) };
          })
        : [];
      return { content: safeContent };
    },
  }));
}

/**
 * Register the meta mcp_list_tools tool.
 */
export function registerMcpListTools(ctx, clientManager) {
  return ctx.tools.register(defineTool({
    name: "mcp_list_tools",
    description: "List all available MCP tools across connected servers.",
    parameters: {
      server: { type: "string", description: "Filter by server id (omit to list all)" },
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => {
        if (!value?.servers) return [{ type: "text", text: "No servers connected." }];
        const lines = [];
        for (const s of value.servers) {
          lines.push("## " + s.id + " (" + s.state + ") - " + s.tools.length + " tools");
          for (const t of s.tools) {
            lines.push("- " + t.name + ": " + (t.description || "").substring(0, 80));
          }
          lines.push("");
        }
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    async execute(args) {
      if (args.server) {
        const tools = clientManager.getTools(args.server);
        return { servers: [{ id: args.server, state: "connected", tools }], totalTools: tools.length };
      }
      return clientManager.listServers();
    },
  }));
}
