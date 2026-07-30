BEGIN;

CREATE TABLE IF NOT EXISTS soak_runs (
  id text PRIMARY KEY,
  deployment_key text NOT NULL REFERENCES deployments(deployment_key),
  chain_id bigint NOT NULL CHECK (chain_id = 46630),
  state text NOT NULL CHECK (state IN ('scheduled','running','monitoring','completed','failed','cancelled')),
  target_hours integer NOT NULL CHECK (target_hours >= 24),
  target_rounds integer NOT NULL CHECK (target_rounds >= 100),
  gas_reserve_wei numeric(78,0) NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  spend_stopped_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soak_actions (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  action_type text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled','running','confirmed','failed','skipped')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  UNIQUE(run_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS soak_actions_due
  ON soak_actions(run_id,state,scheduled_at);

CREATE TABLE IF NOT EXISTS soak_transactions (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  action_id bigint REFERENCES soak_actions(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  signer_address text NOT NULL,
  transaction_hash text,
  nonce bigint,
  state text NOT NULL DEFAULT 'planned'
    CHECK (state IN ('planned','broadcast','confirmed','reverted','abandoned')),
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,idempotency_key),
  UNIQUE(transaction_hash)
);

CREATE TABLE IF NOT EXISTS soak_faults (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  fault_type text NOT NULL,
  auth_digest text NOT NULL,
  state text NOT NULL DEFAULT 'scheduled'
    CHECK (state IN ('scheduled','active','restored','failed')),
  scheduled_at timestamptz NOT NULL,
  activated_at timestamptz,
  restore_at timestamptz,
  restored_at timestamptz,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text
);
CREATE INDEX IF NOT EXISTS soak_faults_active
  ON soak_faults(fault_type,state,restore_at);

CREATE TABLE IF NOT EXISTS soak_service_health (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  service text NOT NULL,
  status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS soak_assertions (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  assertion_key text NOT NULL,
  scope text NOT NULL,
  passed boolean NOT NULL,
  expected jsonb,
  actual jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS soak_assertions_failures
  ON soak_assertions(run_id,passed,checked_at);

CREATE TABLE IF NOT EXISTS soak_reconciliations (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES soak_runs(id) ON DELETE CASCADE,
  round_contract text,
  round_id numeric(78,0),
  canonical boolean NOT NULL,
  fee_raw numeric(78,0) NOT NULL DEFAULT 0,
  refund_raw numeric(78,0) NOT NULL DEFAULT 0,
  holder_raw numeric(78,0) NOT NULL DEFAULT 0,
  airtime_raw numeric(78,0) NOT NULL DEFAULT 0,
  seed_raw numeric(78,0) NOT NULL DEFAULT 0,
  protocol_raw numeric(78,0) NOT NULL DEFAULT 0,
  discrepancy_raw numeric(78,0) NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,round_contract)
);

COMMIT;
