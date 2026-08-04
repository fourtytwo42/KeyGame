#!/usr/bin/env bash
set -euo pipefail

: "${KEYGAME_CHAIN_ID:?KEYGAME_CHAIN_ID is required}"
: "${SOAK_RUN_ID:?SOAK_RUN_ID is required}"
: "${SOAK_CONTROL_TOKEN_FILE:?SOAK_CONTROL_TOKEN_FILE is required}"
: "${DATABASE_URL:=postgresql:///keygame?host=/var/run/postgresql}"
: "${SOAK_RPC_FAILURE_MARKER:=$PWD/.soak/rpc-primary-failure}"

if [[ "$KEYGAME_CHAIN_ID" != "46630" ]]; then
  echo "Fault injection is testnet-only." >&2
  exit 1
fi
if [[ ! -r "$SOAK_CONTROL_TOKEN_FILE" ]]; then
  echo "The owner-only soak control token is unavailable." >&2
  exit 1
fi

digest="$(tr -d '\r\n' <"$SOAK_CONTROL_TOKEN_FILE" | sha256sum | awk '{print $1}')"
fault_id="${1:?fault id is required}"
if [[ ! "$fault_id" =~ ^[0-9]+$ ]]; then
  echo "Fault id must be numeric." >&2
  exit 1
fi
row="$(psql "$DATABASE_URL" -v run_id="$SOAK_RUN_ID" -Atc \
  "SELECT fault_type || '|' || auth_digest || '|' || coalesce((parameters->>'durationSeconds'),'0')
     FROM soak_faults
    WHERE id=$fault_id AND run_id=:'run_id' AND state='scheduled'
      AND scheduled_at <= now()")"
IFS='|' read -r fault_type expected_digest duration_seconds <<<"$row"
if [[ -z "${fault_type:-}" || "$digest" != "$expected_digest" ]]; then
  echo "Fault authorization failed." >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "UPDATE soak_faults SET state='active',activated_at=now() WHERE id=$fault_id"

restore() {
  if [[ "$fault_type" == "rpc-primary-failure" ]]; then
    rm -f "$SOAK_RPC_FAILURE_MARKER"
    systemctl --user restart keygame-market-collector.service \
      keygame-indexer.service keygame-keeper.service
  fi
  psql "$DATABASE_URL" -c \
    "UPDATE soak_faults SET state='restored',restored_at=now() WHERE id=$fault_id" \
    >/dev/null
}
trap restore EXIT

case "$fault_type" in
  rpc-primary-failure)
    mkdir -p "$(dirname "$SOAK_RPC_FAILURE_MARKER")"
    touch "$SOAK_RPC_FAILURE_MARKER"
    systemctl --user restart keygame-market-collector.service \
      keygame-indexer.service keygame-keeper.service
    sleep "$duration_seconds"
    ;;
  dex-stale|unsafe-market)
    sleep "$duration_seconds"
    ;;
  keeper-restart)
    systemctl --user restart keygame-keeper.service
    ;;
  indexer-restart)
    systemctl --user restart keygame-indexer.service
    ;;
  web-restart)
    systemctl --user restart keygame-uat-web.service
    ;;
  stale-attestation|replayed-attestation)
    forge test --match-test test_InvalidStaleMismatchedAndReplayedReportsNeverCharge
    ;;
  isolated-reorg-fixture|duplicate-round-fixture)
    corepack pnpm exec tsx scripts/soak-isolated-fixtures.ts "$fault_type"
    ;;
  *)
    echo "Unsupported fault type: $fault_type" >&2
    exit 1
    ;;
esac
