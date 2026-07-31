#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
commit="$(git rev-parse HEAD)"
short="${commit:0:12}"
upstream="${KEYGAME_RELEASE_UPSTREAM:-origin/codex/v4-mainnet-readiness}"
artifact_root="${KEYGAME_RELEASE_ARTIFACT_DIR:-/home/hendo420/releases/packages/$short}"
output_dir="$artifact_root/testnet-v4"
archive="$artifact_root/last-bell-v4-testnet-ready-$short.tgz"

[[ -z "$(git status --porcelain)" ]] || {
  echo "Testnet package requires a clean release worktree." >&2
  exit 1
}
[[ "$(git rev-parse "$upstream")" == "$commit" ]] || {
  echo "Testnet package source is not pushed to $upstream." >&2
  exit 1
}

rm -rf "$output_dir"
mkdir -p "$output_dir/abi" "$output_dir/storage" "$output_dir/evidence"

forge build
forge test
pnpm release:scan:mainnet

# Storage layouts are not part of Foundry's default artifacts. Rebuild them
# explicitly so `forge inspect storage-layout` is deterministic on a clean VM.
forge build --force --extra-output storageLayout

for contract in \
  LastBellRoundV4 RoundManagerV4 LifetimePointsVault RewardRouterV4 \
  PaymentRouter MockStockSwapAdapter MockUSDG MockStockToken; do
  forge inspect "$contract" abi --json >"$output_dir/abi/$contract.json"
  forge inspect "$contract" storage-layout --json \
    >"$output_dir/storage/$contract.json"
  forge inspect "$contract" bytecode \
    | sha256sum \
    | awk '{print $1}' \
    >"$output_dir/$contract.bytecode.sha256"
done

[[ -z "$(git status --porcelain)" ]] || {
  echo "Packaging checks changed the source worktree." >&2
  exit 1
}

cp deployments/46630-v4.template.json "$output_dir/deployment-manifest.template.json"
cp docs/operations/v4-mainnet-release-runbook.md \
  "$output_dir/testnet-smoke-runbook.md"
evidence_dir="${KEYGAME_RELEASE_EVIDENCE_DIR:-/home/hendo420/releases/evidence/$commit}"
if [[ -f "$evidence_dir/testnet-v4-preflight.json" ]]; then
  cp "$evidence_dir/testnet-v4-preflight.json" \
    "$output_dir/evidence/testnet-v4-preflight.json"
fi
cat >"$output_dir/testnet-authorization.template" <<EOF
sourceCommit=$commit
twoRoundSmokeAuthorized=true
chainId=46630
maxDeployments=1
maxSettledRounds=2
EOF
printf '%s\n' "$commit" >"$output_dir/source-commit.txt"
printf '%s\n' "$upstream" >"$output_dir/source-upstream.txt"
git rev-parse "$upstream" >"$output_dir/upstream-commit.txt"
: >"$output_dir/source-tree-status.txt"
printf '%s\n' "last-bell-v4-stock-pot" >"$output_dir/contract-version.txt"
printf '%s\n' \
  "NOT BROADCAST - ROBINHOOD TESTNET MOCK ASSETS ONLY" \
  "ONE DEPLOYMENT AND EXACTLY TWO SETTLED ROUNDS REQUIRE SEPARATE AUTHORIZATION" \
  >"$output_dir/RELEASE-STATUS.txt"
(
  cd "$output_dir"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z | xargs -0 sha256sum >SHA256SUMS
)
tar -czf "$archive" -C "$artifact_root" testnet-v4
(
  cd "$artifact_root"
  sha256sum "$(basename "$archive")" >"$(basename "$archive").sha256"
)

echo "Testnet-ready package created at $archive"
