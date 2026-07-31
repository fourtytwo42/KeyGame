#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

commit="${KEYGAME_RELEASE_COMMIT:-$(git rev-parse HEAD)}"
upstream="${KEYGAME_RELEASE_UPSTREAM:-origin/codex/v4-mainnet-readiness}"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || {
  echo "KEYGAME_RELEASE_COMMIT must be a full Git SHA." >&2
  exit 1
}
[[ "$(git rev-parse "$upstream")" == "$commit" ]] || {
  echo "Release commit does not match $upstream." >&2
  exit 1
}

short="${commit:0:12}"
release_root="${KEYGAME_RELEASE_ROOT:-/home/hendo420/releases}"
worktree="$release_root/keygame-v4-testnet-$short"
[[ ! -e "$worktree" ]] || {
  echo "Release worktree already exists: $worktree" >&2
  exit 1
}
mkdir -p "$release_root"
git worktree add --detach "$worktree" "$commit"
(
  cd "$worktree"
  corepack pnpm install --frozen-lockfile
  [[ -z "$(git status --porcelain)" ]] || {
    echo "Prepared release worktree is not clean." >&2
    exit 1
  }
)
printf '%s\n' "$worktree"
