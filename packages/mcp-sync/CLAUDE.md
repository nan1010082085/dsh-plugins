# dsh-mcp-sync 开发规则

## 插件概述

连接 MCP 服务器、发现工具并注册到 DSH 工具系统，让模型直接调用 MCP 工具。

## 安装（强制）

```sh
# 优先使用 dsh plugin 安装
dsh plugin --profile web add dsh-mcp-sync
```

## 发布流程（每次修改必须遵循）

1. 修改 lib/ 下的文件
2. 更新 package.json 的 version
3. cd packages/mcp-sync && npm publish
4. dsh plugin --profile web add dsh-mcp-sync
5. 运行 dsh web 验证无报错

## 文件结构

| 文件 | 用途 |
|------|------|
| lib/index.js | 服务端：MCP 客户端管理、工具注册、路由注册、定时同步 |
| lib/mcp-client.js | MCP 连接管理器（stdio/SSE/HTTP transport、连接池、生命周期） |
| lib/mcp-tools.js | MCP 工具 → DSH 工具注册（defineTool + JSON Schema 转换） |
| lib/sources.js | 数据源：Claude/Codex/Cursor/DSH MCP 配置扫描 |
| lib/routes.js | API 路由：服务列表、连接管理、工具调用 |
| lib/client.js | 客户端：侧边栏标签页、连接状态、工具展示 |
| cordis.patch.yml | Loader 注册补丁 |
| package.json | 包配置（dsh.bundle + dsh.client） |

## 服务端规范（lib/index.js）

- 导出：{ name, inject, Config, apply }
- inject = ["webServer", "tools"]
- 必须使用 ctx.logger.info/warn 输出日志
- 日志格式：[mcp-sync] 消息内容

## MCP 客户端架构

- McpClientManager 管理连接池（Map<id, {client, transport, tools, state}>）
- 支持 stdio、sse、streamable-http 三种 transport
- 连接时自动调用 tools/list 发现工具
- 调用工具时通过 client.callTool() 转发

## 工具注册

- 每个 MCP 工具注册为 mcp__<serverId>__<toolName>
- 使用 defineTool({ name, description, parameters, output, execute })
- JSON Schema → DSH ParameterSchemaSpec 自动转换
- 元工具 mcp_call 和 mcp_list_tools 提供动态调用和发现

## 数据源

| 源 | 配置路径 | 格式 |
|------|----------|------|
| Claude Code | ~/.claude/claude_desktop_config.json | JSON |
| Cursor Agent | ~/.cursor/mcp.json | JSON |
| Codex CLI | ~/.codex/config.toml | TOML |
| DSH | ~/.dsh/mcp.json | JSON |
| 自定义 | ~/.dsh/mcp-sync/custom.json | JSON |

## 依赖

- @modelcontextprotocol/sdk — MCP 协议客户端
- @deepseek-ai/dsh-tools — defineTool 工具定义
- @deepseek-ai/schemastery — 配置 schema
- dsh-better-sidebar — 侧边栏标签页系统