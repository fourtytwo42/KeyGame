#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:=postgresql:///keygame?host=/var/run/postgresql}"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
export PATH="$HOME/.foundry/bin:$PATH"
cd "$project_root"

stop_indexer() {
  if [[ ! -f .devnet/indexer.pid ]]; then
    return
  fi
  local pid
  pid="$(cat .devnet/indexer.pid)"
  if kill -0 "$pid" 2>/dev/null; then
    local session_id
    session_id="$(ps -o sid= -p "$pid" | tr -d ' ')"
    if [[ "$session_id" == "$pid" ]]; then
      kill -- "-$pid"
    else
      kill "$pid"
    fi
    wait "$pid" 2>/dev/null || true
  fi
  rm -f .devnet/indexer.pid
}

start_indexer() {
  KEYGAME_CHAIN_ID=31337 INDEXER_CONFIRMATIONS=0 \
    nohup setsid pnpm service:indexer >.devnet/indexer.log 2>&1 &
  echo "$!" >.devnet/indexer.pid
}

stop_indexer
bash scripts/app-stop.sh || true

# Older wrappers could exit while leaving their devnet-only keeper child
# detached. A clean qualification must have exactly one lifecycle owner.
mapfile -t stale_keeper_pids < <(
  pgrep -f '[s]ervices/v4-devnet-keeper.ts' || true
)
for stale_pid in "${stale_keeper_pids[@]}"; do
  kill "$stale_pid" 2>/dev/null || true
done

mapfile -t stale_indexer_pids < <(pgrep -f '[s]ervices/indexer.ts' || true)
for stale_pid in "${stale_indexer_pids[@]}"; do
  if tr '\0' '\n' <"/proc/$stale_pid/environ" 2>/dev/null \
    | grep -qx 'KEYGAME_CHAIN_ID=31337'; then
    kill "$stale_pid" 2>/dev/null || true
  fi
done

bash scripts/devnet-stop.sh || true

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM keeper_jobs WHERE chain_id=31337;
DELETE FROM rounds WHERE chain_id=31337;
DELETE FROM chain_events WHERE chain_id=31337;
DELETE FROM canonical_blocks WHERE chain_id=31337;
DELETE FROM indexer_checkpoints WHERE chain_id=31337;
DELETE FROM service_heartbeats WHERE chain_id=31337;
UPDATE soak_runs
SET state='failed',completed_at=now(),updated_at=now()
WHERE chain_id=31337 AND state IN ('scheduled','running','monitoring');
SQL

bash scripts/devnet-start.sh
bash scripts/devnet-deploy.sh
pnpm db:migrate
start_indexer

pnpm v4-soak:start
pnpm v4-soak:run
pnpm v4-soak:status
pnpm v4-soak:reconcile
pnpm v4-soak:report
stop_indexer
start_indexer
sleep 15
pnpm exec tsx scripts/check-v4-indexer.ts
