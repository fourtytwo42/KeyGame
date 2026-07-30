#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

: "${ALLOW_TESTNET_BROADCAST:?Set ALLOW_TESTNET_BROADCAST explicitly.}"
: "${KEYGAME_DEPLOYER_KEYSTORE:?Encrypted deployer keystore is required.}"
: "${KEYGAME_DEPLOYER_PASSWORD_FILE:?Owner-only password file is required.}"
: "${DEPLOYER_ADDRESS:?Expected deployer address is required.}"
: "${ROBINHOOD_TESTNET_RPC_URL:=http://192.168.50.117:8547}"

if [[ "$ALLOW_TESTNET_BROADCAST" != "YES_I_AM_DEPLOYING_TEST_TOKENS" ]]; then
  echo "Testnet broadcast confirmation does not match." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain -- . ':(exclude)deployments/31337.json')" ]]; then
  echo "The complete worktree must be clean before deployment." >&2
  exit 1
fi
git fetch --quiet origin main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "Deployment commit must exactly match pushed origin/main." >&2
  exit 1
fi
if [[ "$(stat -c '%a' "$KEYGAME_DEPLOYER_KEYSTORE")" =~ [2367]$ ]] \
  || [[ "$(stat -c '%a' "$KEYGAME_DEPLOYER_PASSWORD_FILE")" =~ [2367]$ ]]; then
  echo "Keystore and password file must not be group/world writable." >&2
  exit 1
fi
chain_id="$(cast chain-id --rpc-url "$ROBINHOOD_TESTNET_RPC_URL")"
syncing="$(cast rpc --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" eth_syncing)"
unlocked_accounts="$(cast rpc --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" eth_accounts)"
if [[ "$chain_id" != "46630" || "$syncing" != "false" ]]; then
  echo "Robinhood testnet RPC failed chain or synchronization checks." >&2
  exit 1
fi
if [[ "$unlocked_accounts" != "[]" ]]; then
  echo "The RPC exposes unlocked accounts; refusing deployment." >&2
  exit 1
fi
sender="$(cast wallet address \
  --keystore "$KEYGAME_DEPLOYER_KEYSTORE" \
  --password-file "$KEYGAME_DEPLOYER_PASSWORD_FILE")"
if [[ "${DEPLOYER_ADDRESS,,}" != "${sender,,}" ]]; then
  echo "DEPLOYER_ADDRESS does not match the encrypted deployment signer." >&2
  exit 1
fi
balance="$(cast balance "$sender" --rpc-url "$ROBINHOOD_TESTNET_RPC_URL")"
if [[ "$balance" == "0" ]]; then
  echo "Deployer has no testnet ETH: $sender" >&2
  exit 1
fi

asset_preflight="$(mktemp)"
trap 'rm -f "$asset_preflight"' EXIT
pnpm exec tsx scripts/preflight-testnet-assets.ts >"$asset_preflight"
forge test
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  --sender "$sender" \
  --keystore "$KEYGAME_DEPLOYER_KEYSTORE" \
  --password-file "$KEYGAME_DEPLOYER_PASSWORD_FILE" \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/ \
  --gas-estimate-multiplier 200 \
  --slow

pnpm exec tsx scripts/write-testnet-manifest.ts
mv "$asset_preflight" deployments/46630-asset-preflight.json
trap - EXIT
