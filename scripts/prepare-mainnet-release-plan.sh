#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

die() { echo "$*" >&2; exit 1; }
required=(
  ROBINHOOD_MAINNET_RPC_URL ROBINHOOD_MAINNET_FALLBACK_RPC_URL
  DEPLOYER_ADDRESS RELEASE_UPSTREAM_REF KEYGAME_MAINNET_PLANNED_MANIFEST
  INITIAL_ROUND_ID INITIAL_STOCK_0 INITIAL_STOCK_1 INITIAL_STOCK_2 INITIAL_STOCK_3
  INITIAL_SYMBOL_0 INITIAL_SYMBOL_1 INITIAL_SYMBOL_2 INITIAL_SYMBOL_3
)
for name in "${required[@]}"; do [[ -n "${!name:-}" ]] || die "$name is required."; done
[[ "$KEYGAME_MAINNET_PLANNED_MANIFEST" = /* ]] || die "The planned manifest path must be absolute."
case "$KEYGAME_MAINNET_PLANNED_MANIFEST" in
  "$project_root"/*) die "The planned manifest must remain outside the repository." ;;
esac
[[ ! -e "$KEYGAME_MAINNET_PLANNED_MANIFEST" ]] || die "Refusing to overwrite an existing planned manifest."

commit="$(git rev-parse HEAD)"
[[ -z "$(git status --porcelain)" ]] || die "Refusing dirty or untracked source."
[[ "$commit" == "$(git rev-parse "$RELEASE_UPSTREAM_REF")" ]] || die "Release commit does not exactly match RELEASE_UPSTREAM_REF."
[[ "$(cast chain-id --rpc-url "$ROBINHOOD_MAINNET_RPC_URL")" == "4663" ]] || die "LAN RPC is not chain 4663."
[[ "$(cast rpc --rpc-url "$ROBINHOOD_MAINNET_RPC_URL" eth_syncing | tr -d '[:space:]')" == "false" ]] || die "LAN RPC is not synchronized."
[[ "$(cast rpc --rpc-url "$ROBINHOOD_MAINNET_RPC_URL" eth_accounts | tr -d '[:space:]')" == "[]" ]] || die "LAN RPC exposes unlocked accounts."
[[ "$(cast chain-id --rpc-url "$ROBINHOOD_MAINNET_FALLBACK_RPC_URL")" == "4663" ]] || die "Reference RPC is not chain 4663."
[[ "$(cast rpc --rpc-url "$ROBINHOOD_MAINNET_FALLBACK_RPC_URL" eth_syncing | tr -d '[:space:]')" == "false" ]] || die "Reference RPC is not synchronized."

primary_head="$(cast block-number --rpc-url "$ROBINHOOD_MAINNET_RPC_URL")"
reference_head="$(cast block-number --rpc-url "$ROBINHOOD_MAINNET_FALLBACK_RPC_URL")"
lag=$(( reference_head > primary_head ? reference_head - primary_head : 0 ))
(( lag <= 5 )) || die "CONNECTION DEGRADED: LAN RPC is more than five blocks behind reference."
fork_hash="$(cast block "$primary_head" --field hash --rpc-url "$ROBINHOOD_MAINNET_RPC_URL")"
common_head=$(( primary_head < reference_head ? primary_head : reference_head ))
primary_common_hash="$(cast block "$common_head" --field hash --rpc-url "$ROBINHOOD_MAINNET_RPC_URL")"
reference_common_hash="$(cast block "$common_head" --field hash --rpc-url "$ROBINHOOD_MAINNET_FALLBACK_RPC_URL")"
[[ "$primary_common_hash" == "$reference_common_hash" ]] || die "LAN and reference RPCs disagree on the canonical block."
deployment_nonce="$(cast nonce "$DEPLOYER_ADDRESS" --rpc-url "$ROBINHOOD_MAINNET_RPC_URL")"

simulation_port="${KEYGAME_MAINNET_SIMULATION_PORT:-9653}"
simulation_rpc="http://127.0.0.1:${simulation_port}"
simulation_dir="$(mktemp -d)"
anvil_pid=""
cleanup() {
  if [[ -n "$anvil_pid" ]] && kill -0 "$anvil_pid" 2>/dev/null; then kill "$anvil_pid" 2>/dev/null || true; fi
  rm -rf -- "$simulation_dir"
}
trap cleanup EXIT

anvil --fork-url "$ROBINHOOD_MAINNET_RPC_URL" \
  --fork-block-number "$primary_head" --chain-id 4663 \
  --port "$simulation_port" --auto-impersonate --silent \
  >"$simulation_dir/anvil.log" 2>&1 &
anvil_pid=$!
for _ in $(seq 1 60); do
  if cast chain-id --rpc-url "$simulation_rpc" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
[[ "$(cast chain-id --rpc-url "$simulation_rpc")" == "4663" ]] || die "Fork simulation did not start."
cast rpc --rpc-url "$simulation_rpc" anvil_setBalance "$DEPLOYER_ADDRESS" 0x3635C9ADC5DEA00000 >/dev/null
cast rpc --rpc-url "$simulation_rpc" anvil_setNonce "$DEPLOYER_ADDRESS" "$(printf '0x%x' "$deployment_nonce")" >/dev/null

KEYGAME_MAINNET_V4_BROADCAST=true forge script script/DeployMainnet.s.sol:DeployMainnetV4 \
  --rpc-url "$simulation_rpc" --sender "$DEPLOYER_ADDRESS" \
  --unlocked --broadcast --slow

KEYGAME_MAINNET_SIMULATION_RPC_URL="$simulation_rpc" \
KEYGAME_MAINNET_DEPLOYMENT_NONCE="$deployment_nonce" \
KEYGAME_MAINNET_FORK_BLOCK_NUMBER="$primary_head" \
KEYGAME_MAINNET_FORK_BLOCK_HASH="$fork_hash" \
  pnpm exec tsx scripts/write-mainnet-planned-manifest.ts

pnpm exec tsx scripts/verify-mainnet-planned-deployment.ts > \
  "${KEYGAME_MAINNET_PLANNED_MANIFEST}.verification.json"
sha256sum "${KEYGAME_MAINNET_PLANNED_MANIFEST}.verification.json" > \
  "${KEYGAME_MAINNET_PLANNED_MANIFEST}.verification.json.sha256"
