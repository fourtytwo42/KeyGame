#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_url="${DATABASE_URL:-postgresql:///keygame?host=/var/run/postgresql}"

psql "$database_url" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
CREATE TEMP TABLE mainnet_canary_runs (
  id text PRIMARY KEY,
  state text NOT NULL CHECK (
    state IN ('scheduled','running','completed','stopped','failed')
  ),
  duration_hours integer NOT NULL CHECK (duration_hours = 24),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO mainnet_canary_runs(id,state,duration_hours)
VALUES ('legacy-running','running',24),('legacy-complete','completed',24);
\i $project_root/db/013_one_hour_mainnet_canary.sql
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mainnet_canary_runs
    WHERE id='legacy-running' AND state='stopped' AND duration_hours=24
  ) THEN
    RAISE EXCEPTION 'legacy running canary was not stopped and preserved';
  END IF;
  INSERT INTO mainnet_canary_runs(id,state,duration_hours)
  VALUES ('one-hour-running','running',1);
  BEGIN
    INSERT INTO mainnet_canary_runs(id,state,duration_hours)
    VALUES ('invalid-legacy-running','running',24);
    RAISE EXCEPTION 'legacy 24-hour running canary was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
\$\$;
ROLLBACK;
SQL

echo "One-hour canary migration test passed."
