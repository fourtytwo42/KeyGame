#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.torture"
database_url="postgresql:///keygame?host=/var/run/postgresql&options=-c%20search_path%3Dkeygame_torture&application_name=keygame_torture_faults"
manifest="$runtime_dir/deployment.json"
rpc_url="http://127.0.0.1:9545"
app_port=3101
run_id="$(tr -d '\r\n' <"$runtime_dir/run-id.txt")"
export PATH="$HOME/.foundry/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

wait_database() {
  until psql "$database_url" -qAtc "SELECT 1" >/dev/null 2>&1; do
    sleep 1
  done
}

record_start() {
  local fault="$1"
  wait_database
  psql "$database_url" -qAt -v run_id="$run_id" -v fault="$fault" <<'SQL'
INSERT INTO soak_faults(
  run_id,fault_type,auth_digest,state,scheduled_at,activated_at,parameters)
VALUES(:'run_id',:'fault','isolated-torture','active',now(),now(),'{}')
RETURNING id;
SQL
}

record_end() {
  local id="$1"
  local evidence="$2"
  wait_database
  psql "$database_url" -v id="$id" -v evidence="$evidence" <<'SQL' >/dev/null
UPDATE soak_faults SET state='restored',restored_at=now(),
  evidence=jsonb_build_object('result',:'evidence')
WHERE id=:'id';
SQL
}

wait_rounds() {
  local target="$1"
  while true; do
    settled="$(psql "$database_url" -Atc \
      "SELECT count(*) FROM soak_actions
       WHERE run_id='$run_id' AND action_type='v4-settled-round'
         AND state='confirmed'" 2>/dev/null || echo 0)"
    [[ "$settled" -ge "$target" ]] && return
    sleep 0.2
  done
}

stop_group() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null || return 0
  local sid
  sid="$(ps -o sid= -p "$pid" | tr -d ' ')"
  if [[ "$sid" == "$pid" ]]; then
    kill -- "-$pid" 2>/dev/null || true
  else
    kill "$pid" 2>/dev/null || true
  fi
  for _ in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.1
  done
}

launch_service() {
  local service="$1"
  if [[ "$service" == "keeper" ]]; then
    nohup setsid env DATABASE_URL="$database_url" KEYGAME_CHAIN_ID=31337 \
      KEYGAME_DEPLOYMENT_MANIFEST="$manifest" V4_KEEPER_POLL_MS=50 \
      pnpm service:v4-devnet-keeper >"$runtime_dir/keeper.log" 2>&1 &
    echo "$!" >"$runtime_dir/keeper.pid"
  elif [[ "$service" == "indexer" ]]; then
    nohup setsid env DATABASE_URL="$database_url" KEYGAME_CHAIN_ID=31337 \
      KEYGAME_DEPLOYMENT_MANIFEST="$manifest" INDEXER_CONFIRMATIONS=0 \
      pnpm service:indexer >"$runtime_dir/indexer.log" 2>&1 &
    echo "$!" >"$runtime_dir/indexer.pid"
  else
    nohup setsid env DATABASE_URL="$database_url" KEYGAME_CHAIN_ID=31337 \
      KEYGAME_DEPLOYMENT_MANIFEST="$manifest" NEXT_DIST_DIR=.next-torture \
      NEXT_PUBLIC_GAME_MODE=devnet \
      NEXT_PUBLIC_CONTRACT_VERSION=last-bell-v4-stock-pot \
      NEXT_PUBLIC_LOCAL_RPC_URL="$rpc_url" PORT="$app_port" \
      LOCAL_RPC_URL="$rpc_url" \
      V4_DEVNET_DEPLOYMENT_MANIFEST="$manifest" \
      pnpm exec next start --hostname 127.0.0.1 --port "$app_port" \
      >"$runtime_dir/app.log" 2>&1 &
    echo "$!" >"$runtime_dir/app.pid"
    pnpm exec wait-on --timeout 30000 "http://127.0.0.1:$app_port/status"
  fi
}

restart_service() {
  local service="$1"
  local threshold="$2"
  local pid_name="$service"
  [[ "$service" == "web" ]] && pid_name="app"
  wait_rounds "$threshold"
  id="$(record_start "$service-restart")"
  stop_group "$(cat "$runtime_dir/$pid_name.pid")"
  launch_service "$service"
  sleep 1
  record_end "$id" "$service restarted after $threshold settled rounds"
}

