#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.torture"
database_url="postgresql:///keygame?host=/var/run/postgresql&options=-c%20search_path%3Dkeygame_torture&application_name=keygame_torture_monitor"
rpc_url="http://127.0.0.1:9545"
run_id="$(tr -d '\r\n' <"$runtime_dir/run-id.txt")"
export PATH="$HOME/.foundry/bin:$PATH"

while true; do
  state="$(psql "$database_url" -Atc \
    "SELECT state FROM soak_runs WHERE id='$run_id'" 2>/dev/null || true)"
  if [[ -z "$state" ]]; then
    sleep 1
    continue
  fi
  rss="$(ps -o rss= -p "$(cat "$runtime_dir/anvil.pid")" \
    -p "$(cat "$runtime_dir/indexer.pid")" \
    -p "$(cat "$runtime_dir/keeper.pid")" \
    -p "$(cat "$runtime_dir/app.pid")" 2>/dev/null \
    | awk '{sum+=$1} END {print (sum+0)*1024}')"
  cpu="$(ps -o %cpu= -p "$(cat "$runtime_dir/anvil.pid")" \
    -p "$(cat "$runtime_dir/indexer.pid")" \
    -p "$(cat "$runtime_dir/keeper.pid")" \
    -p "$(cat "$runtime_dir/app.pid")" 2>/dev/null \
    | awk '{sum+=$1} END {print sum+0}')"
  disk="$(du -sb "$runtime_dir" "$project_root/artifacts/torture" \
    2>/dev/null | awk '{sum+=$1} END {print sum+0}')"
  block="$(cast block-number --rpc-url "$rpc_url" 2>/dev/null || echo 0)"
  indexed="$(psql "$database_url" -Atc \
    "SELECT COALESCE(max(block_number),0) FROM indexer_checkpoints" 2>/dev/null \
    || echo 0)"
  lag="$((block - indexed))"
  psql "$database_url" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO torture_resource_samples(
       run_id,cpu_percent,memory_bytes,disk_bytes,rpc_block,indexer_lag)
     VALUES('$run_id',$cpu,$rss,$disk,$block,$lag)" >/dev/null 2>&1 || true
  [[ "$state" == "completed" || "$state" == "failed" ]] && break
  sleep 5
done
