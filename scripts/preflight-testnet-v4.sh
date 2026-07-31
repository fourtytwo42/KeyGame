#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

for required in \
  ROBINHOOD_TESTNET_RPC_URL DEPLOYER_ADDRESS KEEPER_ADDRESS \
  TREASURY_ADDRESS INITIAL_ROUND_ID; do
  [[ -n "${!required:-}" ]] || {
    echo "$required is required." >&2
    exit 1
  }
done

[[ "$(cast chain-id --rpc-url "$ROBINHOOD_TESTNET_RPC_URL")" == "46630" ]] || {
  echo "RPC is not Robinhood testnet chain 46630." >&2
  exit 1
}
[[ "$(cast rpc --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" eth_syncing | tr -d '[:space:]')" == "false" ]] || {
  echo "Robinhood testnet RPC is not synchronized." >&2
  exit 1
}
[[ "$(cast rpc --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" eth_accounts | tr -d '[:space:]')" == "[]" ]] || {
  echo "Refusing an RPC that exposes unlocked accounts." >&2
  exit 1
}

balance="$(cast balance --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" "$DEPLOYER_ADDRESS")"
reserve="${KEYGAME_TESTNET_ETH_RESERVE_WEI:-1000000000000000}"
[[ "$balance" -ge "$reserve" ]] || {
  echo "Deployer balance is below the configured post-smoke reserve." >&2
  exit 1
}

pnpm release:scan
forge fmt --check
forge build
forge test

# This executes the deployment script as an RPC simulation only. There is no
# --broadcast flag here. The separate deployment wrapper owns the only
# authorized broadcast path.
simulation_log="$(mktemp)"
trap 'rm -f "$simulation_log"' EXIT
KEYGAME_TESTNET_V4_BROADCAST=true \
  forge script script/DeployTestnetV4.s.sol:DeployTestnetV4 \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" -vvv \
  | tee "$simulation_log"

gas_price="$(cast gas-price --rpc-url "$ROBINHOOD_TESTNET_RPC_URL")"
deployment_gas="$(awk '/Estimated total gas used for script:/ {print $NF}' \
  "$simulation_log" | tail -1)"
[[ "$deployment_gas" =~ ^[0-9]+$ ]] || {
  echo "Could not extract the simulated deployment gas estimate." >&2
  exit 1
}
smoke_gas="${KEYGAME_TESTNET_TWO_ROUND_GAS_BUDGET:-10000000}"
required_balance="$((reserve + ((deployment_gas + smoke_gas) * gas_price * 120 / 100)))"
[[ "$balance" -ge "$required_balance" ]] || {
  echo "Balance does not cover deployment, two-round smoke budget, 20% margin, and reserve." >&2
  echo "Required wei: $required_balance; available wei: $balance" >&2
  exit 1
}
cat <<EOF
Testnet v4 preflight passed.
Chain: 46630
Deployer balance (wei): $balance
Reserved balance (wei): $reserve
Current gas price (wei): $gas_price
Simulated deployment gas: $deployment_gas
Two-round smoke gas budget: $smoke_gas
Required balance with 20% margin and reserve (wei): $required_balance
Deployment was simulated only. Nothing was broadcast.
EOF
