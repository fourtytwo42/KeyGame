#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_id="${V4_TORTURE_RUN_ID:-v4-torture-$(date -u +%Y%m%dT%H%M%SZ)}"
shard_count="${V4_TORTURE_SHARDS:-10}"
parallelism="${V4_TORTURE_PARALLELISM:-2}"
actions_per_shard="${V4_TORTURE_ACTIONS_PER_SHARD:-100000}"
depth=500
runs="$((actions_per_shard / depth))"
artifact_root="$project_root/artifacts/torture/$run_id"
shard_root="$artifact_root/contract-shards"
mkdir -p "$shard_root"

if [[ "$((runs * depth))" -ne "$actions_per_shard" ]]; then
  echo "Actions per shard must be divisible by invariant depth $depth." >&2
  exit 1
fi
if [[ "$shard_count" -ne 10 || "$actions_per_shard" -ne 100000 ]]; then
  echo "Acceptance requires exactly ten 100,000-action shards." >&2
  exit 1
fi
if [[ "$parallelism" -lt 1 || "$parallelism" -gt 2 ]]; then
  echo "Torture contract parallelism must be one or two." >&2
  exit 1
fi

cd "$project_root"
export FOUNDRY_PROFILE=v4-torture
export FOUNDRY_INVARIANT_RUNS="$runs"
export FOUNDRY_INVARIANT_DEPTH="$depth"

run_shard() {
  local shard="$1"
  local seed
  local started
  local completed
  local log="$shard_root/shard-$shard.log"
  seed="0x$(printf 'last-bell-v4-torture-%02d' "$shard" | sha256sum | awk '{print $1}')"
  started="$(date +%s)"
  if ! forge test \
    --match-contract LastBellV4InvariantTest \
    --match-test invariant_AllCoreProperties \
    --fuzz-seed "$seed" \
    -vv >"$log" 2>&1; then
    printf '{"shard":%s,"seed":"%s","state":"failed","log":"%s"}\n' \
      "$shard" "$seed" "$log" >"$shard_root/shard-$shard.json"
    return 1
  fi
  if ! grep -q "runs: $runs, calls: $actions_per_shard" "$log"; then
    echo "Shard $shard did not execute exactly $actions_per_shard calls." >>"$log"
    return 1
  fi
  completed="$(date +%s)"
  jq -n \
    --argjson shard "$shard" \
    --arg seed "$seed" \
    --argjson actions "$actions_per_shard" \
    --argjson duration "$((completed - started))" \
    --arg log "contract-shards/shard-$shard.log" \
    '{shard:$shard,seed:$seed,state:"passed",actions:$actions,
      durationSeconds:$duration,log:$log}' \
    >"$shard_root/shard-$shard.json"
}

export -f run_shard
export shard_root runs actions_per_shard

printf '%s\n' "$run_id" >"$artifact_root/run-id.txt"
printf '%s\n' "$(git rev-parse HEAD)" >"$artifact_root/source-commit.txt"
printf '%s\n' "$(date -u +%FT%TZ)" >"$artifact_root/contracts-started-at.txt"
seq 1 "$shard_count" | xargs -n1 -P"$parallelism" bash -c 'run_shard "$1"' _
printf '%s\n' "$(date -u +%FT%TZ)" >"$artifact_root/contracts-completed-at.txt"

jq -s \
  --arg runId "$run_id" \
  --arg sourceCommit "$(git rev-parse HEAD)" \
  '{
    runId:$runId,
    sourceCommit:$sourceCommit,
    state:(if all(.state == "passed") then "passed" else "failed" end),
    shardCount:length,
    totalActions:(map(.actions // 0) | add),
    shards:.
  }' "$shard_root"/shard-*.json >"$artifact_root/contracts-summary.json"
sha256sum "$artifact_root/contracts-summary.json" \
  >"$artifact_root/contracts-summary.json.sha256"

jq . "$artifact_root/contracts-summary.json"
