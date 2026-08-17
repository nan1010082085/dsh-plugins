# dsh-plugins

DSH(DeepSeek Harness)插件 monorepo。每个包是一个独立可安装的 dsh 插件,经 `dsh plugin` 装进 profile。

## Packages

| 包 | 说明 | 状态 |
| --- | --- | --- |
| [`packages/chat-sync`](./packages/chat-sync) | **对话同步**:把本地 Claude Code / Codex CLI / Cursor Agent 的对话同步进 DSH Web GUI,SSE 动态更新 + 来源徽标 | v0.1.0 |
| [`packages/ima-sync`](./packages/ima-sync) | **IMA 上传**:把 DSH 对话进度自动上传到腾讯 IMA(每日笔记 + Work 知识库) | 0.1.0 |

## 安装(任一包)

```sh
# 本地 link 安装(改源码重启 dsh web 即生效)
dsh plugin --profile web add link:$(pwd)/packages/chat-sync
dsh plugin --profile web add link:$(pwd)/packages/ima-sync

# 或从 GitHub 单包安装
dsh plugin --profile web add github:nan1010082085/dsh-chat-sync
dsh plugin --profile web add github:nan1010082085/dsh-plugin-ima-sync
```

## 开发

```sh
# 语法 + 测试(chat-sync)
node --check packages/chat-sync/lib/*.js
node packages/chat-sync/tests/smoke.mjs
node packages/chat-sync/tests/client-load.mjs
```

## 仓库迁移说明

本仓库由两个独立仓库合并而来(git 历史完整保留在 `packages/*` 前缀下):

- `dsh-chat-sync`(原 https://github.com/nan1010082085/dsh-chat-sync)
- `dsh-plugin-ima-sync`(原 https://github.com/nan1010082085/dsh-plugin-ima-sync)

## License

MIT(各包同源)
