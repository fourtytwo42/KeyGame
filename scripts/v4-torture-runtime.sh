#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.torture"
rpc_url="http://127.0.0.1:9545"
database_url="postgresql:///keygame?host=/var/run/postgresql&options=-c%20search_path%3Dkeygame_torture&application_name=keygame_torture_runtime"
manifest="$runtime_dir/deployment.json"
deployer="0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"

export PATH="$HOME/.foundry/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
mkdir -p "$runtime_dir"

wait_rpc() {
  for _ in $(seq 1 100); do
    if cast chain-id --rpc-url "$rpc_url" >/dev/null 2>&1; then return; fi
    sleep 0.1
  done
  echo "Torture Anvil did not become ready." >&2
  exit 1
}

stop_pid() {
  local file="$1"
  local expected="$2"
  [[ -f "$file" ]] || return 0
  local pid
  pid="$(cat "$file")"
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$file"
    return 0
  fi
  local args
  args="$(ps -o args= -p "$pid")"
  if [[ "$args" != *"$expected"* ]]; then
    echo "Refusing to stop unexpected PID $pid: $args" >&2
    exit 1
  fi
  local sid
  sid="$(ps -o sid= -p "$pid" | tr -d ' ')"
  if [[ "$sid" == "$pid" ]]; then kill -- "-$pid"; else kill "$pid"; fi
  for _ in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  rm -f "$file"
}

stop_runtime() {
  stop_pid "$runtime_dir/controller.pid" "v4-soak:run"
  stop_pid "$runtime_dir/monitor.pid" "v4-torture-monitor.sh"
  stop_pid "$runtime_dir/faults.pid" "v4-torture-faults.sh"
  stop_pid "$runtime_dir/app.pid" "next start"
  stop_pid "$runtime_dir/keeper.pid" "service:v4-devnet-keeper"
  stop_pid "$runtime_dir/indexer.pid" "service:indexer"
  stop_pid "$runtime_dir/anvil.pid" "9545"
}

