# dsh-mcp-sync

DSH（DeepSeek Harness）插件：**自动同步本地 Claude Code / Codex CLI / Cursor Agent 的 MCP 配置**，去重过滤，集中管理，支持自定义 MCP。

## 功能

| 能力 | 说明 |
| --- | --- |
| 三源同步 | 自动扫描 Claude Code、Codex CLI、Cursor Agent 的 MCP 配置文件 |
| 智能去重 | 按 `command + args` 或 `url` 去重，相同服务只显示一次，标注来源 |
| 集中展示 | 侧边栏「MCP 配置」标签页，统一查看所有 MCP 服务 |
| 来源标注 | 每个服务显示来源徽标（Claude / Codex / Cursor / 自定义） |
| 自定义 MCP | 支持添加自定义 MCP 服务（stdio 或 sse 类型），存储在 `~/.dsh/mcp-sync/custom.json` |
| 设置集成 | 在设置页面中配置同步选项（启用/禁用源、去重策略等） |
| 实时刷新 | 支持手动刷新，配置文件变更后自动更新 |

## 数据源

| 源 | 配置路径 | 格式 |
| --- | --- | --- |
| Claude Code | `~/.claude/claude_desktop_config.json` | JSON (`mcpServers`) |
| Cursor Agent | `~/.cursor/mcp.json` | JSON (`mcpServers`) |
| Codex CLI | `~/.codex/config.toml` | TOML (`[mcp_servers]`) |
| 自定义 | `~/.dsh/mcp-sync/custom.json` | JSON |

## 工作原理

- **服务端半**（`lib/index.js` → `lib/sources.js` + `lib/routes.js`）：扫描三源 MCP 配置文件，解析 JSON/TOML 格式，按 `(mtime)` 缓存；`GET /api/dsh-mcp-sync/*` 提供状态、服务列表、原始配置三个只读接口。
- **去重逻辑**：按 `command + args`（stdio 类型）或 `url`（sse 类型）生成指纹，相同指纹的服务合并为一条，保留所有来源。
- **浏览器半**（`lib/client.js`，零构建手写 ModuleLoader 工厂）：注册为 `dsh-better-sidebar` 的标签页，展示去重后的 MCP 服务列表，支持按来源过滤和搜索。

## 安装

```sh
# 使用 dsh plugin 安装（推荐）
dsh plugin --profile web add dsh-mcp-sync

# 重启 dsh web 生效
```

`dsh plugin` 会自动把声明了 `dsh.bundle` 的包追加进 profile 的 `dsh.profile.bundles`。

### 依赖

需要安装 `dsh-better-sidebar` 插件（提供侧边栏标签页系统）。

## 配置

默认零配置可用。需要调整时，在 profile 的 `cordis.patch.yml`（`~/.dsh/profiles/web/cordis.patch.yml`）按 id 覆盖：

```yaml
- id: mcp-sync
  config:
    enabled: true
    autoSync: true          # 启动时自动同步
    syncInterval: 60000     # 定时同步间隔（ms），0 关闭
    dedupeByCommand: true   # 按 command+args 去重
    sources:
      claude: true          # 扫描 Claude Code 配置
      codex: true           # 扫描 Codex CLI 配置
      cursor: true          # 扫描 Cursor Agent 配置
```

## API（均 loopback-only）

| 路由 | 说明 |
| --- | --- |
| `GET /api/dsh-mcp-sync/status` | 各源可用性 / 服务数 / 最后同步时间 |
| `GET /api/dsh-mcp-sync/servers?source=` | 去重后的 MCP 服务列表（可按来源过滤） |
| `GET /api/dsh-mcp-sync/config?source=` | 各源的原始配置文件内容 |
| `GET /api/dsh-mcp-sync/custom` | 自定义 MCP 服务列表 |
| `POST /api/dsh-mcp-sync/custom` | 添加自定义 MCP 服务（body: `{name, config}`） |
| `DELETE /api/dsh-mcp-sync/custom?name=` | 删除自定义 MCP 服务 |

## 开发

```sh
node --check lib/index.js lib/sources.js lib/routes.js lib/client.js
```

## License

MIT
