#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$project_root/artifacts/internal-assurance-candidate-v4"
cd "$project_root"

torture_report_json="${V4_TORTURE_REPORT_JSON:-}"
release_upstream_ref="${RELEASE_UPSTREAM_REF:-}"
release_baseline_commit="${RELEASE_BASELINE_COMMIT:-d26b06cf0963f19c9c5248935fc7c51077304a83}"
if [[ -z "$release_upstream_ref" ]]; then
  echo "RELEASE_UPSTREAM_REF must identify the pushed release commit." >&2
  exit 1
fi
export RELEASE_UPSTREAM_REF="$release_upstream_ref"
if [[ -z "$torture_report_json" ]]; then
  echo "V4_TORTURE_REPORT_JSON must identify the accepted commit-bound torture report." >&2
  exit 1
fi
torture_report_json="$(realpath "$torture_report_json")"
case "$torture_report_json" in
  "$project_root"/artifacts/torture/*.json) ;;
  *)
    echo "Torture evidence must be under artifacts/torture/." >&2
    exit 1
    ;;
esac
torture_report_md="${torture_report_json%.json}.md"
for report in "$torture_report_json" "$torture_report_md"; do
  [[ -f "$report" && -f "$report.sha256" ]] || {
    echo "Missing report or checksum: $report" >&2
    exit 1
  }
  (
    cd "$(dirname "$report")"
    sha256sum --check "$(basename "$report.sha256")"
  )
done
source_commit="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$release_baseline_commit" "$source_commit" || {
  echo "Release source does not descend from the accepted internal-assurance baseline." >&2
  exit 1
}
qualified_commit="$(jq -r '.sourceCommit // empty' "$torture_report_json")"
[[ "$qualified_commit" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Torture evidence has no valid source commit." >&2
  exit 1
}
git merge-base --is-ancestor "$qualified_commit" "$source_commit" || {
  echo "Torture evidence is not an ancestor of the packaging commit." >&2
  exit 1
}
while IFS= read -r changed_file; do
  case "$changed_file" in
    MEMORY.md|package.json|deployments/4663.template.json|deployments/46630-v4.template.json|db/012_v4_mainnet_canary.sql|db/013_one_hour_mainnet_canary.sql|docs/*|docs/**/*|ops/systemd/keygame-mainnet-canary.service|ops/systemd/keygame-mainnet-canary.timer|services/common.ts|scripts/package-audit-candidate-v4.sh|scripts/preflight-mainnet-v4.ts|scripts/deploy-mainnet-v4.sh|scripts/verify-mainnet-authorization.ts|scripts/write-v4-deployment-manifest.ts|scripts/scan-mainnet-protected-build.sh|scripts/mainnet-canary.ts|scripts/mainnet-canary-restart-service.sh|scripts/test-mainnet-canary-migration.sh|scripts/estimate-mainnet-release-budget.ts|scripts/generate-mainnet-canary-wallet.ts|scripts/run-mainnet-canary-dry-run.sh|scripts/run-v4-e2e.sh|src/app/status/page.tsx|src/components/wallet-panel.tsx|src/lib/env.ts|src/lib/env.test.ts|src/lib/release/mainnet-v4.ts|src/lib/release/mainnet-v4.test.ts|src/lib/release/mainnet-canary.ts|src/lib/release/mainnet-canary.test.ts|src/lib/server/deployment.ts|src/lib/server/system-status.ts|src/lib/web3/config.ts|src/lib/web3/last-bell-abi.ts|test/contracts/RobinhoodMainnetFork.t.sol) ;;
    *)
      echo "Runtime or contract source changed after torture qualification: $changed_file" >&2
      exit 1
      ;;
  esac
done < <(git diff --name-only "$release_baseline_commit".."$source_commit")

if [[ -n "$(git diff --name-only "$release_baseline_commit".."$source_commit" -- contracts script/DeployMainnet.s.sol)" ]]; then
  echo "Contract or mainnet deployment bytecode changed after the accepted release baseline." >&2
  exit 1
