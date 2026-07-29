#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pid_file="$project_root/.devnet/app.pid"
keeper_pid_file="$project_root/.devnet/round-keeper.pid"

if [[ -f "$keeper_pid_file" ]]; then
  keeper_pid="$(cat "$keeper_pid_file")"
  if kill -0 "$keeper_pid" 2>/dev/null; then
    kill "$keeper_pid"
    wait "$keeper_pid" 2>/dev/null || true
  fi
  rm -f "$keeper_pid_file"
fi

if [[ -f "$pid_file" ]]; then
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    wait "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
fi
echo "Last Bell stopped."
