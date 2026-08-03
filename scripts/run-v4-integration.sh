#!/usr/bin/env bash
set -euo pipefail

export FOUNDRY_PROFILE=release

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$(mktemp -d /tmp/keygame-v4-integration.XXXXXX)"
rpc_port="${V4_INTEGRATION_RPC_PORT:-9655}"
rpc_url="http://127.0.0.1:$rpc_port"
manifest="$runtime_dir/deployment.json"
deployer="0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
session_player="0xa0ee7a142d267c1f36714e4a8f75612f20a79720"
players=(
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906"
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65"
  "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc"
  "0x976ea74026e726554db657fa54763abd0c3a0aa9"
  "0x14dc79964da2c08b23698b3d3cc7ca32193d9955"
  "0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f"
)
anvil_pid=""

export PATH="$HOME/.foundry/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

cleanup() {
  if [[ -n "$anvil_pid" ]] && kill -0 "$anvil_pid" 2>/dev/null; then
    kill "$anvil_pid"
    wait "$anvil_pid" 2>/dev/null || true
  fi
  rm -rf -- "$runtime_dir"
}
trap cleanup EXIT

if cast chain-id --rpc-url "$rpc_url" >/dev/null 2>&1; then
  echo "Integration RPC port $rpc_port is already in use." >&2
  exit 1
fi

anvil \
  --host 127.0.0.1 \
  --port "$rpc_port" \
  --chain-id 31337 \
  --auto-impersonate \
  >"$runtime_dir/anvil.log" 2>&1 &
anvil_pid="$!"

for _ in $(seq 1 100); do
  if cast chain-id --rpc-url "$rpc_url" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
if ! cast chain-id --rpc-url "$rpc_url" >/dev/null 2>&1; then
  echo "Isolated integration Anvil did not become ready." >&2
  exit 1
fi

cd "$project_root"
export DEPLOYER_ADDRESS="$deployer"
forge script script/DeployLocalV4.s.sol:DeployLocalV4 \
  --rpc-url "$rpc_url" \
  --broadcast \
  --slow \
  --unlocked \
  --sender "$deployer" \
  >"$runtime_dir/deploy.log"

broadcast_file="$project_root/broadcast/DeployLocalV4.s.sol/31337/run-latest.json"
token="$(jq -r '.transactions[] | select(.contractName=="MockUSDG") | .contractAddress' "$broadcast_file" | head -n1)"
adapter="$(jq -r '.transactions[] | select(.contractName=="MockStockSwapAdapter") | .contractAddress' "$broadcast_file" | head -n1)"
manager="$(jq -r '.transactions[] | select(.contractName=="RoundManagerV4") | .contractAddress' "$broadcast_file" | head -n1)"
reward_router="$(jq -r '.transactions[] | select(.contractName=="RewardRouterV4") | .contractAddress' "$broadcast_file" | head -n1)"
mapfile -t stocks < <(jq -r '.transactions[] | select(.contractName=="MockStockToken") | .contractAddress' "$broadcast_file")
payment_router="$(cast call "$manager" 'paymentRouter()(address)' --rpc-url "$rpc_url")"
vault="$(cast call "$manager" 'lifetimeVault()(address)' --rpc-url "$rpc_url")"
round="$(cast call "$manager" 'activeRound()(address)' --rpc-url "$rpc_url")"
deployment_block="$(cast block-number --rpc-url "$rpc_url")"

if [[ -z "$token" || -z "$adapter" || -z "$manager" || -z "$reward_router" ||
      -z "$payment_router" || -z "$vault" || -z "$round" || "${#stocks[@]}" -ne 4 ]]; then
  echo "Could not recover isolated v4 deployment addresses." >&2
  exit 1
fi

cast rpc anvil_setBalance "$session_player" 0x3635c9adc5dea00000 \
  --rpc-url "$rpc_url" >/dev/null
cast send "$token" 'mint(address,uint256)' "$session_player" 1000000000000000 \
  --from "$deployer" --unlocked --rpc-url "$rpc_url" >/dev/null
cast send "${stocks[0]}" 'mint(address,uint256)' "$session_player" 1 \
  --from "$deployer" --unlocked --rpc-url "$rpc_url" >/dev/null
for index in "${!players[@]}"; do
  player="${players[$index]}"
  cast send "$token" 'mint(address,uint256)' "$player" 1000000000000000 \
    --from "$deployer" --unlocked --rpc-url "$rpc_url" >/dev/null
  cast send "${stocks[$((index % 4))]}" 'mint(address,uint256)' "$player" 1 \
    --from "$deployer" --unlocked --rpc-url "$rpc_url" >/dev/null
done

jq -n \
  --argjson chainId 31337 \
  --argjson deploymentBlock "$deployment_block" \
  --arg sourceCommit "$(git rev-parse HEAD)" \
  --arg rpc "$rpc_url" \
  --arg deployer "$deployer" \
  --arg token "$token" \
  --arg adapter "$adapter" \
  --arg manager "$manager" \
  --arg paymentRouter "$payment_router" \
  --arg vault "$vault" \
  --arg rewardRouter "$reward_router" \
  --arg round "$round" \
  --arg sessionPlayer "$session_player" \
  --argjson stocks "$(printf '%s\n' "${stocks[@]}" | jq -R . | jq -s .)" \
  --argjson players "$(printf '%s\n' "${players[@]}" | jq -R . | jq -s .)" \
  '{
    schemaVersion:4,environment:"anvil-integration",chainId:$chainId,
    deploymentBlock:$deploymentBlock,sourceCommit:$sourceCommit,mockOnly:true,
    rpcUrl:$rpc,rpc:{primary:$rpc},deployer:$deployer,stockTokens:$stocks,
    devDollar:$token,paymentRouter:$paymentRouter,swapAdapter:$adapter,
    roundManager:$manager,lifetimePointsVault:$vault,rewardRouter:$rewardRouter,
    lastBellRound:$round,sessionPlayer:$sessionPlayer,players:$players,
    contractVersion:"last-bell-v4-stock-pot",
    contracts:{manager:$manager,paymentRouter:$paymentRouter,
      paymentToken:$token,marketVerifier:$adapter,lifetimePointsVault:$vault,
      rewardRouter:$rewardRouter,swapAdapter:$adapter,activeRound:$round},
    verifier:{type:"mock"}
  }' >"$manifest"

env \
  KEYGAME_CHAIN_ID=31337 \
  KEYGAME_DEPLOYMENT_MANIFEST="$manifest" \
  V4_DEVNET_DEPLOYMENT_MANIFEST="$manifest" \
  LOCAL_RPC_URL="$rpc_url" \
  NEXT_PUBLIC_LOCAL_RPC_URL="$rpc_url" \
  pnpm test:integration:raw
