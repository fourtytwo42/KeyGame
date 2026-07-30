#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hour_seconds="${V4_ENDURANCE_HOUR_SECONDS:-3600}"
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
  sleep "$hour_seconds"
  bash scripts/v4-devnet-fault.sh "$fault" 5
done
