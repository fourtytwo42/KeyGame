#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deployment_file="$project_root/deployments/31337.json"
rpc_url="${LOCAL_RPC_URL:-http://127.0.0.1:8545}"

export PATH="$HOME/.foundry/bin:$PATH"
cd "$project_root"

old_round="$(jq -r '.lastBellRound' "$deployment_file")"
deployer="$(jq -r '.deployer' "$deployment_file")"
payment_token="$(jq -r '.devDollar' "$deployment_file")"
payment_router="$(jq -r '.paymentRouter' "$deployment_file")"
session_player="$(jq -r '.sessionPlayer' "$deployment_file")"
mapfile -t players < <(jq -r '.players[]' "$deployment_file")
rollover_file="$project_root/.devnet/round-rollover.json"

export DEPLOYER_ADDRESS="$deployer"
export CURRENT_ROUND_ADDRESS="$old_round"

send_checked() {
  local receipt
  receipt="$(cast send "$@" --json)"
  if [[ "$(jq -r '.status' <<<"$receipt")" != "0x1" ]]; then
    echo "Devnet rollover transaction reverted: $receipt" >&2
    return 1
  fi
}

if [[ -f "$rollover_file" ]] \
  && [[ "$(jq -r '.previousRound' "$rollover_file")" == "$old_round" ]]; then
  new_round="$(jq -r '.newRound' "$rollover_file")"
  seed="$(jq -r '.seed' "$rollover_file")"
  seed="${seed%% *}"
else
  seed="$(
    cast call "$old_round" "nextRoundPool()(uint256)" --rpc-url "$rpc_url" \
      | awk '{print $1}'
  )"
  if [[ "$seed" == "0" ]]; then
    echo "The settled round has no next-round seed to transfer." >&2
    exit 1
  fi

  forge script script/DeployNextLocal.s.sol:DeployNextLocal \
    --rpc-url "$rpc_url" \
    --broadcast \
    --slow \
    --unlocked \
    --sender "$deployer"

  broadcast_file="$project_root/broadcast/DeployNextLocal.s.sol/31337/run-latest.json"
  new_round="$(
    jq -r \
      '.transactions[] | select(.contractName == "LastBellRound") | .contractAddress' \
      "$broadcast_file" | tail -n1
  )"
  if [[ -z "$new_round" || "$new_round" == "null" ]]; then
    echo "Could not recover the next round address from $broadcast_file." >&2
    exit 1
  fi
  jq -n \
    --arg previousRound "$old_round" \
    --arg newRound "$new_round" \
    --arg seed "$seed" \
    '{previousRound: $previousRound, newRound: $newRound, seed: $seed}' \
    >"$rollover_file"
fi

remaining_seed="$(
  cast call "$old_round" "nextRoundPool()(uint256)" --rpc-url "$rpc_url" \
    | awk '{print $1}'
)"
if [[ "$remaining_seed" != "0" ]]; then
  send_checked \
    "$old_round" \
    "transferNextRoundSeed(address)" \
    "$deployer" \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$deployer" \
    --gas-limit 150000
fi

initialized="$(
  cast call "$new_round" "initialized()(bool)" --rpc-url "$rpc_url"
)"
symbols=("NVDA" "AAPL" "TSLA" "SPY")
opening_prices=(10000000000 20000000000 25000000000 50000000000)
if [[ "$initialized" == "false" ]]; then
  send_checked \
    "$payment_token" \
    "approve(address,uint256)" \
    "$payment_router" \
    "$seed" \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$deployer" \
    --gas-limit 150000

  observed_hex="$(cast block latest --rpc-url "$rpc_url" --json | jq -r '.timestamp')"
  observed_at="$(cast to-dec "$observed_hex")"
  opening_reports=()
  for index in 0 1 2 3; do
    feed_id="$(cast keccak "${symbols[$index]}/USD")"
    opening_reports+=(
      "$(cast abi-encode \
        'f(bytes32,uint256,uint64,uint64,uint64)' \
        "$feed_id" \
        "${opening_prices[$index]}" \
        "$observed_at" \
        "$observed_at" \
        "$((observed_at + 30))")"
    )
  done
  opening_report_array="[$(IFS=,; echo "${opening_reports[*]}")]"
  send_checked \
    "$new_round" \
    "start(uint256,bytes[4])" \
    "$seed" \
    "$opening_report_array" \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$deployer" \
    --gas-limit 1000000
fi

for player in "${players[@]}" "$session_player"; do
  send_checked "$payment_token" "approve(address,uint256)" "$payment_router" 100000000 \
    --rpc-url "$rpc_url" --unlocked --from "$player" --gas-limit 150000
done

next_round_id="$(
  cast call "$new_round" "roundId()(uint256)" --rpc-url "$rpc_url"
)"

temporary_file="$deployment_file.next"
jq \
  --arg round "$new_round" \
  --argjson roundId "$next_round_id" \
  '.lastBellRound = $round | .currentRoundId = $roundId' \
  "$deployment_file" >"$temporary_file"
mv "$temporary_file" "$deployment_file"
rm -f "$rollover_file"

echo "Previous round: $old_round"
echo "Current round:  $new_round"
echo "Round ID:       $next_round_id"
