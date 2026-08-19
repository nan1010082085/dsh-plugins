#!/usr/bin/env bash
# sync-repos.sh - 将 monorepo 各包同步到独立 GitHub repo
#
# 用法:
#   ./scripts/sync-repos.sh              # 同步所有包
#   ./scripts/sync-repos.sh ima-sync     # 只同步 ima-sync
#   ./scripts/sync-repos.sh chat-sync    # 只同步 chat-sync

set -eo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[sync]${NC} $*"; }
err() { echo -e "${RED}[error]${NC} $*" >&2; }

get_repo_name() {
  case "$1" in
    ima-sync)  echo "dsh-plugin-ima-sync" ;;
    chat-sync) echo "dsh-chat-sync" ;;
    mcp-sync)  echo "dsh-mcp-sync" ;;
    *)         echo "" ;;
  esac
}

sync_package() {
  local pkg="$1"
  local repo_name
  repo_name="$(get_repo_name "$pkg")"
  local pkg_dir="packages/${pkg}"

  if [[ -z "$repo_name" ]]; then
    err "Unknown package: $pkg"; return 1
  fi
  if [[ ! -d "$pkg_dir" ]]; then
    err "Directory not found: $pkg_dir"; return 1
  fi

  log "Syncing ${pkg} → github:nan1010082085/${repo_name}"

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap "rm -rf '$tmp_dir'" EXIT

  # 复制包内容到临时目录
  cp -R "$pkg_dir"/. "$tmp_dir"/

  # 复制根目录的公共文件（如果存在）
  for f in LICENSE README.md; do
    [[ -f "$f" ]] && cp "$f" "$tmp_dir/" 2>/dev/null || true
  done

  # 初始化 git 并推送
  cd "$tmp_dir"
  git init -q
  git add -A
  git commit -q -m "sync from monorepo $(cd "$REPO_ROOT" && git rev-parse --short HEAD)"
  git remote add origin "git@github.com:nan1010082085/${repo_name}.git"
  git push origin HEAD:main --force

  cd "$REPO_ROOT"
  rm -rf "$tmp_dir"
  trap - EXIT

  log "✓ ${pkg} synced to github:nan1010082085/${repo_name}"
}

main() {
  local target="${1:-all}"
  if [[ "$target" == "all" ]]; then
    for pkg in ima-sync chat-sync mcp-sync; do
      sync_package "$pkg"
    done
  else
    sync_package "$target"
  fi
  log "Done!"
}

main "$@"