fi
jq -e --arg commit "$qualified_commit" '
  .sourceCommit == $commit and
  .contractCampaign.state == "passed" and
  (.contractCampaign.totalActions | tonumber) == 1000000 and
  (.reconciliation.acceptedContributions | tonumber) == 10000 and
  (.reconciliation.discrepancies | tonumber) == 0 and
  (.reconciliation.pointDiscrepancies | tonumber) == 0 and
  (.reconciliation.failedAssertions | tonumber) == 0 and
  (.reconciliation.failedActions | tonumber) == 0 and
  (.reconciliation.unresolvedRevertedTransactions | tonumber) == 0 and
  any(.scenarios[];
    .action_type == "v4-settled-round" and (.count | tonumber) >= 500) and
  any(.scenarios[];
    .action_type == "v4-cancelled-round" and (.count | tonumber) >= 50)
' "$torture_report_json" >/dev/null || {
  echo "Torture evidence does not satisfy the internal-assurance gate." >&2
  exit 1
}

rm -rf "$output_dir"
mkdir -p "$output_dir/abi" "$output_dir/storage" "$output_dir/evidence"

forge fmt --check
forge build
forge test
pnpm security:review
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:migrations
pnpm test:e2e
NEXT_DIST_DIR=.next-protected \
  NEXT_PUBLIC_GAME_MODE=mainnet \
  KEYGAME_CHAIN_ID=4663 \
  KEYGAME_DEPLOYMENT_MANIFEST="$project_root/deployments/4663.template.json" \
  NEXT_PUBLIC_APP_URL=https://assurance.invalid \
  NEXT_PUBLIC_CONTRACT_VERSION=last-bell-v4-stock-pot \
  NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS=0x1111111111111111111111111111111111111111 \
  NEXT_PUBLIC_ROUND_MANAGER_ADDRESS=0x2222222222222222222222222222222222222222 \
  NEXT_PUBLIC_DEV_DOLLAR_ADDRESS=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 \
  NEXT_PUBLIC_PAYMENT_ROUTER_ADDRESS=0x3333333333333333333333333333333333333333 \
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
cp docs/operations/mainnet-authorization.template.json \
  "$output_dir/evidence/mainnet-authorization.template.json"
cp docs/operations/privileged-roles-and-incidents.md \
  "$output_dir/evidence/privileged-roles-and-incidents.md"
cp docs/qualification/v4-threat-model.md \
  "$output_dir/evidence/threat-model.md"
cp docs/qualification/v4-external-gates.md \
  "$output_dir/evidence/external-gates.md"
cp docs/qualification/v4-local-release-evidence.md \
  "$output_dir/evidence/local-release-evidence.md"
cp docs/qualification/internal-security-review-checklist.md \
  "$output_dir/evidence/internal-security-review-checklist.md"
cp docs/qualification/operator-risk-acknowledgement.md \
  "$output_dir/evidence/operator-risk-acknowledgement.md"
cp -R artifacts/internal-security-review \
  "$output_dir/evidence/internal-security-review"
cp docs/prd/16-stock-pot-lifetime-points.md \
  "$output_dir/evidence/authoritative-prd.md"
cp "$torture_report_json" "$output_dir/evidence/torture-report.json"
cp "$torture_report_md" "$output_dir/evidence/torture-report.md"
printf '%s\n' "$source_commit" >"$output_dir/source-commit.txt"
printf '%s\n' "$qualified_commit" \
  >"$output_dir/torture-qualified-source-commit.txt"
printf '%s\n' "$release_baseline_commit" \
  >"$output_dir/release-baseline-commit.txt"
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
  "INTERNALLY REVIEWED - NO INDEPENDENT AUDIT" \
  "SINGLE DEPLOYER EOA - NO LEGAL REVIEW - NO INDEPENDENT AUDIT" \
  "EXTERNAL WALLET UAT SKIPPED - BROWSER WALLET COMPATIBILITY UNVERIFIED" \
  "EXPLICIT MAINNET AUTHORIZATION REMAINS BLOCKING" \
  >"$output_dir/RELEASE-STATUS.txt"
(
  cd "$output_dir"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z | xargs -0 sha256sum >SHA256SUMS
)
tar -czf "$project_root/artifacts/last-bell-v4-internal-assurance-candidate.tgz" \
  -C "$project_root/artifacts" internal-assurance-candidate-v4
(
  cd "$project_root/artifacts"
  sha256sum last-bell-v4-internal-assurance-candidate.tgz \
    >last-bell-v4-internal-assurance-candidate.tgz.sha256
)
