#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pid_file="$project_root/.devnet/app.pid"

if [[ ! -f "$pid_file" ]]; then
  echo "No recorded Last Bell process."
  exit 0
fi

pid="$(cat "$pid_file")"
if kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  wait "$pid" 2>/dev/null || true
fi
rm -f "$pid_file"
echo "Last Bell stopped."
