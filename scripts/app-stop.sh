#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pid_file="$project_root/.devnet/app.pid"
keeper_pid_file="$project_root/.devnet/round-keeper.pid"
indexer_pid_file="$project_root/.devnet/indexer.pid"

stop_managed_process() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return
  fi
  local pid
  pid="$(cat "$pid_file")"
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
  rm -f "$pid_file"
}

stop_managed_process "$indexer_pid_file"
stop_managed_process "$keeper_pid_file"
stop_managed_process "$pid_file"
echo "Saved by the Bell stopped."
