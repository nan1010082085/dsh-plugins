# dsh-mcp-sync

[![GitHub](https://img.shields.io/badge/GitHub-dsh--plugins-blue?logo=github)](https://github.com/nan1010082085/dsh-plugins)
[![npm](https://img.shields.io/badge/npm-dsh--mcp--sync-green?logo=npm)](https://www.npmjs.com/package/dsh-mcp-sync)

DSH（DeepSeek Harness）插件：**连接 MCP 服务器、发现工具并注册到 DSH 工具系统**，让模型可以直接调用 MCP 工具。

## 功能

| 能力 | 说明 |
| --- | --- |
| MCP 连接 | 通过 stdio/SSE/StreamableHTTP 连接到 MCP 服务器 |
| 工具发现 | 自动调用 tools/list 发现每个 MCP 服务器的工具 |
| 工具注册 | 将 MCP 工具注册到 DSH 工具系统（命名: mcp__<server>__<tool>） |
| 元工具 | mcp_call 动态调用 + mcp_list_tools 工具发现 |
| 多源扫描 | Claude Code、Codex CLI、Cursor Agent、DSH 配置 |
| 智能去重 | 按 command + args 或 url 去重 |
| 自定义 MCP | 支持添加自定义 MCP 服务 |
| 连接管理 | 侧边栏管理面板：连接状态、工具列表、一键刷新 |

## 工作原理

1. **扫描**: 从 Claude Code / Codex / Cursor / DSH 配置文件读取 MCP 服务器定义
2. **连接**: 使用 MCP SDK（stdio/SSE/HTTP transport）连接到每个服务器
3. **发现**: 调用 tools/list 获取每个服务器暴露的工具列表
4. **注册**: 将每个 MCP 工具注册为 DSH 工具，模型可直接调用

## 安装

```sh
# 从 GitHub 安装（独立仓库，已发布 npm）
dsh plugin --profile web add github:nan1010082085/dsh-mcp-sync

# 或从 npm 安装
dsh plugin --profile web add dsh-mcp-sync

# 重启 dsh web 生效
```

### 依赖

- dsh-better-sidebar — 侧边栏标签页系统
- @modelcontextprotocol/sdk — MCP 协议客户端

## 配置

默认零配置可用。需要调整时，在 profile 的 cordis.patch.yml 按 id 覆盖：

```yaml
- id: mcp-sync
  config:
    enabled: true
    autoSync: true          # 启动时自动扫描
    autoConnect: true       # 自动连接到发现的 MCP 服务器
    syncInterval: 60000     # 定时同步间隔（ms），0 关闭
    dedupeByCommand: true   # 按 command+args 去重
    registerTools: true     # 自动注册 MCP 工具到 DSH
    sources:
      claude: true
      codex: true
      cursor: true
      dsh: true             # ~/.dsh/mcp.json
```

### DSH MCP 配置文件

~/.dsh/mcp.json 使用标准 MCP 格式：

```json
{
  "mcpServers": {
    "my-tool": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@my-org/mcp-server"],
      "env": { "API_KEY": "..." }
    },
    "remote-service": {
      "type": "sse",
      "url": "http://localhost:8080/sse"
    }
  }
}
```

## 工具命名

每个 MCP 工具注册为 DSH 工具，命名规则：

- **命名工具**: mcp__<serverId>__<toolName> — 模型直接调用
- **元工具**: mcp_call — 动态调用任意 MCP 工具
- **发现工具**: mcp_list_tools — 列出所有可用 MCP 工具

## API（均 loopback-only）

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| /api/dsh-mcp-sync/status | GET | 来源可用性 + 连接状态 |
| /api/dsh-mcp-sync/servers | GET | 去重后的 MCP 服务列表 |
| /api/dsh-mcp-sync/config | GET | 各源原始配置文件内容 |
| /api/dsh-mcp-sync/connections | GET | MCP 客户端连接状态 |
| /api/dsh-mcp-sync/connect | POST | 连接到指定 MCP 服务器 |
| /api/dsh-mcp-sync/disconnect | POST | 断开指定 MCP 服务器 |
| /api/dsh-mcp-sync/tools | GET | 列出所有已发现的 MCP 工具 |
| /api/dsh-mcp-sync/call | POST | 直接调用 MCP 工具 |
| /api/dsh-mcp-sync/custom | GET/POST/DELETE | 自定义 MCP 服务管理 |

## 侧边栏

设置页面中的「MCP Manager」标签页提供三个子视图：

- **Servers**: 扫描到的 MCP 服务器配置
- **Connections**: 连接状态和工具数量
- **Tools**: 所有已发现的 MCP 工具列表

## 开发

```sh
node --check lib/index.js lib/sources.js lib/routes.js lib/mcp-client.js lib/mcp-tools.js lib/client.js
```

## License

MIT