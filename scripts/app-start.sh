#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$project_root/.devnet"
pid_file="$runtime_dir/app.pid"
log_file="$runtime_dir/app.log"

mkdir -p "$runtime_dir"
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
cd "$project_root"

if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
  echo "Last Bell is already running with PID $(cat "$pid_file")."
  exit 0
fi

nohup node node_modules/next/dist/bin/next start --hostname 0.0.0.0 \
  >"$log_file" 2>&1 &
echo "$!" >"$pid_file"

if pnpm exec wait-on --timeout 30000 http://127.0.0.1:3000/api/status; then
  echo "Last Bell is listening on 0.0.0.0:3000."
  exit 0
fi

echo "Last Bell did not become ready. See $log_file." >&2
exit 1
