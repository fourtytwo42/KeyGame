BEGIN;

ALTER TABLE keeper_jobs
  ADD COLUMN IF NOT EXISTS transaction_nonce bigint;

CREATE INDEX IF NOT EXISTS keeper_jobs_recovery
  ON keeper_jobs (chain_id, state, updated_at);

COMMIT;