wait_for_postgres_recovery() {
  for _ in $(seq 1 120); do
    local keeper_pid indexer_pid app_pid head indexed keeper_status
    keeper_pid="$(cat "$runtime_dir/keeper.pid")"
    indexer_pid="$(cat "$runtime_dir/indexer.pid")"
    app_pid="$(cat "$runtime_dir/app.pid")"
    head="$(cast block-number --rpc-url "$rpc_url" 2>/dev/null || echo -1)"
    indexed="$(psql "$database_url" -qAtc \
      "SELECT COALESCE((details->>'indexedBlock')::bigint,-1)
       FROM service_heartbeats WHERE service='chain-indexer'" 2>/dev/null ||
      echo -1)"
    keeper_status="$(psql "$database_url" -qAtc \
      "SELECT status FROM service_heartbeats
       WHERE service='v4-devnet-keeper'" 2>/dev/null || true)"
    if kill -0 "$keeper_pid" 2>/dev/null &&
      kill -0 "$indexer_pid" 2>/dev/null &&
      kill -0 "$app_pid" 2>/dev/null &&
      [[ "$keeper_status" == "ok" ]] &&
      [[ "$indexed" -ge "$head" ]] &&
      curl -fsS "http://127.0.0.1:$app_port/api/status" >/dev/null; then
      return
    fi
    sleep 1
  done
  echo "Torture services did not recover from PostgreSQL termination." >&2
  exit 1
}

restart_service keeper 50
restart_service indexer 125
restart_service web 200

wait_rounds 250
id="$(record_start postgres-backend-drop)"
psql "postgresql:///keygame?host=/var/run/postgresql" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE application_name LIKE 'keygame_torture%'
     AND pid <> pg_backend_pid()" >/dev/null
sleep 1
for service in keeper indexer web; do
  pid_name="$service"
  [[ "$service" == "web" ]] && pid_name="app"
  service_pid="$(cat "$runtime_dir/$pid_name.pid")"
  if ! kill -0 "$service_pid" 2>/dev/null; then
    launch_service "$service"
  fi
done
wait_for_postgres_recovery
wait_rounds 260
record_end "$id" \
  "controller and services resumed after all torture database sessions dropped"

restart_service keeper 300
restart_service indexer 375
restart_service web 450

while [[ "$(psql "$database_url" -Atc \
  "SELECT state FROM soak_runs WHERE id='$run_id'" 2>/dev/null ||
  echo running)" == "running" ]]; do
  sleep 1
done

id="$(record_start rpc-pause)"
anvil_pid="$(cat "$runtime_dir/anvil.pid")"
kill -STOP "$anvil_pid"
sleep 2
kill -CONT "$anvil_pid"
cast block-number --rpc-url "$rpc_url" >/dev/null
record_end "$id" "Anvil resumed after two-second pause"

id="$(record_start postgres-reconnect)"
psql "postgresql:///keygame?host=/var/run/postgresql" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE application_name LIKE 'keygame_torture%'
     AND pid <> pg_backend_pid()" >/dev/null || true
sleep 2
psql "$database_url" -Atc "SELECT 1" >/dev/null
for service in keeper indexer web; do
  pid_name="$service"
  [[ "$service" == "web" ]] && pid_name="app"
  stop_group "$(cat "$runtime_dir/$pid_name.pid")"
  launch_service "$service"
done
wait_for_postgres_recovery
record_end "$id" \
  "torture-scoped PostgreSQL clients restarted and caught up automatically"

id="$(record_start isolated-reorg-fixture)"
DATABASE_URL="$database_url" KEYGAME_DEPLOYMENT_MANIFEST="$manifest" \
  pnpm exec tsx scripts/soak-isolated-fixtures.ts isolated-reorg-fixture \
  >"$runtime_dir/reorg-fixture.log"
record_end "$id" "isolated reorg fixture passed"

id="$(record_start duplicate-round-fixture)"
DATABASE_URL="$database_url" KEYGAME_DEPLOYMENT_MANIFEST="$manifest" \
  pnpm exec tsx scripts/soak-isolated-fixtures.ts duplicate-round-fixture \
  >"$runtime_dir/duplicate-fixture.log"
record_end "$id" "duplicate round fixture passed"
