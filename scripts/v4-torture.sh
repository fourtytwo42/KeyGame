#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.torture"
database_url="postgresql:///keygame?host=/var/run/postgresql&options=-c%20search_path%3Dkeygame_torture"
manifest="$runtime_dir/deployment.json"
cd "$project_root"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

with_runtime() {
  env DATABASE_URL="$database_url" \
    KEYGAME_CHAIN_ID=31337 \
    KEYGAME_DEPLOYMENT_MANIFEST="$manifest" \
    V4_SOAK_PROFILE=torture \
    V4_SOAK_TARGET_ROUNDS=500 \
    V4_SOAK_CANCEL_ROUNDS=50 \
    "$@"
}

case "${1:-status}" in
  start)
    bash scripts/v4-torture-runtime.sh start
    ;;
  run)
    V4_TORTURE_RUN_ID="$(tr -d '\r\n' <"$runtime_dir/run-id.txt")" \
      pnpm v4-torture:contracts
    nohup setsid env \
      DATABASE_URL="$database_url" \
      KEYGAME_CHAIN_ID=31337 \
      KEYGAME_DEPLOYMENT_MANIFEST="$manifest" \
      V4_SOAK_PROFILE=torture \
      V4_SOAK_TARGET_ROUNDS=500 \
      V4_SOAK_CANCEL_ROUNDS=50 \
      pnpm v4-soak:run \
      >"$runtime_dir/controller.log" 2>&1 &
    echo "$!" >"$runtime_dir/controller.pid"
    echo "Torture controller started as PID $!."
    ;;
  status)
    bash scripts/v4-torture-runtime.sh status
    with_runtime pnpm v4-soak:status
    ;;
  reconcile)
    with_runtime pnpm v4-soak:reconcile
    ;;
  report)
    with_runtime pnpm v4-soak:report
    ;;
  replay)
    seed="${3:-${2:-}}"
    [[ -n "$seed" ]] || { echo "Usage: v4-torture:replay --seed 0x..." >&2; exit 1; }
    export PATH="$HOME/.foundry/bin:$PATH"
    FOUNDRY_PROFILE=v4-torture \
      FOUNDRY_INVARIANT_RUNS=1 \
      FOUNDRY_INVARIANT_DEPTH=100000 \
      forge test --match-contract LastBellV4InvariantTest \
        --match-test invariant_AllCoreProperties --fuzz-seed "$seed" -vvvv
    ;;
  stop)
    bash scripts/v4-torture-runtime.sh stop
    ;;
  *)
    echo "Unknown v4 torture command: $1" >&2
    exit 1
    ;;
esac
