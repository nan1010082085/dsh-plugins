#!/usr/bin/env bash
# sync-skills.sh - 从 aigc-suite-skills 源仓库一次性取材到本插件包
#
# 边界原则（与 WorkBuddy 专家团同一口径）：
#   - 一次性取材，此后互不绑定：源仓库改了不等于本包要改，本包不回写源仓库
#   - 只读源仓库，绝不写入 ~/.claude/skills 与 ~/.workbuddy
#
# 用法:
#   ./scripts/sync-skills.sh                 # 默认源 ~/work/aigc-suite-skills
#   AIGC_SUITE_SRC=/path/to/src ./scripts/sync-skills.sh

set -eo pipefail

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${AIGC_SUITE_SRC:-$HOME/work/aigc-suite-skills}"

if [[ ! -d "$SRC/skills" || ! -d "$SRC/shared" || ! -d "$SRC/tools" ]]; then
  echo "[sync-skills] 源仓库不存在或不完整: $SRC" >&2
  exit 1
fi

echo "[sync-skills] 取材来源: $SRC"
echo "[sync-skills] 目标包:   $PKG_DIR"

# 1. skills/ 全量原样（SKILL.md + references/）
rsync -a --delete \
  --exclude '__pycache__' \
  "$SRC/skills/" "$PKG_DIR/skills/"

# 2. shared/ 规则词典全量
rsync -a --delete "$SRC/shared/" "$PKG_DIR/shared/"

# 3. tools/ 机器闸门（排除 WorkBuddy 打包专用脚本与 OCR 抽取工具，不公开分发）
rsync -a --delete \
  --exclude '__pycache__' \
  --exclude 'build_individual_experts.py' \
  --exclude 'build_platform_skill_packages.py' \
  --exclude 'fanqie_ocr.py' \
  --exclude 'build_ocr.sh' \
  --exclude 'ocr.swift' \
  "$SRC/tools/" "$PKG_DIR/tools/"

echo "[sync-skills] 完成："
echo "  skills: $(find "$PKG_DIR/skills" -name 'SKILL.md' | wc -l | tr -d ' ') 个"
echo "  shared: $(find "$PKG_DIR/shared" -type f | wc -l | tr -d ' ') 个文件"
echo "  tools:  $(find "$PKG_DIR/tools" -type f | wc -l | tr -d ' ') 个文件"
