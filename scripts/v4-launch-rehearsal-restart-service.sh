#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Launch rehearsal restart helper must run as root." >&2
  exit 1
fi

case "${1:-}" in
  keeper)
    unit="keygame-v4-rehearsal-keeper.service"
    ;;
  indexer)
    unit="keygame-v4-rehearsal-indexer.service"
    ;;
  *)
    echo "Usage: v4-launch-rehearsal-restart-service.sh <keeper|indexer>" >&2
    exit 1
    ;;
esac

exec /usr/bin/systemctl restart "$unit"
