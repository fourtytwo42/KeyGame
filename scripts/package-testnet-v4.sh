#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$project_root/artifacts/testnet-v4"
cd "$project_root"

rm -rf "$output_dir"
mkdir -p "$output_dir/abi" "$output_dir/storage"

forge build
forge test
pnpm release:scan

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

cp deployments/46630-v4.template.json "$output_dir/deployment-manifest.template.json"
cp docs/operations/v4-mainnet-release-runbook.md \
  "$output_dir/testnet-smoke-runbook.md"
git rev-parse HEAD >"$output_dir/source-commit.txt"
git status --porcelain >"$output_dir/source-tree-status.txt"
git diff --binary HEAD | sha256sum | awk '{print $1}' \
  >"$output_dir/source-tree-diff.sha256"
printf '%s\n' "last-bell-v4-stock-pot" >"$output_dir/contract-version.txt"
printf '%s\n' "NOT BROADCAST - ROBINHOOD TESTNET MOCK ASSETS ONLY" \
  >"$output_dir/RELEASE-STATUS.txt"

tar -czf "$project_root/artifacts/last-bell-v4-testnet-ready.tgz" \
  -C "$project_root/artifacts" testnet-v4
(
  cd "$project_root/artifacts"
  sha256sum last-bell-v4-testnet-ready.tgz \
    >last-bell-v4-testnet-ready.tgz.sha256
)

echo "Testnet-ready package created at artifacts/last-bell-v4-testnet-ready.tgz"
