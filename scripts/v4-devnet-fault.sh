#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.devnet"
fault_type="${1:?fault type is required}"
duration_seconds="${2:-5}"
: "${DATABASE_URL:=postgresql:///keygame?host=/var/run/postgresql}"
: "${SOAK_CONTROL_TOKEN_FILE:?SOAK_CONTROL_TOKEN_FILE is required}"

export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
export PATH="$HOME/.foundry/bin:$PATH"

if [[ ! -r "$SOAK_CONTROL_TOKEN_FILE" ]]; then
  echo "The devnet fault-control token is unavailable." >&2
  exit 1
fi
if [[ "$(cast chain-id --rpc-url http://127.0.0.1:8545)" != "31337" ]]; then
  echo "V4 fault injection is restricted to Anvil chain 31337." >&2
  exit 1
fi

run_id="$(
  psql "$DATABASE_URL" -Atc \
    "SELECT id FROM soak_runs
     WHERE chain_id=31337 AND run_profile='v4-endurance'
       AND state IN ('running','monitoring')
     ORDER BY created_at DESC LIMIT 1"
)"
if [[ -z "$run_id" ]]; then
  echo "No active v4 endurance run exists." >&2
  exit 1
fi

auth_digest="$(tr -d '\r\n' <"$SOAK_CONTROL_TOKEN_FILE" | sha256sum | awk '{print $1}')"
fault_id="$(
  psql "$DATABASE_URL" -v run_id="$run_id" -v fault="$fault_type" \
    -v digest="$auth_digest" -v duration="$duration_seconds" -Atc \
    "INSERT INTO soak_faults(
       run_id,fault_type,auth_digest,state,scheduled_at,activated_at,parameters)
     VALUES(:'run_id',:'fault',:'digest','active',now(),now(),
       jsonb_build_object('durationSeconds',:'duration'::integer))
     RETURNING id"
)"

restore() {
  psql "$DATABASE_URL" -v id="$fault_id" -c \
    "UPDATE soak_faults SET state='restored',restored_at=now()
     WHERE id=:'id'" >/dev/null || true
}
trap restore EXIT

cd "$project_root"

stop_managed_process() {
  local pid_file="$1"
  local pid
  pid="$(cat "$pid_file")"
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$pid_file"
    return
  fi
  local session_id
  session_id="$(ps -o sid= -p "$pid" | tr -d ' ')"
  if [[ "$session_id" == "$pid" ]]; then
    kill -- "-$pid"
  else
    kill "$pid"
  fi
  wait "$pid" 2>/dev/null || true
  rm -f "$pid_file"
}

case "$fault_type" in
  rpc-pause)
    anvil_pid="$(cat "$runtime_dir/anvil.pid")"
    kill -STOP "$anvil_pid"
    sleep "$duration_seconds"
    kill -CONT "$anvil_pid"
    ;;
  keeper-restart)
    stop_managed_process "$runtime_dir/round-keeper.pid"
    nohup setsid pnpm service:v4-devnet-keeper \
      >"$runtime_dir/round-keeper.log" 2>&1 &
    echo "$!" >"$runtime_dir/round-keeper.pid"
    ;;
  indexer-restart)
    stop_managed_process "$runtime_dir/indexer.pid"
    INDEXER_CONFIRMATIONS=0 nohup setsid pnpm service:indexer \
      >"$runtime_dir/indexer.log" 2>&1 &
    echo "$!" >"$runtime_dir/indexer.pid"
    ;;
  web-restart)
    stop_managed_process "$runtime_dir/app.pid"
    nohup setsid node node_modules/next/dist/bin/next start --hostname 0.0.0.0 \
      >"$runtime_dir/app.log" 2>&1 &
    echo "$!" >"$runtime_dir/app.pid"
    pnpm exec wait-on --timeout 30000 http://127.0.0.1:3000/api/status
    ;;
  isolated-reorg-fixture|duplicate-round-fixture)
    pnpm exec tsx scripts/soak-isolated-fixtures.ts "$fault_type"
    ;;
  *)
    echo "Unsupported v4 devnet fault: $fault_type" >&2
    exit 1
    ;;
esac
