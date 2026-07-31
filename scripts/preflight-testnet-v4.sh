#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

for required in \
  ROBINHOOD_TESTNET_RPC_URL DEPLOYER_ADDRESS KEEPER_ADDRESS FAUCET_ADDRESS \
  TREASURY_ADDRESS INITIAL_ROUND_ID KEYGAME_DEPLOYER_KEYSTORE \
  KEYGAME_DEPLOYER_PASSWORD_FILE KEYGAME_RELEASE_UPSTREAM; do
  [[ -n "${!required:-}" ]] || {
    echo "$required is required." >&2
    exit 1
  }
done
for secret_file in \
  "$KEYGAME_DEPLOYER_KEYSTORE" "$KEYGAME_DEPLOYER_PASSWORD_FILE"; do
  [[ -f "$secret_file" && ! -L "$secret_file" ]] || {
    echo "Release credential file is missing or is a symlink: $secret_file" >&2
    exit 1
  }
  permissions="$(stat -c '%a' "$secret_file")"
  [[ "$permissions" == "600" || "$permissions" == "400" ]] || {
    echo "Release credential file must use mode 600 or 400: $secret_file" >&2
    exit 1
  }
done

derived_deployer="$(cast wallet address \
  --keystore "$KEYGAME_DEPLOYER_KEYSTORE" \
  --password-file "$KEYGAME_DEPLOYER_PASSWORD_FILE")"
[[ "${derived_deployer,,}" == "${DEPLOYER_ADDRESS,,}" ]] || {
  echo "Configured deployer does not match the encrypted keystore." >&2
  exit 1
}

commit="$(git rev-parse HEAD)"
[[ -z "$(git status --porcelain)" ]] || {
  echo "Refusing a dirty release worktree." >&2
  exit 1
}
upstream_commit="$(git rev-parse "$KEYGAME_RELEASE_UPSTREAM" 2>/dev/null || true)"
[[ -n "$upstream_commit" && "$upstream_commit" == "$commit" ]] || {
  echo "Release commit is not pushed to $KEYGAME_RELEASE_UPSTREAM." >&2
  exit 1
}

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

deployer_balance="$(cast balance --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" "$DEPLOYER_ADDRESS")"
keeper_balance="$(cast balance --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" "$KEEPER_ADDRESS")"
faucet_balance="$(cast balance --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" "$FAUCET_ADDRESS")"
reserve="${KEYGAME_TESTNET_ETH_RESERVE_WEI:-1000000000000000}"

pnpm release:scan:mainnet
forge fmt --check
forge build
forge test
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration

# The script is simulated with the exact deployer sender but without
# --broadcast or wallet arguments. No credential is used for the simulation.
simulation_log="$(mktemp)"
trap 'rm -f "$simulation_log"' EXIT
KEYGAME_TESTNET_V4_BROADCAST=true \
  forge script script/DeployTestnetV4.s.sol:DeployTestnetV4 \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  --sender "$DEPLOYER_ADDRESS" -vvv \
  | tee "$simulation_log"

rpc_gas_price="$(cast gas-price --rpc-url "$ROBINHOOD_TESTNET_RPC_URL")"
simulated_gwei="$(awk '/Estimated gas price:/ {print $(NF-1)}' \
  "$simulation_log" | tail -1)"
deployment_gas="$(awk '/Estimated total gas used for script:/ {print $NF}' \
  "$simulation_log" | tail -1)"
[[ "$deployment_gas" =~ ^[0-9]+$ && -n "$simulated_gwei" ]] || {
  echo "Could not extract the simulated deployment gas estimate." >&2
  exit 1
}
simulated_gas_price="$(cast to-wei "$simulated_gwei" gwei)"
budget_gas_price="$rpc_gas_price"
if [[ "$simulated_gas_price" -gt "$budget_gas_price" ]]; then
  budget_gas_price="$simulated_gas_price"
