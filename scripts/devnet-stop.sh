#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pid_file="$project_root/.devnet/anvil.pid"

if [[ ! -f "$pid_file" ]]; then
  echo "No recorded Anvil process."
  exit 0
fi

pid="$(cat "$pid_file")"
if kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  wait "$pid" 2>/dev/null || true
fi
rm -f "$pid_file"

for _ in {1..50}; do
  if ! cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; then
    echo "Anvil stopped."
    exit 0
  fi
  sleep 0.1
done

echo "Anvil did not release port 8545 after shutdown." >&2
exit 1