start_runtime() {
  stop_runtime
  if cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; then
    cast block-number --rpc-url http://127.0.0.1:8545 \
      >"$runtime_dir/qualified-devnet-block-before.txt"
    sha256sum "$project_root/deployments/31337.json" \
      >"$runtime_dir/qualified-manifest-before.sha256"
  fi

  psql "postgresql:///keygame?host=/var/run/postgresql" -v ON_ERROR_STOP=1 \
    -c "DROP SCHEMA IF EXISTS keygame_torture CASCADE"
  psql "postgresql:///keygame?host=/var/run/postgresql" -v ON_ERROR_STOP=1 \
    -c "CREATE SCHEMA keygame_torture AUTHORIZATION CURRENT_USER"
  for migration in "$project_root"/db/*.sql; do
    psql "$database_url" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  done

  nohup setsid anvil \
    --host 127.0.0.1 \
    --port 9545 \
    --chain-id 31337 \
    --auto-impersonate \
    --prune-history 50 \
    --transaction-block-keeper 25000 \
    >"$runtime_dir/anvil.log" 2>&1 &
  echo "$!" >"$runtime_dir/anvil.pid"
  wait_rpc

  export DEPLOYER_ADDRESS="$deployer"
  forge script script/DeployLocalV4.s.sol:DeployLocalV4 \
    --rpc-url "$rpc_url" \
    --broadcast \
    --slow \
    --unlocked \
    --sender "$deployer" \
    >"$runtime_dir/deploy.log"

  local broadcast_file="$project_root/broadcast/DeployLocalV4.s.sol/31337/run-latest.json"
  local token adapter manager reward_router payment_router vault round block
  token="$(jq -r '.transactions[] | select(.contractName=="MockUSDG") | .contractAddress' "$broadcast_file" | head -n1)"
  adapter="$(jq -r '.transactions[] | select(.contractName=="MockStockSwapAdapter") | .contractAddress' "$broadcast_file" | head -n1)"
  manager="$(jq -r '.transactions[] | select(.contractName=="RoundManagerV4") | .contractAddress' "$broadcast_file" | head -n1)"
  reward_router="$(jq -r '.transactions[] | select(.contractName=="RewardRouterV4") | .contractAddress' "$broadcast_file" | head -n1)"
  mapfile -t stocks < <(jq -r '.transactions[] | select(.contractName=="MockStockToken") | .contractAddress' "$broadcast_file")
  payment_router="$(cast call "$manager" 'paymentRouter()(address)' --rpc-url "$rpc_url")"
  vault="$(cast call "$manager" 'lifetimeVault()(address)' --rpc-url "$rpc_url")"
  round="$(cast call "$manager" 'activeRound()(address)' --rpc-url "$rpc_url")"
  block="$(cast block-number --rpc-url "$rpc_url")"
  if [[ -z "$token" || -z "$manager" || -z "$round" || "${#stocks[@]}" -ne 4 ]]; then
    echo "Torture deployment address recovery failed." >&2
    exit 1
  fi

  players=()
  for index in $(seq 1 64); do
    player="$(printf '0x%040x' "$((0x10000 + index))")"
    players+=("$player")
    cast rpc anvil_setBalance "$player" 0x3635c9adc5dea00000 \
      --rpc-url "$rpc_url" >/dev/null
    cast send "$token" 'mint(address,uint256)' "$player" 1000000000000000 \
      --from "$deployer" --unlocked --rpc-url "$rpc_url" >/dev/null
    cast send "$token" 'approve(address,uint256)' "$payment_router" \
      0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
      --from "$player" --unlocked --rpc-url "$rpc_url" >/dev/null
    ticker="$(((index - 1) % 4))"
    cast send "${stocks[$ticker]}" 'mint(address,uint256)' "$player" 1 \
      --from "$deployer" --unlocked --rpc-url "$rpc_url" >/dev/null
  done

  jq -n \
    --argjson chainId 31337 \
    --argjson deploymentBlock "$block" \
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
    --argjson stocks "$(printf '%s\n' "${stocks[@]}" | jq -R . | jq -s .)" \
    --argjson players "$(printf '%s\n' "${players[@]}" | jq -R . | jq -s .)" \
    '{
      schemaVersion:4,environment:"anvil",chainId:$chainId,
      deploymentBlock:$deploymentBlock,sourceCommit:$sourceCommit,mockOnly:true,
      rpc:{primary:$rpc},deployer:$deployer,players:$players,stockTokens:$stocks,
      devDollar:$token,paymentRouter:$paymentRouter,swapAdapter:$adapter,
      roundManager:$manager,lifetimePointsVault:$vault,rewardRouter:$rewardRouter,
      lastBellRound:$round,sessionPlayer:$players[0],
      contractVersion:"last-bell-v4-stock-pot",
      contracts:{manager:$manager,paymentRouter:$paymentRouter,
        paymentToken:$token,marketVerifier:$adapter,lifetimePointsVault:$vault,
        rewardRouter:$rewardRouter,swapAdapter:$adapter,activeRound:$round},
      verifier:{type:"mock"}
    }' >"$manifest"

  common_env=(
    "DATABASE_URL=$database_url"
    "KEYGAME_CHAIN_ID=31337"
    "KEYGAME_DEPLOYMENT_MANIFEST=$manifest"
  )
  nohup setsid env "${common_env[@]}" INDEXER_CONFIRMATIONS=0 \
    pnpm service:indexer >"$runtime_dir/indexer.log" 2>&1 &
  echo "$!" >"$runtime_dir/indexer.pid"
  nohup setsid env "${common_env[@]}" V4_KEEPER_POLL_MS=50 \
    pnpm service:v4-devnet-keeper >"$runtime_dir/keeper.log" 2>&1 &
  echo "$!" >"$runtime_dir/keeper.pid"

  env "${common_env[@]}" \
    NEXT_DIST_DIR=.next-torture \
    NEXT_PUBLIC_GAME_MODE=devnet \
    NEXT_PUBLIC_CONTRACT_VERSION=last-bell-v4-stock-pot \
    NEXT_PUBLIC_LOCAL_RPC_URL="$rpc_url" \
    LOCAL_RPC_URL="$rpc_url" \
    V4_DEVNET_DEPLOYMENT_MANIFEST="$manifest" \
    pnpm build >"$runtime_dir/build.log" 2>&1
  nohup setsid env "${common_env[@]}" \
    NEXT_DIST_DIR=.next-torture \
    NEXT_PUBLIC_GAME_MODE=devnet \
    NEXT_PUBLIC_CONTRACT_VERSION=last-bell-v4-stock-pot \
    NEXT_PUBLIC_LOCAL_RPC_URL="$rpc_url" \
    LOCAL_RPC_URL="$rpc_url" \
    V4_DEVNET_DEPLOYMENT_MANIFEST="$manifest" \
    PORT=3100 \
    pnpm exec next start --hostname 127.0.0.1 --port 3100 \
    >"$runtime_dir/app.log" 2>&1 &
  echo "$!" >"$runtime_dir/app.pid"
  pnpm exec wait-on --timeout 30000 http://127.0.0.1:3100/status

  run_id="$(env "${common_env[@]}" V4_SOAK_PROFILE=torture \
    V4_SOAK_TARGET_ROUNDS=500 V4_SOAK_CANCEL_ROUNDS=50 \
    pnpm v4-soak:start | tail -n1)"
  printf '%s\n' "$run_id" >"$runtime_dir/run-id.txt"
  printf '%s\n' "$run_id"
  echo "Torture runtime ready: $rpc_url, database keygame_torture, app port 3100"
}

case "${1:-status}" in
  start) start_runtime ;;
  stop) stop_runtime ;;
  *)
    for file in anvil indexer keeper app controller monitor faults; do
      if [[ -f "$runtime_dir/$file.pid" ]]; then
        pid="$(cat "$runtime_dir/$file.pid")"
        if kill -0 "$pid" 2>/dev/null; then state=running; else state=stopped; fi
        printf '%-10s %s %s\n' "$file" "$pid" "$state"
      fi
    done
    ;;
esac
