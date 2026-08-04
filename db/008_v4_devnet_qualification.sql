BEGIN;

ALTER TABLE soak_runs
  DROP CONSTRAINT IF EXISTS soak_runs_chain_id_check;
ALTER TABLE soak_runs
  DROP CONSTRAINT IF EXISTS soak_runs_target_hours_check;
ALTER TABLE soak_runs
  ADD COLUMN IF NOT EXISTS run_profile text NOT NULL DEFAULT 'legacy-testnet',
  ADD COLUMN IF NOT EXISTS scenario_seed bigint,
  ADD COLUMN IF NOT EXISTS target_minutes integer,
  ADD COLUMN IF NOT EXISTS report_path text;
ALTER TABLE soak_runs
  ADD CONSTRAINT soak_runs_chain_id_check
  CHECK (chain_id IN (31337,46630));
ALTER TABLE soak_runs
  ADD CONSTRAINT soak_runs_target_hours_check
  CHECK (target_hours >= 0);
ALTER TABLE soak_runs
  ADD CONSTRAINT soak_runs_run_profile_check
  CHECK (run_profile IN (
    'legacy-testnet',
    'v4-accelerated',
    'v4-endurance',
    'v4-fixture'
  ));

CREATE TABLE IF NOT EXISTS soak_asset_reconciliations (
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  round_contract text NOT NULL,
  round_id numeric(78,0) NOT NULL,
  stock_token text NOT NULL,
  ticker_index smallint NOT NULL CHECK (ticker_index BETWEEN 0 AND 3),
  accounted_raw numeric(78,0) NOT NULL,
  holder_raw numeric(78,0) NOT NULL,
  winning_stock_raw numeric(78,0) NOT NULL,
  lifetime_raw numeric(78,0) NOT NULL,
  seed_raw numeric(78,0) NOT NULL,
  protocol_raw numeric(78,0) NOT NULL,
  claimed_raw numeric(78,0) NOT NULL DEFAULT 0,
  contract_balance_raw numeric(78,0) NOT NULL DEFAULT 0,
  discrepancy_raw numeric(78,0) NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id,round_contract,stock_token)
);

CREATE TABLE IF NOT EXISTS soak_point_reconciliations (
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  round_contract text NOT NULL,
  round_id numeric(78,0) NOT NULL,
  player_address text NOT NULL,
  ticker_index smallint NOT NULL CHECK (ticker_index BETWEEN 0 AND 3),
  contribution_points numeric(78,0) NOT NULL,
  contract_points numeric(78,0) NOT NULL,
  pending_before numeric(78,0) NOT NULL DEFAULT 0,
  active_after numeric(78,0) NOT NULL DEFAULT 0,
  discrepancy_raw numeric(78,0) NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (
    run_id,round_contract,player_address,ticker_index
  )
);

CREATE TABLE IF NOT EXISTS soak_run_reports (
  run_id text PRIMARY KEY REFERENCES soak_runs(id) ON DELETE CASCADE,
  source_commit text NOT NULL,
  manifest jsonb NOT NULL,
  scenario_summary jsonb NOT NULL,
  assertion_summary jsonb NOT NULL,
  machine_report jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
