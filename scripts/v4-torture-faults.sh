#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.torture"
database_url="postgresql:///keygame?host=/var/run/postgresql&options=-c%20search_path%3Dkeygame_torture&application_name=keygame_torture_faults"
manifest="$runtime_dir/deployment.json"
rpc_url="http://127.0.0.1:9545"
run_id="$(tr -d '\r\n' <"$runtime_dir/run-id.txt")"
export PATH="$HOME/.foundry/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

record_start() {
  local fault="$1"
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
         AND state='confirmed'")"
    [[ "$settled" -ge "$target" ]] && return
    sleep 0.2
  done
}

stop_group() {
  local pid="$1"
  local sid
  sid="$(ps -o sid= -p "$pid" | tr -d ' ')"
  if [[ "$sid" == "$pid" ]]; then
    kill -- "-$pid" 2>/dev/null || true
  else
    kill "$pid" 2>/dev/null || true
  fi
  for _ in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || return
    sleep 0.1
  done
}

restart_service() {
  local service="$1"
  local threshold="$2"
  wait_rounds "$threshold"
  id="$(record_start "$service-restart")"
  if [[ "$service" == "keeper" ]]; then
    stop_group "$(cat "$runtime_dir/keeper.pid")"
    nohup setsid env DATABASE_URL="$database_url" KEYGAME_CHAIN_ID=31337 \
      KEYGAME_DEPLOYMENT_MANIFEST="$manifest" V4_KEEPER_POLL_MS=50 \
      pnpm service:v4-devnet-keeper >"$runtime_dir/keeper.log" 2>&1 &
    echo "$!" >"$runtime_dir/keeper.pid"
  elif [[ "$service" == "indexer" ]]; then
    stop_group "$(cat "$runtime_dir/indexer.pid")"
    nohup setsid env DATABASE_URL="$database_url" KEYGAME_CHAIN_ID=31337 \
      KEYGAME_DEPLOYMENT_MANIFEST="$manifest" INDEXER_CONFIRMATIONS=0 \
      pnpm service:indexer >"$runtime_dir/indexer.log" 2>&1 &
    echo "$!" >"$runtime_dir/indexer.pid"
  else
    stop_group "$(cat "$runtime_dir/app.pid")"
    nohup setsid env DATABASE_URL="$database_url" KEYGAME_CHAIN_ID=31337 \
      KEYGAME_DEPLOYMENT_MANIFEST="$manifest" NEXT_DIST_DIR=.next-torture \
      NEXT_PUBLIC_GAME_MODE=devnet \
      NEXT_PUBLIC_CONTRACT_VERSION=last-bell-v4-stock-pot \
      NEXT_PUBLIC_LOCAL_RPC_URL="$rpc_url" PORT=3100 \
      pnpm exec next start --hostname 127.0.0.1 --port 3100 \
      >"$runtime_dir/app.log" 2>&1 &
    echo "$!" >"$runtime_dir/app.pid"
    pnpm exec wait-on --timeout 30000 http://127.0.0.1:3100/status
  fi
  sleep 1
  record_end "$id" "$service restarted after $threshold settled rounds"
}

restart_service keeper 50
restart_service indexer 125
restart_service web 200
restart_service keeper 300
restart_service indexer 375
restart_service web 450

while [[ "$(psql "$database_url" -Atc \
  "SELECT state FROM soak_runs WHERE id='$run_id'")" == "running" ]]; do
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
record_end "$id" "torture-scoped PostgreSQL clients reconnected"

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
