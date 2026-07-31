#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

[[ "${KEYGAME_TESTNET_V4_BROADCAST:-}" == "true" ]] || {
  echo "Testnet v4 broadcast is locked." >&2
  exit 1
}
[[ -n "${TESTNET_RELEASE_AUTHORIZATION_FILE:-}" ]] \
  && [[ -f "$TESTNET_RELEASE_AUTHORIZATION_FILE" ]] || {
  echo "A testnet release authorization file outside the repository is required." >&2
  exit 1
}

commit="$(git rev-parse HEAD)"
grep -Fxq "sourceCommit=$commit" "$TESTNET_RELEASE_AUTHORIZATION_FILE" || {
  echo "Testnet authorization does not match this source commit." >&2
  exit 1
}
grep -Fxq "twoRoundSmokeAuthorized=true" \
  "$TESTNET_RELEASE_AUTHORIZATION_FILE" || {
  echo "Authorization does not permit the two-round testnet smoke." >&2
  exit 1
}
for required in ROBINHOOD_VERIFIER_TYPE ROBINHOOD_VERIFIER_URL; do
  [[ -n "${!required:-}" ]] || {
    echo "$required is required." >&2
    exit 1
  }
done
[[ -z "$(git status --porcelain)" ]] || {
  echo "Refusing to deploy dirty or untracked source." >&2
  exit 1
}
if [[ -f deployments/46630.json ]] \
  && [[ "$(jq -r '.contractVersion // empty' deployments/46630.json)" == "last-bell-v4-stock-pot" ]]; then
  echo "A v4 testnet manifest already exists; refusing a duplicate deployment." >&2
  exit 1
fi
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
[[ -n "$upstream" && "$commit" == "$(git rev-parse "$upstream")" ]] || {
  echo "Refusing to deploy source that is not pushed to its configured upstream." >&2
  exit 1
}

bash scripts/preflight-testnet-v4.sh
forge script script/DeployTestnetV4.s.sol:DeployTestnetV4 \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  --broadcast
KEYGAME_WRITE_MANIFEST_CHAIN_ID=46630 \
  pnpm exec tsx scripts/write-v4-deployment-manifest.ts

mkdir -p artifacts/deployment-verification
verify_args=(
  --resume --verify
  --verifier "$ROBINHOOD_VERIFIER_TYPE"
  --verifier-url "$ROBINHOOD_VERIFIER_URL"
)
if [[ -n "${ROBINHOOD_VERIFIER_API_KEY:-}" ]]; then
  verify_args+=(--etherscan-api-key "$ROBINHOOD_VERIFIER_API_KEY")
fi
forge script script/DeployTestnetV4.s.sol:DeployTestnetV4 \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  "${verify_args[@]}" \
  | tee artifacts/deployment-verification/46630-v4.log
