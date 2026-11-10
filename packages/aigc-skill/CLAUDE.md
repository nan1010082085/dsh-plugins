# dsh-plugin-aigc-skill 开发规则

## 插件概述

AIGC 漫剧创作技能套件（aigc-suite-skills）的 DSH 分发载体：18 个 skill + shared 规则词典 + tools 机器闸门随包分发，设置面板提供技能文档浏览、闸门状态与默认风格配置。

## 边界（强制，用户 2026-11-07 口径）

- **不写 `~/.claude/skills`**、不建 symlink：与其他 Claude 安装（Claude Code symlink 安装）零交叉
- **不读不写 `~/.workbuddy/`**：不影响 WorkBuddy 专家团「漫剧制片厂」与 marketplace.json
- **一次性取材**：`scripts/sync-skills.sh` 从 `~/work/aigc-suite-skills` 拷入 skills/shared/tools，此后与源仓库互不绑定、独立版本演进（与 WorkBuddy 专家团同一边界原则）
- **取材排除项**：WorkBuddy 打包专用脚本（build_individual_experts.py、build_platform_skill_packages.py）与 OCR 抽取工具（fanqie_ocr.py、build_ocr.sh、ocr.swift）不入包

## 安装（任一方式）

```sh
# GitHub 安装
dsh plugin --profile web add github:nan1010082085/dsh-plugin-aigc-skill

# npm 安装
dsh plugin --profile web add dsh-plugin-aigc-skill
```

## 发布流程（每次修改必须遵循）

1. 修改 `lib/index.js`（服务端）或 `lib/client.js`（客户端），或 `./scripts/sync-skills.sh` 更新技能内容
2. 更新 `package.json` 的 `version`
3. `./scripts/sync-repos.sh aigc-skill`（同步到独立 GitHub repo）
4. `cd packages/aigc-skill && npm publish`
5. `dsh plugin --profile web add github:nan1010082085/dsh-plugin-aigc-skill`
6. 运行 `dsh web` 验证无报错

## 文件结构

| 文件 | 用途 |
|------|------|
| `lib/index.js` | 服务端：4 条只读 API 路由（overview/skill/file/config） |
| `lib/client.js` | 客户端：设置面板（settings.section，技能文档浏览/闸门状态/默认风格） |
| `lib/index.d.ts` | TypeScript 类型声明 |
| `skills/` `shared/` `tools/` | 技能内容（sync-skills.sh 一次性取材，只读） |
| `scripts/sync-skills.sh` | 取材脚本（只读源仓库，绝不写 ~/.claude/skills 与 ~/.workbuddy） |
| `cordis.patch.yml` | Loader 注册补丁 |
| `package.json` | 包配置（dsh.bundle + dsh.client） |

## 服务端规范（lib/index.js）

- 导出：`{ name, inject, Config, apply }`，`name = "aigc-skill"`，`inject = ["webServer"]`
- 文件读取限制在包内 skills/shared/tools 三棵目录（`resolvePackageFile` 拒绝路径穿越）
- 路由仅接受本机回环请求（`isLoopbackRequest`）
- 配置持久化：`~/.config/aigc-skill/dsh-config.json`
- 必须使用 `ctx.logger.info/warn` 输出日志，格式：`[aigc-skill] 消息`

## 客户端规范（lib/client.js）

- 通过 `window.__ModuleLoader__.load()` 注册，factory 导出 `{ apply, inject }`
- `inject = ["slots", "locale"]`，`ctx.slots.inject("settings.section", ...)`（id=aigc-skill, order=40）
- 中英文国际化（`ctx.locale.register`，NS=`settings.aigcSkill`）
- 配置通过 API（`/api/dsh-aigc-skill/config`）获取和保存

## 依赖

- `@deepseek-ai/schemastery` — 配置 schema（z.enum 用 `z.union([z.const(...)])` 替代）
- `dsh.client.inject`: `@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-settings`
