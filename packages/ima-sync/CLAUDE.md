# dsh-plugin-ima-sync 开发规则

## 插件概述

将 DSH 对话进度自动上传到腾讯 IMA（笔记 + Work 知识库）。

## 安装（任一方式）

```sh
# GitHub 安装
dsh plugin --profile web add github:nan1010082085/dsh-plugin-ima-sync

# npm 安装
dsh plugin --profile web add dsh-plugin-ima-sync
```

## 发布流程（每次修改必须遵循）

1. 修改 `lib/index.js`（服务端）或 `lib/client.js`（客户端）
2. 更新 `package.json` 的 `version`
3. `cd packages/ima-sync && npm publish`
4. **`./scripts/sync-repos.sh ima-sync`**（同步到独立 GitHub repo）
5. `dsh plugin --profile web add github:nan1010082085/dsh-plugin-ima-sync`
6. 运行 `dsh web` 验证无报错

## 文件结构

| 文件 | 用途 |
|------|------|
| `lib/index.js` | 服务端：事件监听、上传逻辑、Web API |
| `lib/client.js` | 客户端：设置界面（settings.section） |
| `lib/index.d.ts` | TypeScript 类型声明 |
| `cordis.patch.yml` | Loader 注册补丁 |
| `package.json` | 包配置（dsh.bundle + dsh.client） |

## 服务端规范（lib/index.js）

- 导出：`{ name, inject, Config, apply }`
- `inject = ["webServer"]`
- Config schema 使用 `z.union([z.const(...)])` 替代 `z.enum`（schemastery 不支持 enum）
- 必须使用 `ctx.logger.info/warn` 输出日志
- 日志格式：`[ima-sync] 消息内容`
- 必须覆盖：初始化配置、上传结果、错误处理

## 客户端规范（lib/client.js）

- 通过 `window.__ModuleLoader__.load()` 注册
- factory 内导出：`{ apply, inject }`
- `inject = ["slots", "locale"]`
- 使用 `ctx.slots.inject("settings.section", ...)` 注册到设置侧边栏
- 必须支持中英文国际化（`ctx.locale.register`）
- 配置通过 API（`/api/dsh-ima-sync/config`）获取和保存

## 笔记模式

| 模式 | 笔记标题 | 说明 |
|------|----------|------|
| `project+date` | `[项目名] YYYY-MM-DD` | 每个项目独立笔记（默认） |
| `daily` | `YYYY-MM-DD` | 所有项目合并到一个日报 |

## 依赖

- `@deepseek-ai/schemastery` — 配置 schema
- `dsh.client.inject`: `@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-settings`
