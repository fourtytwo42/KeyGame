#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Canary restart helper must run as root." >&2
  exit 1
fi

case "${1:-}" in
  keeper)
    unit="keygame-keeper.service"
    ;;
  indexer)
    unit="keygame-indexer.service"
    ;;
  *)
    echo "Usage: mainnet-canary-restart-service.sh <keeper|indexer>" >&2
    exit 1
    ;;
esac

exec /usr/bin/systemctl restart "$unit"
