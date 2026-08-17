# dsh-chat-sync

DSH（DeepSeek Harness）插件：**把本地 Claude Code / Codex CLI / Cursor Agent 的历史与进行中的对话同步进 DSH Web GUI**，侧边栏「对话同步」入口，一站式浏览 + 动态更新。

## 功能

| 能力 | 说明 |
| --- | --- |
| 三源汇聚 | 同一列表浏览 Claude Code、Codex CLI、Cursor Agent 的所有本地会话（标题 / 项目 / 时间 / 大小 / 消息数） |
| 会话回放 | 点开任意会话查看完整消息流：用户输入、助手回复（含模型名）、工具调用胶囊、工具结果、system 事件 |
| 动态同步 | 三个数据根目录 `fs.watch`（递归）→ 去抖扫描 → **SSE 推送到浏览器**：列表自动刷新，正在打开的会话按字节偏移**增量追加**新消息，无需手动刷新 |
| 活跃标记 | 最近有写入的会话带绿色脉动点（「动态同步」chip 可一键只看活跃会话） |
| 隐私围栏 | 所有 API 仅接受 loopback 请求（socket + Host + same-origin 三重校验），不向局域网暴露任何对话内容 |

只读设计：插件**只读取**本地会话文件，绝不写入 / 修改任何 Claude、Codex、Cursor 的数据。

## 数据源

| 源 | 路径 | 标题来源 |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/<项目>/<sessionId>.jsonl` | `ai-title` / `summary` 行，回退首条真实用户消息 |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | `~/.codex/session_index.jsonl` 的 thread name，回退首条用户消息 |
| Cursor Agent | `~/.cursor/projects/<项目>/agent-transcripts/<uuid>/<uuid>.jsonl` | Cursor `conversation-search.db`（node:sqlite 只读，不可用时自动回退），回退首条 `<user_query>` |

> 边界：Cursor 侧只收录 **Agent transcripts**（`agent-transcripts` 目录，即 Cursor Agent / 后台 Agent 会话）；旧版 Composer 聊天（state.vscdb 二进制 blob）不在范围内。

## 工作原理

- **服务端半**（`lib/index.js` → `lib/sources.js` + `lib/routes.js`）：扫描三源 jsonl，按 `(mtime, size)` 缓存会话元数据；`GET /api/dsh-chat-sync/*` 提供状态 / 列表 / 消息三个只读接口 + `/events` SSE 流。消息读取按**字节偏移增量**：会话文件是 append-only JSONL，解析结果与 `next` 偏移一并返回，客户端带 `from=<next>` 续读，只传新增消息。
- **动态同步**：三个数据根目录递归 `fs.watch` → 400ms 去抖重扫 → diff 出变化会话 → SSE `changed` 帧广播。不支持递归 watch 的平台自动退化为轮询（`pollFallbackMs`）。正在打开的会话收到 `changed` 即增量拉取并自动滚动跟随。
- **浏览器半**（`lib/client.js`，零构建手写 ModuleLoader 工厂）：遵循 dsh-ssh / task-board 的 DOM 扩展惯例注入侧边栏入口（MutationObserver 自愈），并在中栏以 React 根挂载浏览面板；与其他面板（任务看板 / SSH）通过 `dsh-panel-activate` 事件互让。

## 安装

```sh
# 本地 link 安装（开发推荐）
dsh plugin --profile web add link:/Users/yangdongnan/work/dsh-chat-sync

# 或从 GitHub 安装
dsh plugin --profile web add github:<you>/dsh-chat-sync

# 重启 dsh web 生效
```

`dsh plugin` 会自动把声明了 `dsh.bundle` 的包追加进 profile 的 `dsh.profile.bundles`。

## 配置

默认零配置可用。需要调整时，在 profile 的 `cordis.patch.yml`（`~/.dsh/profiles/web/cordis.patch.yml`）按 id 覆盖：

```yaml
- id: chat-sync
  config:
    enabled: true
    watch: true            # 动态同步（文件监听 + SSE 推送）
    pollFallbackMs: 5000   # 递归 watch 不可用时的轮询间隔（0 关闭）
    debounceMs: 400        # 文件事件去抖窗口
    maxSessions: 500       # 会话列表上限
    maxMessageChars: 8000  # 单条消息截断长度
    recentLiveMs: 180000   # 「活跃」判定窗口
    titleHeadBytes: 65536  # 新文件标题提取读取的头部字节数
```

## API（均 loopback-only）

| 路由 | 说明 |
| --- | --- |
| `GET /api/dsh-chat-sync/status` | 各源可用性 / 会话数 / 同步模式 |
| `GET /api/dsh-chat-sync/sessions?source=&q=&limit=&offset=&live=1` | 过滤后的会话列表 |
| `GET /api/dsh-chat-sync/session?id=<source:uuid>&from=<next>` | 消息流（增量） |
| `GET /api/dsh-chat-sync/events` | SSE：`hello` / `changed` 帧 |

## 开发与测试

```sh
node --check lib/index.js lib/sources.js lib/routes.js lib/client.js
node tests/smoke.mjs         # 端到端：假 home + 真 HTTP + SSE 动态推送
node tests/client-load.mjs   # 浏览器半：ModuleLoader 契约 + apply 冒烟
```

## License

MIT
