# dsh-plugins

[![GitHub](https://img.shields.io/badge/GitHub-dsh--plugins-blue?logo=github)](https://github.com/nan1010082085/dsh-plugins)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

DSH（DeepSeek Harness）插件 monorepo。每个包是一个独立可安装的 dsh 插件，经 `dsh plugin` 装进 profile。

## Packages

| 包 | 说明 | 版本 |
| --- | --- | --- |
| [`packages/chat-sync`](./packages/chat-sync) | **对话同步**：把本地 Claude Code / Codex CLI / Cursor Agent 的对话同步进 DSH Web GUI | 0.3.4 |
| [`packages/ima-sync`](./packages/ima-sync) | **IMA 上传**：把 DSH 对话进度自动上传到腾讯 IMA（每日笔记 + Work 知识库） | 0.8.2 |
| [`packages/mcp-sync`](./packages/mcp-sync) | **MCP 同步**：扫描本地 MCP 配置，连接服务器，注册工具供模型直接调用 | 0.7.0 |

## 安装

```sh
# GitHub 安装（推荐，独立仓库，版本同步）
dsh plugin --profile web add github:nan1010082085/dsh-plugin-ima-sync
dsh plugin --profile web add github:nan1010082085/dsh-chat-sync
dsh plugin --profile web add github:nan1010082085/dsh-mcp-sync

# npm 安装
dsh plugin --profile web add dsh-plugin-ima-sync
dsh plugin --profile web add dsh-chat-sync
dsh plugin --profile web add dsh-mcp-sync

# 本地 link 安装（改源码重启 dsh web 即生效）
dsh plugin --profile web add link:$(pwd)/packages/ima-sync
dsh plugin --profile web add link:$(pwd)/packages/chat-sync
dsh plugin --profile web add link:$(pwd)/packages/mcp-sync
```

## 开发

```sh
# 语法检查
node --check packages/chat-sync/lib/*.js
node --check packages/ima-sync/lib/*.js
node --check packages/mcp-sync/lib/*.js

# 发布（每个包独立版本）
cd packages/<plugin> && npm publish

# 同步到独立 GitHub repo（发布后必须执行）
./scripts/sync-repos.sh           # 全部
./scripts/sync-repos.sh ima-sync  # 单个
```

## License

MIT（各包同源）
