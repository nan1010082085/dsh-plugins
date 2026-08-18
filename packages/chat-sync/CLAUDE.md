# dsh-chat-sync 开发规则

## 插件概述

将本地 Claude Code / Codex CLI / Cursor Agent 的对话同步到 DSH Web GUI。

## 安装（强制）

```sh
# 优先使用 dsh plugin 安装
dsh plugin --profile web add dsh-chat-sync
```

## 发布流程（每次修改必须遵循）

1. 修改 `lib/index.js`（服务端）或 `lib/client.js`（客户端）
2. 更新 `package.json` 的 `version`
3. `cd packages/chat-sync && npm publish`
4. `dsh plugin --profile web add dsh-chat-sync`
5. 运行 `dsh web` 验证无报错

## 文件结构

| 文件 | 用途 |
|------|------|
| `lib/index.js` | 服务端：扫描器、路由注册、实时同步 |
| `lib/sources.js` | 数据源：Claude/Codex/Cursor 会话扫描 |
| `lib/routes.js` | API 路由：会话列表、消息、SSE |
| `lib/client.js` | 客户端：侧边栏标签页、会话浏览面板 |
| `lib/index.d.ts` | TypeScript 类型声明 |
| `cordis.patch.yml` | Loader 注册补丁 |
| `package.json` | 包配置（dsh.bundle + dsh.client） |

## 服务端规范（lib/index.js）

- 导出：`{ name, inject, Config, apply }`
- `inject = ["webServer"]`
- 必须使用 `ctx.logger.info/warn` 输出日志
- 日志格式：`[chat-sync] 消息内容`
- 必须覆盖：初始化配置、扫描结果、路由注册、错误处理、卸载

## 客户端规范（lib/client.js）

- 通过 `window.__ModuleLoader__.load()` 注册
- factory 内导出：`{ apply, inject }`
- `inject = ["betterSidebar"]`
- 使用 `ctx.slots.inject("settings.section", ...)` 注册到设置侧边栏
- 必须支持中英文国际化（`ctx.locale.register`）

## 数据源

| 源 | 路径 |
|------|------|
| Claude Code | `~/.claude/projects/<项目>/<sessionId>.jsonl` |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Cursor Agent | `~/.cursor/projects/<项目>/agent-transcripts/<uuid>/<uuid>.jsonl` |

## 依赖

- `dsh-better-sidebar` — 侧边栏标签页系统
- `dsh.client.inject`: `@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-settings`
