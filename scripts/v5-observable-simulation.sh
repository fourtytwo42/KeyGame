#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.observable"
manifest="${KEYGAME_DEPLOYMENT_MANIFEST:-$project_root/deployments/31337.json}"
schema_name="${KEYGAME_OBSERVABLE_SCHEMA:-keygame_observable}"
database_url="${DATABASE_URL:-postgresql:///keygame?host=/var/run/postgresql&options=-csearch_path%3D$schema_name&application_name=keygame_v5_observable}"
unit="keygame-v5-observable-simulation.service"
indexer_unit="keygame-v5-devnet-indexer.service"
keeper_unit="keygame-v5-devnet-keeper.service"
node_bin="${KEYGAME_NODE_BIN:-$HOME/.nvm/versions/node/v24.18.0/bin}"
foundry_bin="${KEYGAME_FOUNDRY_BIN:-$HOME/.foundry/bin}"
target_rounds="${V4_SOAK_TARGET_ROUNDS:-800}"
cancel_rounds="${V4_SOAK_CANCEL_ROUNDS:-80}"
interval_ms="${V4_SOAK_ENDURANCE_INTERVAL_MS:-36000}"
duration_hours="${V4_SOAK_DURATION_HOURS:-8}"
call_delay_ms="${V4_OBSERVABLE_CALL_DELAY_MS:-400}"

export PATH="$node_bin:$foundry_bin:$PATH"
mkdir -p "$runtime_dir"

ensure_database() {
  [[ "$schema_name" =~ ^[a-zA-Z0-9_]+$ ]] || {
    echo "Invalid observable database schema name." >&2
    exit 1
  }
  psql keygame -v ON_ERROR_STOP=1 \
    -c "CREATE SCHEMA IF NOT EXISTS $schema_name AUTHORIZATION CURRENT_USER" \
    >/dev/null
}

manifest_value() {
  jq -er "$1" "$manifest"
}

assert_devnet() {
  [[ -f "$manifest" ]] || { echo "Missing devnet manifest: $manifest" >&2; exit 1; }
  local rpc chain version mock
  rpc="$(manifest_value '.rpc.primary')"
  chain="$(cast chain-id --rpc-url "$rpc")"
  version="$(manifest_value '.contractVersion')"
  mock="$(manifest_value '.mockOnly')"
  [[ "$chain" == "31337" ]] || { echo "Observable simulation refuses chain $chain." >&2; exit 1; }
  [[ "$version" == "saved-bell-v5-market-pot" ]] || { echo "Expected v5 contracts, got $version." >&2; exit 1; }
  [[ "$mock" == "true" ]] || { echo "Observable simulation requires mock-only assets." >&2; exit 1; }
  curl -fsS http://127.0.0.1:3000/api/game/snapshot \
    | jq -e '.chainId == 31337 and .state.contractVersion == "saved-bell-v5-market-pot"' \
    >/dev/null
}

with_runtime() {
  env \
    DATABASE_URL="$database_url" \
    KEYGAME_CHAIN_ID=31337 \
    KEYGAME_DEPLOYMENT_MANIFEST="$manifest" \
    V4_SOAK_PROFILE=observable \
    V4_SOAK_TARGET_ROUNDS="$target_rounds" \
    V4_SOAK_CANCEL_ROUNDS="$cancel_rounds" \
    V4_SOAK_ENDURANCE_INTERVAL_MS="$interval_ms" \
    V4_SOAK_DURATION_HOURS="$duration_hours" \
    V4_OBSERVABLE_CALL_DELAY_MS="$call_delay_ms" \
    "$@"
}

seed_players() {
  local rpc deployer token router
  rpc="$(manifest_value '.rpc.primary')"
  deployer="$(manifest_value '.deployer')"
  token="$(manifest_value '.contracts.paymentToken')"
  router="$(manifest_value '.contracts.paymentRouter')"
  mapfile -t stocks < <(jq -er '.stockTokens[]' "$manifest")
  [[ "${#stocks[@]}" -eq 4 ]] || { echo "Expected four mock stocks." >&2; exit 1; }

  local players=()
  for index in $(seq 1 64); do
    local player ticker
    player="$(printf '0x%040x' "$((0x20000 + index))")"
    ticker="$(((index - 1) % 4))"
    players+=("$player")
    cast rpc anvil_setBalance "$player" 0x3635c9adc5dea00000 \
      --rpc-url "$rpc" >/dev/null
    cast send "$token" 'mint(address,uint256)' "$player" 1000000000000000 \
      --from "$deployer" --unlocked --rpc-url "$rpc" >/dev/null
    cast send "$token" 'approve(address,uint256)' "$router" \
      0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff \
      --from "$player" --unlocked --rpc-url "$rpc" >/dev/null
    cast send "${stocks[$ticker]}" 'mint(address,uint256)' "$player" 1 \
      --from "$deployer" --unlocked --rpc-url "$rpc" >/dev/null
  done

  local players_json temporary
  players_json="$(printf '%s\n' "${players[@]}" | jq -R . | jq -s .)"
  temporary="$(mktemp "$runtime_dir/manifest.XXXXXX")"
  jq --argjson players "$players_json" \
    '.players=$players | .sessionPlayer=$players[0]' "$manifest" >"$temporary"
  mv "$temporary" "$manifest"
  printf '%s\n' "${players[@]}" >"$runtime_dir/players.txt"
}

