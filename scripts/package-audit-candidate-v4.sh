#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$project_root/artifacts/audit-candidate-v4"
cd "$project_root"

rm -rf "$output_dir"
mkdir -p "$output_dir/abi" "$output_dir/storage" "$output_dir/evidence"

printf '%s  %s\n' \
  "4bd458bbe6da728b8dcf4d6ffe70b16b29e828d1fc9f41b5bef7f96fc6ca463b" \
  "artifacts/torture/v4-torture-live-2026-07-31T03-44-39-339Z.json" \
  | sha256sum --check
printf '%s  %s\n' \
  "82454f8106ba34e6db9983722de43436e177c88c16328a2d8c9a781523c80b09" \
  "artifacts/torture/v4-torture-live-2026-07-31T03-44-39-339Z.md" \
  | sha256sum --check

forge fmt --check
forge build
forge test
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm release:scan
RUN_ROBINHOOD_MAINNET_FORK=true \
  ROBINHOOD_MAINNET_FORK_RPC_URL="${ROBINHOOD_MAINNET_RPC_URL:-http://192.168.50.173:8547}" \
  forge test --match-contract RobinhoodMainnetForkTest -vvv \
  >"$output_dir/evidence/mainnet-fork.txt"
pnpm exec tsx scripts/preflight-mainnet-v4.ts \
  >"$output_dir/evidence/mainnet-preflight.json"

for contract in \
  LastBellRoundV4 RoundManagerV4 LifetimePointsVault RewardRouterV4 \
  RobinhoodStockSwapAdapter PaymentRouter; do
  forge inspect "$contract" abi --json >"$output_dir/abi/$contract.json"
  forge inspect "$contract" storage-layout --json \
    >"$output_dir/storage/$contract.json"
  forge inspect "$contract" bytecode \
    | sha256sum | awk '{print $1}' \
    >"$output_dir/$contract.bytecode.sha256"
done

cp deployments/4663.template.json "$output_dir/mainnet-manifest.template.json"
cp deployments/46630-v4.template.json "$output_dir/testnet-manifest.template.json"
cp docs/qualification/v4-torture-baseline.json \
  "$output_dir/evidence/torture-baseline.json"
cp docs/qualification/v4-mainnet-readiness-ledger.md \
  "$output_dir/evidence/mainnet-readiness-ledger.md"
cp docs/operations/v4-mainnet-release-runbook.md \
  "$output_dir/evidence/mainnet-release-runbook.md"
cp docs/operations/privileged-roles-and-incidents.md \
  "$output_dir/evidence/privileged-roles-and-incidents.md"
cp docs/qualification/v4-threat-model.md \
  "$output_dir/evidence/threat-model.md"
cp docs/qualification/v4-external-gates.md \
  "$output_dir/evidence/external-gates.md"
cp docs/prd/16-stock-pot-lifetime-points.md \
  "$output_dir/evidence/authoritative-prd.md"
cp artifacts/torture/v4-torture-live-2026-07-31T03-44-39-339Z.json \
  "$output_dir/evidence/torture-report.json"
cp artifacts/torture/v4-torture-live-2026-07-31T03-44-39-339Z.md \
  "$output_dir/evidence/torture-report.md"
git rev-parse HEAD >"$output_dir/source-commit.txt"
git status --porcelain >"$output_dir/source-tree-status.txt"
printf '%s\n' "NO TESTNET OR MAINNET BROADCAST" \
  "AUDIT, LEGAL, SAFES, AND EXTERNAL WALLET UAT REMAIN BLOCKING" \
  >"$output_dir/RELEASE-STATUS.txt"
(
  cd "$output_dir"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z | xargs -0 sha256sum >SHA256SUMS
)
tar -czf "$project_root/artifacts/last-bell-v4-audit-candidate.tgz" \
  -C "$project_root/artifacts" audit-candidate-v4
(
  cd "$project_root/artifacts"
  sha256sum last-bell-v4-audit-candidate.tgz \
    >last-bell-v4-audit-candidate.tgz.sha256
)
