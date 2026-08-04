#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$(mktemp -d /tmp/keygame-v4-e2e.XXXXXX)"
rpc_port="${V4_E2E_RPC_PORT:-9755}"
app_port="${V4_E2E_APP_PORT:-3200}"
rpc_url="http://127.0.0.1:$rpc_port"
app_url="http://127.0.0.1:$app_port"
manifest="$project_root/deployments/31337.json"
env_file="$project_root/.env.local"
manifest_backup="$runtime_dir/31337.json"
env_backup="$runtime_dir/env.local"
anvil_pid=""
app_pid=""

export PATH="$HOME/.foundry/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

[[ -f "$manifest" ]] && cp "$manifest" "$manifest_backup"
[[ -f "$env_file" ]] && cp "$env_file" "$env_backup"

cleanup() {
  [[ -n "$app_pid" ]] && kill "$app_pid" 2>/dev/null || true
  [[ -n "$anvil_pid" ]] && kill "$anvil_pid" 2>/dev/null || true
  [[ -f "$manifest_backup" ]] && cp "$manifest_backup" "$manifest" || rm -f "$manifest"
  [[ -f "$env_backup" ]] && cp "$env_backup" "$env_file" || rm -f "$env_file"
  rm -rf -- "$runtime_dir"
}
trap cleanup EXIT

if cast chain-id --rpc-url "$rpc_url" >/dev/null 2>&1; then
  echo "E2E RPC port $rpc_port is already in use." >&2
  exit 1
fi
if curl -fsS "$app_url/api/status" >/dev/null 2>&1; then
  echo "E2E app port $app_port is already in use." >&2
  exit 1
fi

anvil --host 127.0.0.1 --port "$rpc_port" --chain-id 31337 --auto-impersonate \
  >"$runtime_dir/anvil.log" 2>&1 &
anvil_pid="$!"
for _ in $(seq 1 100); do
  cast chain-id --rpc-url "$rpc_url" >/dev/null 2>&1 && break
  sleep 0.1
done
cast chain-id --rpc-url "$rpc_url" >/dev/null

# The release shell may carry testnet or mainnet application configuration.
# The E2E deployment is intentionally self-contained, so inherited KeyGame and
# public build variables must not override the devnet .env.local generated
# below.
while IFS="=" read -r name _; do
  case "$name" in
    NEXT_PUBLIC_*|KEYGAME_*|ROBINHOOD_*|NODE_ENV) unset "$name" ;;
  esac
done < <(env)

LOCAL_RPC_URL="$rpc_url" bash "$project_root/scripts/devnet-deploy.sh" \
  >"$runtime_dir/deploy.log"

sed -i "s#^NEXT_PUBLIC_APP_URL=.*#NEXT_PUBLIC_APP_URL=$app_url#" "$env_file"
sed -i "s#^NEXT_PUBLIC_LOCAL_RPC_URL=.*#NEXT_PUBLIC_LOCAL_RPC_URL=$rpc_url#" "$env_file"
set -a
source "$env_file"
set +a
pnpm build >"$runtime_dir/build.log" 2>&1
pnpm exec next start --hostname 127.0.0.1 --port "$app_port" \
  >"$runtime_dir/app.log" 2>&1 &
app_pid="$!"
for _ in $(seq 1 200); do
  curl -fsS "$app_url/api/status" >/dev/null 2>&1 && break
  sleep 0.1
done
curl -fsS "$app_url/api/status" >/dev/null

PLAYWRIGHT_BASE_URL="$app_url" PLAYWRIGHT_RPC_URL="$rpc_url" \
  pnpm test:e2e:raw
