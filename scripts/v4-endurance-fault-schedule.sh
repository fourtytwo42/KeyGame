#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fault_interval_seconds="${V4_ENDURANCE_FAULT_INTERVAL_SECONDS:-900}"
faults=(
  "keeper-restart"
  "rpc-pause"
  "indexer-restart"
  "web-restart"
  "isolated-reorg-fixture"
  "duplicate-round-fixture"
)

cd "$project_root"
for fault in "${faults[@]}"; do
  sleep "$fault_interval_seconds"
  bash scripts/v4-devnet-fault.sh "$fault" 5
done
