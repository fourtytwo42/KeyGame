#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.devnet"
pid_file="$runtime_dir/app.pid"
log_file="$runtime_dir/app.log"
keeper_pid_file="$runtime_dir/round-keeper.pid"
keeper_log_file="$runtime_dir/round-keeper.log"
indexer_pid_file="$runtime_dir/indexer.pid"
indexer_log_file="$runtime_dir/indexer.log"

mkdir -p "$runtime_dir"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
cd "$project_root"
export KEYGAME_CHAIN_ID=31337
export KEYGAME_DEPLOYMENT_MANIFEST="$project_root/deployments/31337.json"
pnpm db:migrate >/dev/null

# NEXT_PUBLIC values are compiled into the browser bundle. Release scans build
# protected/testnet variants into the same .next directory, so always rebuild
# from the active devnet manifest before starting the local application.
pnpm build >/dev/null

if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
  echo "Saved by the Bell is already running with PID $(cat "$pid_file")."
else
  nohup setsid node node_modules/next/dist/bin/next start --hostname 0.0.0.0 \
    >"$log_file" 2>&1 &
  echo "$!" >"$pid_file"
fi

if pnpm exec wait-on --timeout 30000 http://127.0.0.1:3000/api/status; then
  if [[ ! -f "$keeper_pid_file" ]] \
    || ! kill -0 "$(cat "$keeper_pid_file")" 2>/dev/null; then
    nohup setsid pnpm service:v4-devnet-keeper \
      >"$keeper_log_file" 2>&1 &
    echo "$!" >"$keeper_pid_file"
  fi
  if [[ ! -f "$indexer_pid_file" ]] \
    || ! kill -0 "$(cat "$indexer_pid_file")" 2>/dev/null; then
    INDEXER_CONFIRMATIONS=0 nohup setsid pnpm service:indexer \
      >"$indexer_log_file" 2>&1 &
    echo "$!" >"$indexer_pid_file"
  fi
  echo "Saved by the Bell is listening on 0.0.0.0:3000."
  echo "Automatic round keeper is running with PID $(cat "$keeper_pid_file")."
  echo "Canonical devnet indexer is running with PID $(cat "$indexer_pid_file")."
  exit 0
fi

echo "Saved by the Bell did not become ready. See $log_file." >&2
exit 1
