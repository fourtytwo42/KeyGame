#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.devnet"
pid_file="$runtime_dir/anvil.pid"
log_file="$runtime_dir/anvil.log"

mkdir -p "$runtime_dir"
export PATH="$HOME/.foundry/bin:$PATH"

if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
  echo "Anvil is already running with PID $(cat "$pid_file")."
  exit 0
fi

nohup anvil \
  --host 0.0.0.0 \
  --port 8545 \
  --chain-id 31337 \
  --auto-impersonate \
  --prune-history 1024 \
  >"$log_file" 2>&1 &
echo "$!" >"$pid_file"

for _ in {1..30}; do
  if cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; then
    echo "Anvil chain 31337 is listening on 0.0.0.0:8545 with automining and bounded history."
    exit 0
  fi
  sleep 0.25
done

echo "Anvil did not become ready. See $log_file." >&2
exit 1
