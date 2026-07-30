#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

[[ "${KEYGAME_TESTNET_V4_BROADCAST:-}" == "true" ]] || {
  echo "Testnet v4 broadcast is locked. Set the explicit one-shot authorization only after devnet acceptance." >&2
  exit 1
}
[[ -n "${ROBINHOOD_TESTNET_RPC_URL:-}" ]] || {
  echo "ROBINHOOD_TESTNET_RPC_URL is required." >&2
  exit 1
}
for required in DEPLOYER_ADDRESS KEEPER_ADDRESS TREASURY_ADDRESS INITIAL_ROUND_ID; do
  [[ -n "${!required:-}" ]] || {
    echo "$required is required." >&2
    exit 1
  }
done
[[ "$(cast chain-id --rpc-url "$ROBINHOOD_TESTNET_RPC_URL")" == "46630" ]] || {
  echo "RPC is not Robinhood testnet chain 46630." >&2
  exit 1
}
[[ -z "$(git status --porcelain)" ]] || {
  echo "Refusing to deploy dirty or untracked source." >&2
  exit 1
}
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
[[ -n "$upstream" && "$(git rev-parse HEAD)" == "$(git rev-parse "$upstream")" ]] || {
  echo "Refusing to deploy source that is not pushed to its configured upstream." >&2
  exit 1
}
[[ "$(cast rpc --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" eth_accounts | tr -d '[:space:]')" == "[]" ]] || {
  echo "Refusing an RPC that exposes unlocked accounts." >&2
  exit 1
}
balance="$(cast balance --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" "$DEPLOYER_ADDRESS")"
[[ "$balance" -ge 1000000000000000 ]] || {
  echo "Deployer must retain at least 0.001 testnet ETH before broadcast." >&2
  exit 1
}

pnpm release:scan
forge build
forge test
forge script script/DeployTestnetV4.s.sol:DeployTestnetV4 \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  --broadcast
