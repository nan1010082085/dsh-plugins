# dsh-plugins 开发规则

## 发布流程（强制，每次修改必须遵循）

1. 修改插件代码（`packages/<plugin>/lib/`）
2. 更新 `package.json` 中的 `version`（遵循 semver：patch=修复、minor=新功能、major=破坏性变更）
3. 发布到 npm：`cd packages/<plugin> && npm publish`
4. **同步到独立 GitHub repo**：`./scripts/sync-repos.sh <plugin>` 或 `./scripts/sync-repos.sh`（全部）
5. 安装到 profile：`dsh plugin --profile web add github:nan1010082085/<repo-name>`
6. 验证：运行 `dsh web` 确认无报错

### 同步规则（强制）

**每次发布 npm 后，必须同步到独立 GitHub repo，保证两种安装方式版本一致：**

```bash
# 发布后必须执行
npm publish                    # 1. 发布到 npm
./scripts/sync-repos.sh        # 2. 同步到所有独立 repo
# 或单个
./scripts/sync-repos.sh ima-sync
```

**禁止只发布 npm 不同步 GitHub，或只同步 GitHub 不发布 npm。**

### 插件清单

| 插件 | 包名 | 独立 repo | 说明 |
|------|------|----------|------|
| ima-sync | dsh-plugin-ima-sync | github:nan1010082085/dsh-plugin-ima-sync | IMA 上传 |
| chat-sync | dsh-chat-sync | github:nan1010082085/dsh-chat-sync | 对话同步 |
| mcp-sync | dsh-mcp-sync | github:nan1010082085/dsh-mcp-sync | MCP 同步 |

### 安装方式

```bash
# 方式一：GitHub 安装（推荐，不依赖 npm registry 缓存）
dsh plugin --profile web add github:nan1010082085/dsh-plugin-ima-sync
dsh plugin --profile web add github:nan1010082085/dsh-chat-sync
dsh plugin --profile web add github:nan1010082085/dsh-mcp-sync

# 方式二：npm 安装
dsh plugin --profile web add dsh-plugin-ima-sync
dsh plugin --profile web add dsh-chat-sync
dsh plugin --profile web add dsh-mcp-sync
```

## Monorepo 结构

```
dsh-plugins/
├── packages/
│   ├── ima-sync/          # IMA 同步插件
│   ├── chat-sync/         # 对话同步插件
│   └── mcp-sync/          # MCP 配置同步插件
├── scripts/
│   └── sync-repos.sh      # 同步到独立 repo 脚本
├── package.json           # 根目录，private: true，不发布
└── CLAUDE.md              # 本文件
```

## 插件结构规范

### 服务端（lib/index.js）

- 必须导出：`{ name, inject, Config, apply }`
- `inject`：声明依赖的 cordis 服务（如 `["webServer", "tools"]`）
- 必须使用 `ctx.logger.info/warn` 输出日志，格式：`[插件名] 消息`

### 客户端（lib/client.js）

- 必须通过 `window.__ModuleLoader__.load()` 注册
- factory 内必须导出：`{ apply, inject }`
- `inject` 必须声明 apply 中使用的 cordis 服务

### package.json

- `repository` 必须指向独立 GitHub repo（不是 monorepo）
- `exports` 必须包含 `"."` 和 `"./client"` 两个入口