fi
smoke_gas="${KEYGAME_TESTNET_TWO_ROUND_GAS_BUDGET:-10000000}"
execution_wei="$(((deployment_gas + smoke_gas) * budget_gas_price))"
execution_with_margin_wei="$(((execution_wei * 120 + 99) / 100))"
required_balance="$((reserve + execution_with_margin_wei))"
headroom_wei="$((deployer_balance - required_balance))"
[[ "$deployer_balance" -ge "$required_balance" ]] || {
  echo "Balance does not cover deployment, two-round smoke, 20% margin, and reserve." >&2
  echo "Required wei: $required_balance; available wei: $deployer_balance" >&2
  exit 1
}
[[ -z "$(git status --porcelain)" ]] || {
  echo "Release checks changed the source worktree; refusing evidence." >&2
  exit 1
}

evidence_dir="${KEYGAME_RELEASE_EVIDENCE_DIR:-/home/hendo420/releases/evidence/$commit}"
mkdir -p "$evidence_dir"
evidence_path="$evidence_dir/testnet-v4-preflight.json"
jq -n \
  --arg checkedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg sourceCommit "$commit" \
  --arg upstream "$KEYGAME_RELEASE_UPSTREAM" \
  --arg upstreamCommit "$upstream_commit" \
  --arg deployer "$DEPLOYER_ADDRESS" \
  --arg keeper "$KEEPER_ADDRESS" \
  --arg faucet "$FAUCET_ADDRESS" \
  --arg deployerBalanceWei "$deployer_balance" \
  --arg keeperBalanceWei "$keeper_balance" \
  --arg faucetBalanceWei "$faucet_balance" \
  --arg rpcGasPriceWei "$rpc_gas_price" \
  --arg simulatedGasPriceWei "$simulated_gas_price" \
  --arg budgetGasPriceWei "$budget_gas_price" \
  --arg deploymentGas "$deployment_gas" \
  --arg smokeGas "$smoke_gas" \
  --arg reserveWei "$reserve" \
  --arg requiredBalanceWei "$required_balance" \
  --arg headroomWei "$headroom_wei" \
  '{
    ok: true,
    checkedAt: $checkedAt,
    chainId: 46630,
    sourceCommit: $sourceCommit,
    upstream: $upstream,
    upstreamCommit: $upstreamCommit,
    sourceClean: true,
    sourcePushed: true,
    senderMatchesKeystore: true,
    deployer: {address: $deployer, balanceWei: $deployerBalanceWei},
    keeper: {address: $keeper, balanceWei: $keeperBalanceWei},
    faucet: {address: $faucet, balanceWei: $faucetBalanceWei},
    gas: {
      rpcPriceWei: $rpcGasPriceWei,
      simulatedPriceWei: $simulatedGasPriceWei,
      budgetPriceWei: $budgetGasPriceWei,
      deployment: $deploymentGas,
      twoRoundSmoke: $smokeGas,
      marginBps: 2000,
      reserveWei: $reserveWei,
      requiredBalanceWei: $requiredBalanceWei,
      headroomWei: $headroomWei
    },
    authorizationScope: {maxDeployments: 1, maxSettledRounds: 2},
    broadcastAuthorized: false
  }' >"$evidence_path"

cat <<EOF
Testnet v4 preflight passed.
Chain: 46630
Source commit: $commit
Upstream commit: $upstream_commit
Deployer balance (wei): $deployer_balance
Keeper balance (wei): $keeper_balance
Faucet balance (wei): $faucet_balance
Reserved deployer balance (wei): $reserve
RPC gas price (wei): $rpc_gas_price
Simulated gas price (wei): $simulated_gas_price
Budget gas price (wei): $budget_gas_price
Simulated deployment gas: $deployment_gas
Two-round smoke gas budget: $smoke_gas
Required balance with 20% margin and reserve (wei): $required_balance
Headroom after budget and reserve (wei): $headroom_wei
Evidence: $evidence_path
Deployment was simulated only. Nothing was broadcast.
EOF
