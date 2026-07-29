#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rpc_url="${LOCAL_RPC_URL:-http://127.0.0.1:8545}"
deployer="0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
accounts=(
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906"
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65"
  "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc"
  "0x976ea74026e726554db657fa54763abd0c3a0aa9"
  "0x14dc79964da2c08b23698b3d3cc7ca32193d9955"
  "0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f"
)
session_player="0xa0ee7a142d267c1f36714e4a8f75612f20a79720"

export PATH="$HOME/.foundry/bin:$PATH"
export DEPLOYER_ADDRESS="$deployer"
cd "$project_root"

send_checked() {
  local receipt
  receipt="$(cast send "$@" --json)"
  if [[ "$(jq -r '.status' <<<"$receipt")" != "0x1" ]]; then
    echo "Devnet transaction reverted: $receipt" >&2
    return 1
  fi
}

forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url "$rpc_url" \
  --broadcast \
  --unlocked \
  --sender "$deployer"

broadcast_file="$project_root/broadcast/DeployLocal.s.sol/31337/run-latest.json"
token_address="$(jq -r '.transactions[] | select(.contractName == "MockUSDG") | .contractAddress' "$broadcast_file" | head -n1)"
round_address="$(jq -r '.transactions[] | select(.contractName == "LastBellRound") | .contractAddress' "$broadcast_file" | head -n1)"

if [[ -z "$token_address" || -z "$round_address" || "$token_address" == "null" || "$round_address" == "null" ]]; then
  echo "Could not recover deployed addresses from $broadcast_file." >&2
  exit 1
fi

for index in "${!accounts[@]}"; do
  account="${accounts[$index]}"
  faction="$((index % 4))"
  send_checked "$token_address" "mint(address,uint256)" "$account" 100000000 \
    --rpc-url "$rpc_url" --unlocked --from "$deployer" --gas-limit 150000
  send_checked "$token_address" "approve(address,uint256)" "$round_address" 100000000 \
    --rpc-url "$rpc_url" --unlocked --from "$account" --gas-limit 150000
  send_checked "$round_address" "joinFaction(uint8,uint256)" "$faction" 100000000 \
    --rpc-url "$rpc_url" --unlocked --from "$account" --gas-limit 150000
done

send_checked "$token_address" "mint(address,uint256)" "$session_player" 100000000 \
  --rpc-url "$rpc_url" --unlocked --from "$deployer" --gas-limit 150000

send_checked "$round_address" "start(uint256)" 50000000 \
  --rpc-url "$rpc_url" --unlocked --from "$deployer" --gas-limit 250000
send_checked "$round_address" "claimBell()" \
  --rpc-url "$rpc_url" --unlocked --from "${accounts[0]}" --gas-limit 350000

mkdir -p "$project_root/deployments" "$project_root/public/contracts"
jq -n \
  --argjson chainId 31337 \
  --arg rpcUrl "$rpc_url" \
  --arg deployer "$deployer" \
  --arg token "$token_address" \
  --arg round "$round_address" \
  --arg sessionPlayer "$session_player" \
  --argjson players "$(printf '%s\n' "${accounts[@]}" | jq -R . | jq -s .)" \
  '{
    chainId: $chainId,
    rpcUrl: $rpcUrl,
    deployer: $deployer,
    devDollar: $token,
    lastBellRound: $round,
    sessionPlayer: $sessionPlayer,
    players: $players
  }' >"$project_root/deployments/31337.json"

forge inspect contracts/LastBellRound.sol:LastBellRound abi --json \
  >"$project_root/public/contracts/LastBellRound.abi.json"
forge inspect contracts/mocks/MockUSDG.sol:MockUSDG abi --json \
  >"$project_root/public/contracts/MockUSDG.abi.json"

printf '%s\n' \
  "NEXT_PUBLIC_APP_URL=http://192.168.50.138:3000" \
  "NEXT_PUBLIC_LOCAL_RPC_URL=http://192.168.50.138:8545" \
  "NEXT_PUBLIC_GAME_MODE=devnet" \
  "NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS=$round_address" \
  "NEXT_PUBLIC_DEV_DOLLAR_ADDRESS=$token_address" \
  "NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com" \
  >"$project_root/.env.local"

echo "LastBellRound: $round_address"
echo "MockUSDG:      $token_address"
echo "Deployment:    $project_root/deployments/31337.json"
