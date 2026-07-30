#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:=postgresql:///keygame?host=/var/run/postgresql}"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
export PATH="$HOME/.foundry/bin:$PATH"
cd "$project_root"

if [[ -f .devnet/indexer.pid ]] \
  && kill -0 "$(cat .devnet/indexer.pid)" 2>/dev/null; then
  kill "$(cat .devnet/indexer.pid)"
fi
rm -f .devnet/indexer.pid
bash scripts/app-stop.sh || true
bash scripts/devnet-stop.sh || true

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM keeper_jobs WHERE chain_id=31337;
DELETE FROM rounds WHERE chain_id=31337;
DELETE FROM chain_events WHERE chain_id=31337;
DELETE FROM canonical_blocks WHERE chain_id=31337;
DELETE FROM indexer_checkpoints WHERE chain_id=31337;
DELETE FROM service_heartbeats WHERE chain_id=31337;
SQL

bash scripts/devnet-start.sh
bash scripts/devnet-deploy.sh
pnpm db:migrate
KEYGAME_CHAIN_ID=31337 INDEXER_CONFIRMATIONS=0 \
  nohup pnpm service:indexer >.devnet/indexer.log 2>&1 &
echo "$!" >.devnet/indexer.pid

pnpm v4-soak:start
pnpm v4-soak:run
pnpm v4-soak:status
pnpm v4-soak:reconcile
pnpm v4-soak:report
