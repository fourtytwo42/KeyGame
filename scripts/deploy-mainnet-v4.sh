#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

[[ "${KEYGAME_MAINNET_V4_BROADCAST:-}" == "true" ]] || {
  echo "Mainnet broadcast is locked and requires explicit release authorization." >&2
  exit 1
}
[[ -n "${MAINNET_RELEASE_AUTHORIZATION_FILE:-}" ]] \
  && [[ -f "$MAINNET_RELEASE_AUTHORIZATION_FILE" ]] || {
  echo "A release authorization file outside the repository is required." >&2
  exit 1
}
for required in \
  ROBINHOOD_MAINNET_RPC_URL DEPLOYER_ADDRESS KEEPER_ADDRESS \
  MANAGER_ADMIN_SAFE MARKET_ADMIN_SAFE TREASURY_SAFE INITIAL_ROUND_ID \
  INITIAL_STOCK_0 INITIAL_STOCK_1 INITIAL_STOCK_2 INITIAL_STOCK_3 \
  INITIAL_SYMBOL_0 INITIAL_SYMBOL_1 INITIAL_SYMBOL_2 INITIAL_SYMBOL_3 \
  ROBINHOOD_VERIFIER_TYPE ROBINHOOD_VERIFIER_URL; do
  [[ -n "${!required:-}" ]] || {
    echo "$required is required." >&2
    exit 1
  }
done

commit="$(git rev-parse HEAD)"
grep -Fxq "sourceCommit=$commit" "$MAINNET_RELEASE_AUTHORIZATION_FILE" || {
  echo "Release authorization does not match this source commit." >&2
  exit 1
}
grep -Fxq "mainnetBroadcastAuthorized=true" \
  "$MAINNET_RELEASE_AUTHORIZATION_FILE" || {
  echo "Release authorization does not authorize mainnet broadcast." >&2
  exit 1
}
[[ -z "$(git status --porcelain)" ]] || {
  echo "Refusing to deploy dirty or untracked source." >&2
  exit 1
}
if [[ -f deployments/4663.json ]] \
  && [[ "$(jq -r '.contractVersion // empty' deployments/4663.json)" == "last-bell-v4-stock-pot" ]]; then
  echo "A v4 mainnet manifest already exists; refusing a duplicate deployment." >&2
  exit 1
fi
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
[[ -n "$upstream" && "$commit" == "$(git rev-parse "$upstream")" ]] || {
  echo "Refusing source that is not pushed to its configured upstream." >&2
  exit 1
}
[[ "$(cast chain-id --rpc-url "$ROBINHOOD_MAINNET_RPC_URL")" == "4663" ]] || {
  echo "RPC is not Robinhood mainnet chain 4663." >&2
  exit 1
}
[[ "$(cast rpc --rpc-url "$ROBINHOOD_MAINNET_RPC_URL" eth_syncing | tr -d '[:space:]')" == "false" ]] || {
  echo "Robinhood mainnet RPC is not synchronized." >&2
  exit 1
}
[[ "$(cast rpc --rpc-url "$ROBINHOOD_MAINNET_RPC_URL" eth_accounts | tr -d '[:space:]')" == "[]" ]] || {
  echo "Refusing an RPC that exposes unlocked accounts." >&2
  exit 1
}

preflight_file="$(mktemp)"
trap 'rm -f "$preflight_file"' EXIT
pnpm exec tsx scripts/preflight-mainnet-v4.ts >"$preflight_file"
for index in 0 1 2 3; do
  variable="INITIAL_SYMBOL_${index}"
  symbol="${!variable}"
  jq -e --arg symbol "$symbol" '.safeSymbols | index($symbol) != null' \
    "$preflight_file" >/dev/null || {
    echo "Initial roster symbol $symbol is not currently safe." >&2
    exit 1
  }
done
pnpm release:verify-safes
pnpm release:scan
forge fmt --check
forge test
RUN_ROBINHOOD_MAINNET_FORK=true \
  ROBINHOOD_MAINNET_FORK_RPC_URL="$ROBINHOOD_MAINNET_RPC_URL" \
  forge test --match-contract RobinhoodMainnetForkTest

# DeployMainnetV4 contains an additional compile-time false lock. The audited
# release commit must deliberately change it before this command can broadcast.
forge script script/DeployMainnet.s.sol:DeployMainnetV4 \
  --rpc-url "$ROBINHOOD_MAINNET_RPC_URL" \
  --broadcast
KEYGAME_WRITE_MANIFEST_CHAIN_ID=4663 \
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
forge script script/DeployMainnet.s.sol:DeployMainnetV4 \
  --rpc-url "$ROBINHOOD_MAINNET_RPC_URL" \
  "${verify_args[@]}" \
  | tee artifacts/deployment-verification/4663-v4.log
