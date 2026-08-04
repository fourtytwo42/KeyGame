#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="${KEYGAME_REHEARSAL_RUNTIME_DIR:-$HOME/.local/state/keygame/v4-launch-rehearsal}"
rpc_url="${KEYGAME_REHEARSAL_RPC_URL:-http://127.0.0.1:9546}"
database_url="${DATABASE_URL:?DATABASE_URL must target the isolated rehearsal database}"

case "$runtime_dir" in
  "$project_root"|"$project_root"/*) echo "Rehearsal runtime must remain outside the repository." >&2; exit 1 ;;
esac
[[ "$database_url" == *"keygame_v4_rehearsal"* ]] || {
  echo "DATABASE_URL must identify the isolated keygame_v4_rehearsal database." >&2
  exit 1
}
[[ "$(cast chain-id --rpc-url "$rpc_url")" == "31337" ]] || {
  echo "Rehearsal RPC must be chain 31337." >&2
  exit 1
}

mkdir -p "$runtime_dir"
manifest="$runtime_dir/31337.json"

# Never inherit a previous chain-31337 deployment or rehearsal run. A stale
# database can otherwise create duplicate manager/round identities after the
# new isolated deployment is indexed.
if [[ "$(psql "$database_url" -Atqc "SELECT to_regclass('public.deployments') IS NOT NULL")" == "t" ]]; then
  stale_deployments="$(psql "$database_url" -Atqc "SELECT count(*) FROM deployments WHERE chain_id=31337")"
  [[ "$stale_deployments" == "0" ]] || {
    echo "Rehearsal database contains $stale_deployments existing chain-31337 deployment(s); use a clean isolated database." >&2
    exit 1
  }
fi
if [[ "$(psql "$database_url" -Atqc "SELECT to_regclass('public.v4_launch_rehearsal_runs') IS NOT NULL")" == "t" ]]; then
  stale_runs="$(psql "$database_url" -Atqc "SELECT count(*) FROM v4_launch_rehearsal_runs")"
  [[ "$stale_runs" == "0" ]] || {
    echo "Rehearsal database contains $stale_runs previous rehearsal run(s); use a clean isolated database." >&2
    exit 1
  }
fi

LOCAL_RPC_URL="$rpc_url" \
DEVNET_DEPLOYMENT_MANIFEST="$manifest" \
DEVNET_WRITE_APP_ENV=false \
  bash "$project_root/scripts/devnet-deploy.sh"

DATABASE_URL="$database_url" pnpm db:migrate
printf '%s\n' \
  "KEYGAME_CHAIN_ID=31337" \
  "KEYGAME_DEPLOYMENT_MANIFEST=$manifest" \
  "LOCAL_RPC_URL=$rpc_url" \
  "NEXT_PUBLIC_LOCAL_RPC_URL=$rpc_url" \
  "DATABASE_URL=$database_url" \
  "KEYGAME_REHEARSAL_RESTART_HELPER=/usr/local/libexec/keygame-v4-rehearsal-restart" \
  >"$runtime_dir/v4-rehearsal.env"
chmod 600 "$runtime_dir/v4-rehearsal.env"

echo "Prepared isolated v4 launch rehearsal."
echo "Manifest: $manifest"
echo "Environment: $runtime_dir/v4-rehearsal.env"
