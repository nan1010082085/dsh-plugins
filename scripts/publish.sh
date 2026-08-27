#!/usr/bin/env bash
# publish.sh - 发布插件到 npm 并同步到 GitHub
#
# 用法:
#   ./scripts/publish.sh <plugin> [--patch|--minor|--major]
#   ./scripts/publish.sh ima-sync --patch
#   ./scripts/publish.sh chat-sync --minor
#
# 流程:
#   1. 更新版本号（根据参数）
#   2. 同步 README 到独立 GitHub repo
#   3. 发布到 npm
#   4. 更新 CLAUDE.md 中的版本号

set -eo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[publish]${NC} $*"; }
warn() { echo -e "${YELLOW}[publish]${NC} $*"; }
err() { echo -e "${RED}[error]${NC} $*" >&2; }

# 检查参数
if [[ $# -lt 1 ]]; then
  err "用法: $0 <plugin> [--patch|--minor|--major]"
  err "  plugin: ima-sync | chat-sync | mcp-sync"
  exit 1
fi

PLUGIN="$1"
VERSION_TYPE="${2:---patch}"  # 默认 patch

# 验证插件名
case "$PLUGIN" in
  ima-sync|chat-sync|mcp-sync) ;;
  *) err "未知插件: $PLUGIN"; exit 1 ;;
esac

# 验证版本类型
case "$VERSION_TYPE" in
  --patch|--minor|--major) ;;
  *) err "无效版本类型: $VERSION_TYPE (使用 --patch, --minor, 或 --major)"; exit 1 ;;
esac

PKG_DIR="packages/${PLUGIN}"
PKG_JSON="${PKG_DIR}/package.json"

if [[ ! -f "$PKG_JSON" ]]; then
  err "找不到 $PKG_JSON"
  exit 1
fi

# 读取当前版本
CURRENT_VERSION=$(node -p "require('./${PKG_JSON}').version")
log "当前版本: ${CURRENT_VERSION}"

# 计算新版本
case "$VERSION_TYPE" in
  --patch) NEW_VERSION=$(node -e "const v='${CURRENT_VERSION}'.split('.'); v[2]=parseInt(v[2])+1; console.log(v.join('.'))") ;;
  --minor) NEW_VERSION=$(node -e "const v='${CURRENT_VERSION}'.split('.'); v[1]=parseInt(v[1])+1; v[2]=0; console.log(v.join('.'))") ;;
  --major) NEW_VERSION=$(node -e "const v='${CURRENT_VERSION}'.split('.'); v[0]=parseInt(v[0])+1; v[1]=0; v[2]=0; console.log(v.join('.'))") ;;
esac

log "新版本: ${NEW_VERSION}"

# 确认发布
read -p "确认发布 ${PLUGIN}@${NEW_VERSION}? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  warn "已取消"
  exit 0
fi

# 步骤 1: 更新版本号
log "步骤 1/4: 更新版本号..."
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('${PKG_JSON}', 'utf8'));
  pkg.version = '${NEW_VERSION}';
  fs.writeFileSync('${PKG_JSON}', JSON.stringify(pkg, null, 2) + '\n');
"
log "✓ 版本号已更新为 ${NEW_VERSION}"

# 步骤 2: 同步 README 到 GitHub
log "步骤 2/4: 同步 README 到 GitHub..."
./scripts/sync-repos.sh "$PLUGIN"
log "✓ README 已同步到 GitHub"

# 步骤 3: 发布到 npm
log "步骤 3/4: 发布到 npm..."
cd "$PKG_DIR"
npm publish
cd "$REPO_ROOT"
log "✓ 已发布到 npm"

# 步骤 4: 更新 CLAUDE.md
log "步骤 4/4: 更新 CLAUDE.md..."
# 获取插件的 npm 包名
PKG_NAME=$(node -p "require('./${PKG_JSON}').name")

# 使用 node 更新 CLAUDE.md 中的版本号（更可靠）
node -e "
  const fs = require('fs');
  const content = fs.readFileSync('CLAUDE.md', 'utf8');
  const lines = content.split('\n');
  const newLines = lines.map(line => {
    // 匹配包含插件名和版本号的行
    if (line.includes('| ${PLUGIN} |') && line.includes('${PKG_NAME} |')) {
      return line.replace(/\| [0-9]+\.[0-9]+\.[0-9]+ \|$/, '| ${NEW_VERSION} |');
    }
    return line;
  });
  fs.writeFileSync('CLAUDE.md', newLines.join('\n'));
"
log "✓ CLAUDE.md 已更新"

log "🎉 发布完成！${PLUGIN}@${NEW_VERSION}"
log ""
log "后续步骤:"
log "  dsh plugin --profile web add ${PKG_NAME}  # 安装到 profile"
log "  dsh web                                     # 验证无报错"
