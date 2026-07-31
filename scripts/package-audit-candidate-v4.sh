#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$project_root/artifacts/audit-candidate-v4"
cd "$project_root"

rm -rf "$output_dir"
mkdir -p "$output_dir/abi" "$output_dir/storage" "$output_dir/evidence"

printf '%s  %s\n' \
  "6e1535550ad5087acc8163500a1341a7d518cfb6e9d2de551992c69f32565362" \
  "artifacts/torture/v4-torture-live-2026-07-31T07-10-55-856Z.json" \
  | sha256sum --check
printf '%s  %s\n' \
  "6d89d4ced375afdd0547edc9590b247e07db0d37033ff06a757e81c1a85102a6" \
  "artifacts/torture/v4-torture-live-2026-07-31T07-10-55-856Z.md" \
  | sha256sum --check

forge fmt --check
forge build
forge test
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
NEXT_DIST_DIR=.next-protected \
  NEXT_PUBLIC_GAME_MODE=mainnet \
  KEYGAME_CHAIN_ID=4663 \
  KEYGAME_DEPLOYMENT_MANIFEST="$project_root/deployments/4663.template.json" \
  NEXT_PUBLIC_APP_URL=https://audit.invalid \
  NEXT_PUBLIC_CONTRACT_VERSION=last-bell-v4-stock-pot \
  NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS=0x1111111111111111111111111111111111111111 \
  NEXT_PUBLIC_ROUND_MANAGER_ADDRESS=0x2222222222222222222222222222222222222222 \
  NEXT_PUBLIC_DEV_DOLLAR_ADDRESS=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 \
  NEXT_PUBLIC_PAYMENT_ROUTER_ADDRESS=0x3333333333333333333333333333333333333333 \
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=audit-scan-only \
  NEXT_PUBLIC_WALLETCONNECT_ALLOWED_ORIGINS=https://audit.invalid \
  pnpm release:scan
RUN_ROBINHOOD_MAINNET_FORK=true \
  ROBINHOOD_MAINNET_FORK_RPC_URL="${ROBINHOOD_MAINNET_RPC_URL:-http://192.168.50.173:8547}" \
  forge test --match-contract RobinhoodMainnetForkTest -vvv \
  >"$output_dir/evidence/mainnet-fork.txt"
pnpm exec tsx scripts/preflight-mainnet-v4.ts \
  >"$output_dir/evidence/mainnet-preflight.json"

# Storage layouts are not part of Foundry's default artifacts. Rebuild them
# explicitly so `forge inspect storage-layout` is deterministic on a clean VM.
forge build --force --extra-output storageLayout

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
cp docs/qualification/v4-local-release-evidence.md \
  "$output_dir/evidence/local-release-evidence.md"
cp docs/prd/16-stock-pot-lifetime-points.md \
  "$output_dir/evidence/authoritative-prd.md"
cp artifacts/torture/v4-torture-live-2026-07-31T07-10-55-856Z.json \
  "$output_dir/evidence/torture-report.json"
cp artifacts/torture/v4-torture-live-2026-07-31T07-10-55-856Z.md \
  "$output_dir/evidence/torture-report.md"
git rev-parse HEAD >"$output_dir/source-commit.txt"
git status --porcelain --untracked-files=all -- \
  . \
  ":(exclude)deployments/31337.json" \
  ":(exclude).torture/**" \
  ":(exclude)artifacts/**" \
  >"$output_dir/source-tree-status.txt"
printf '%s\n' \
  "deployments/31337.json (mutable devnet deployment manifest)" \
  ".torture/ (isolated torture runtime)" \
  "artifacts/ (generated evidence and packages)" \
  >"$output_dir/RUNTIME-EXCLUSIONS.txt"
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
