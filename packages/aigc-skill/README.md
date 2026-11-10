# dsh-plugin-aigc-skill

DSH 插件：**AIGC 漫剧创作技能套件**的分发载体。将 [aigc-suite-skills](https://github.com/nan1010082085/aigc-suite-skills) 的 18 个 skill、shared 规则词典与 tools 机器闸门原样打入 npm 包，在 DSH 设置面板中提供技能文档浏览、机器闸门状态与默认风格配置。

## 边界（与其他分发渠道互不影响）

| | Claude Code 安装 | WorkBuddy 专家团 | **本插件** |
|---|---|---|---|
| 载体 | git 仓库 + symlink | `~/.workbuddy/` 专家包 | npm 包（自带技能副本） |
| 技能文件落点 | `~/.claude/skills/` | 专家包内部 | **包内路径，只读** |

- **不写 `~/.claude/skills`**、不建任何 symlink：装没装本插件对 Claude Code 零影响
- **不读不写 `~/.workbuddy/`**：不影响 WorkBuddy 专家团与 marketplace.json
- **一次性取材**：技能内容由 `scripts/sync-skills.sh` 从源仓库拷入，此后与源仓库互不绑定、独立版本演进

## 功能

- **技能文档浏览**：按流水线链路（剧本 → 素材 → 分镜 → 执行 → 质检 → 风格）分组展示 18 个 skill，点击查看 SKILL.md 全文
- **机器闸门状态**：`tools/` 下 pre_gen_gate（五道硬闸预检）、credit_gate（花钱门）、brand_scan（广告闸）等门禁脚本可用性一览
- **规则词典**：`shared/` 15 份规则文档（硬闸、运镜词典、提示词公式、风格库等）
- **默认风格配置**：一部剧锁定 1 种风格 skill（style-*），配置走 API 持久化

## 安装

```bash
dsh plugin --profile web add github:nan1010082085/dsh-plugin-aigc-skill
# 或 npm 安装
dsh plugin --profile web add dsh-plugin-aigc-skill
dsh web   # 验证无报错
```

## API（仅本机回环访问）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dsh-aigc-skill/overview` | 技能清单（按链路分组）+ 闸门状态 + shared 文件列表 |
| GET | `/api/dsh-aigc-skill/skill?name=<dir>` | 单个 skill 的 SKILL.md 全文与 references 清单 |
| GET | `/api/dsh-aigc-skill/file?path=<skills\|shared\|tools>/...` | 包内文件内容（白名单目录，拒绝路径穿越） |
| GET/POST | `/api/dsh-aigc-skill/config` | 配置读写（`~/.config/aigc-skill/dsh-config.json`） |

## 技能内容更新

技能内容随包版本固定。需要更新时（一次性取材，非同步机制）：

```bash
./scripts/sync-skills.sh                 # 默认源 ~/work/aigc-suite-skills
AIGC_SUITE_SRC=/path/to/src ./scripts/sync-skills.sh
```

然后按 DSH 发布流程 bump version 并重新发布。

## 开发

```bash
# 修改 lib/index.js（服务端）/ lib/client.js（客户端）后走发布流程：
./scripts/publish.sh aigc-skill --patch   # 在 dsh-plugins monorepo 根目录执行
```
