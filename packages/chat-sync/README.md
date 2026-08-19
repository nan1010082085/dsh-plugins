# dsh-chat-sync

[![GitHub](https://img.shields.io/badge/GitHub-dsh--plugins-blue?logo=github)](https://github.com/nan1010082085/dsh-plugins)
[![npm](https://img.shields.io/badge/npm-dsh--chat--sync-green?logo=npm)](https://www.npmjs.com/package/dsh-chat-sync)

DSH（DeepSeek Harness）插件：**把本地 Claude Code / Codex CLI / Cursor Agent 的对话自动导入为 DSH 会话**，在侧边栏统一查看。

## 功能

| 能力 | 说明 |
| --- | --- |
| **自动导入** | 发现新对话自动创建 DSH 会话 |
| **工作区匹配** | 按源对话的项目路径自动匹配或创建 DSH 工作区 |
| 三源分组 | 侧边栏按 Claude Code / Codex CLI / Cursor Agent 分组显示 |
| 动态同步 | fs.watch 递归监听 + SSE 推送，列表自动刷新 |
| 隐私围栏 | 所有 API 仅接受 loopback 请求 |

## 数据源

| 源 | 路径 |
| --- | --- |
| Claude Code | `~/.claude/projects/<项目>/<sessionId>.jsonl` |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Cursor Agent | `~/.cursor/projects/<项目>/agent-transcripts/<uuid>/<uuid>.jsonl` |

## 工作原理

### 自动导入流程

1. **扫描**：定期扫描三个数据源目录，发现新的对话文件
2. **匹配工作区**：根据源对话的 `cwd`（工作目录）查找匹配的 DSH 工作区
   - 匹配到 → 直接使用
   - 未匹配 → 自动创建新工作区目录
3. **创建会话**：通过 DSH API 创建新会话，挂载到对应工作区
4. **命名**：会话标题格式为 `[来源] 原始标题`（如 `[Claude] 修复登录bug`）

### 状态追踪

已导入的会话记录在 `.chat-sync/imported.json`，避免重复导入。只导入最近 24 小时内有更新的会话。

## 安装

```sh
# 使用 dsh plugin 安装
dsh plugin --profile web add dsh-chat-sync
```

## 配置

在 profile 的 `cordis.patch.yml`（`~/.dsh/profiles/web/cordis.patch.yml`）按 id 覆盖：

```yaml
- id: chat-sync
  config:
    enabled: true
    # 浏览功能
    watch: true                    # 动态同步
    syncToWorkspace: true          # 文件复制到 .chat-sync 目录
    # 自动导入
    autoImport: true               # 自动导入为 DSH 会话
    autoImportIntervalMs: 60000    # 扫描间隔（毫秒）
    # 高级
    maxSessions: 500               # 会话列表上限
    maxMessageChars: 8000          # 单条消息截断长度
    recentLiveMs: 180000           # 「活跃」判定窗口
```

### 配置项说明

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 插件总开关 |
| `watch` | `true` | 文件监听 + SSE 推送 |
| `syncToWorkspace` | `true` | 文件复制到 .chat-sync 目录 |
| `autoImport` | `true` | 自动导入为 DSH 会话 |
| `autoImportIntervalMs` | `60000` | 自动导入扫描间隔 |

## API（均 loopback-only）

| 路由 | 说明 |
| --- | --- |
| `GET /api/dsh-chat-sync/status` | 各源可用性 / 会话数 / 同步模式 |
| `GET /api/dsh-chat-sync/sessions` | 过滤后的会话列表 |
| `GET /api/dsh-chat-sync/session?id=<source:uuid>` | 消息流（增量） |
| `GET /api/dsh-chat-sync/events` | SSE 实时更新 |

## 开发与测试

```sh
node --check lib/index.js lib/sources.js lib/routes.js lib/client.js lib/auto-import.js
node tests/smoke.mjs         # 端到端测试
node tests/client-load.mjs   # 客户端加载测试
```

## License

MIT