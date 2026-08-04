-- Chain-31337-only launch rehearsal evidence. The historical
-- mainnet_canary_* tables remain untouched for archival compatibility.
CREATE TABLE IF NOT EXISTS v4_launch_rehearsal_runs (
  id text PRIMARY KEY,
  deployment_key text NOT NULL,
  source_commit text NOT NULL,
  manifest_hash text NOT NULL,
  operator_address text NOT NULL,
  player_a_address text NOT NULL,
  player_b_address text NOT NULL,
  chain_id integer NOT NULL DEFAULT 31337 CHECK (chain_id = 31337),
  state text NOT NULL CHECK (
    state IN ('scheduled','running','completed','stopped','failed')
  ),
  target_rounds integer NOT NULL CHECK (target_rounds = 10),
  duration_minutes integer NOT NULL CHECK (duration_minutes = 60),
  usdg_budget numeric(78,0) NOT NULL CHECK (usdg_budget = 100000000),
  spent_usdg numeric(78,0) NOT NULL DEFAULT 0,
  settled_rounds integer NOT NULL DEFAULT 0,
  initial_round_id numeric(78,0) NOT NULL,
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  completed_at timestamptz,
  report_sha256 text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deployment_key, source_commit)
);

CREATE TABLE IF NOT EXISTS v4_launch_rehearsal_actions (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES v4_launch_rehearsal_runs(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  action_type text NOT NULL,
  actor_address text,
  round_id numeric(78,0),
  round_address text,
  ticker_index smallint CHECK (ticker_index BETWEEN 0 AND 3),
  usdg_amount numeric(78,0) NOT NULL DEFAULT 0,
  nonce numeric(78,0),
  state text NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending','simulated','broadcast','confirmed','expected-revert','failed')
  ),
  transaction_hash text,
  signed_transaction text,
  receipt_block numeric(78,0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, idempotency_key),
  UNIQUE (transaction_hash)
);

CREATE INDEX IF NOT EXISTS v4_launch_rehearsal_actions_recovery
  ON v4_launch_rehearsal_actions(run_id, state, id)
  WHERE state IN ('pending','broadcast');

CREATE TABLE IF NOT EXISTS v4_launch_rehearsal_assertions (
  run_id text NOT NULL REFERENCES v4_launch_rehearsal_runs(id) ON DELETE CASCADE,
  round_id numeric(78,0),
  assertion text NOT NULL,
  passed boolean NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, round_id, assertion)
);
