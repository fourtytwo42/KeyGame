#!/usr/bin/env bash
set -u

# The production equivalent is an authenticated keeper service. This local
# process advances finalization and rollover even when no browser is open.
while true; do
  curl \
    --fail \
    --silent \
    --show-error \
    --max-time 120 \
    http://127.0.0.1:3000/api/devnet/snapshot \
    >/dev/null 2>&1 || true
  sleep 1
done
