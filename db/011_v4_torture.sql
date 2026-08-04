BEGIN;

ALTER TABLE soak_runs
  DROP CONSTRAINT IF EXISTS soak_runs_run_profile_check;
ALTER TABLE soak_runs
  ADD CONSTRAINT soak_runs_run_profile_check
  CHECK (run_profile IN (
    'legacy-testnet',
    'v4-accelerated',
    'v4-endurance',
    'v4-fixture',
    'v4-torture'
  ));

CREATE TABLE IF NOT EXISTS torture_action_evidence (
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  preset text NOT NULL,
  classification text NOT NULL,
  expected_revert boolean NOT NULL DEFAULT false,
  transaction_hash text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id,sequence)
);

CREATE TABLE IF NOT EXISTS torture_resource_samples (
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL DEFAULT now(),
  cpu_percent numeric,
  memory_bytes bigint,
  disk_bytes bigint,
  rpc_block bigint,
  indexer_lag bigint,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (run_id,observed_at)
);

CREATE TABLE IF NOT EXISTS torture_failures (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  seed text,
  action_sequence bigint,
  severity text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  reproduction jsonb NOT NULL,
  minimized_reproduction jsonb,
  resolution_commit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

COMMIT;