ensure_indexer() {
  systemctl --user stop "$indexer_unit" 2>/dev/null || true
  systemd-run --user --unit="${indexer_unit%.service}" --collect \
    --working-directory="$project_root" \
    --setenv="PATH=$node_bin:$foundry_bin:/usr/local/bin:/usr/bin:/bin" \
    --setenv="DATABASE_URL=$database_url" \
    --setenv="KEYGAME_CHAIN_ID=31337" \
    --setenv="KEYGAME_DEPLOYMENT_MANIFEST=$manifest" \
    --setenv="INDEXER_CONFIRMATIONS=0" \
    "$node_bin/corepack" pnpm service:indexer
}

ensure_keeper() {
  systemctl --user stop "$keeper_unit" 2>/dev/null || true
  systemd-run --user --unit="${keeper_unit%.service}" --collect \
    --working-directory="$project_root" \
    --setenv="PATH=$node_bin:$foundry_bin:/usr/local/bin:/usr/bin:/bin" \
    --setenv="DATABASE_URL=$database_url" \
    --setenv="KEYGAME_CHAIN_ID=31337" \
    --setenv="KEYGAME_DEPLOYMENT_MANIFEST=$manifest" \
    --setenv="V4_KEEPER_POLL_MS=100" \
    "$node_bin/corepack" pnpm service:v4-devnet-keeper
}

start_run() {
  assert_devnet
  if systemctl --user is-active --quiet "$unit"; then
    echo "Observable simulation is already running." >&2
    exit 1
  fi
  ensure_database
  with_runtime "$node_bin/corepack" pnpm db:migrate
  seed_players
  ensure_indexer
  ensure_keeper
  local run_id
  run_id="$(with_runtime "$node_bin/corepack" pnpm v4-soak:start | tail -n1)"
  printf '%s\n' "$run_id" >"$runtime_dir/run-id.txt"
  systemd-run --user --unit="${unit%.service}" --collect \
    --working-directory="$project_root" \
    --setenv="PATH=$node_bin:$foundry_bin:/usr/local/bin:/usr/bin:/bin" \
    --setenv="DATABASE_URL=$database_url" \
    --setenv="KEYGAME_CHAIN_ID=31337" \
    --setenv="KEYGAME_DEPLOYMENT_MANIFEST=$manifest" \
    --setenv="V4_SOAK_PROFILE=observable" \
    --setenv="V4_SOAK_TARGET_ROUNDS=$target_rounds" \
    --setenv="V4_SOAK_CANCEL_ROUNDS=$cancel_rounds" \
    --setenv="V4_SOAK_ENDURANCE_INTERVAL_MS=$interval_ms" \
    --setenv="V4_SOAK_DURATION_HOURS=$duration_hours" \
    --setenv="V4_OBSERVABLE_CALL_DELAY_MS=$call_delay_ms" \
    /bin/bash -lc \
      "$node_bin/corepack pnpm v4-soak:run && $node_bin/corepack pnpm v4-soak:report"
  echo "$run_id"
  echo "Watch live gameplay at http://192.168.50.138:3000/"
}

case "${1:-status}" in
  start)
    start_run
    ;;
  status)
    assert_devnet
    systemctl --user status "$unit" --no-pager 2>/dev/null | head -n 12 || true
    with_runtime "$node_bin/corepack" pnpm v4-soak:status
    with_runtime "$node_bin/corepack" pnpm v4-soak:reconcile
    ;;
  reconcile)
    assert_devnet
    with_runtime "$node_bin/corepack" pnpm v4-soak:reconcile
    ;;
  report)
    assert_devnet
    with_runtime "$node_bin/corepack" pnpm v4-soak:report
    ;;
  stop)
    systemctl --user stop "$unit" 2>/dev/null || true
    echo "Observable controller stopped; devnet and the visible app remain online."
    ;;
  *)
    echo "Usage: $0 start|status|reconcile|report|stop" >&2
    exit 1
    ;;
esac
