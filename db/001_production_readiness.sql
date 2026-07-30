BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deployments (
  chain_id bigint PRIMARY KEY,
  environment text NOT NULL,
  deployment_block bigint NOT NULL,
  source_commit text NOT NULL,
  manifest jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS canonical_blocks (
  chain_id bigint NOT NULL,
  number bigint NOT NULL,
  hash text NOT NULL,
  parent_hash text NOT NULL,
  block_time timestamptz NOT NULL,
  PRIMARY KEY (chain_id, number)
);

CREATE TABLE IF NOT EXISTS chain_events (
  chain_id bigint NOT NULL,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  block_hash text NOT NULL,
  contract_address text NOT NULL,
  event_name text,
  args jsonb,
  topics jsonb NOT NULL,
  data text NOT NULL,
  PRIMARY KEY (chain_id, transaction_hash, log_index)
);
CREATE INDEX IF NOT EXISTS chain_events_round_lookup
  ON chain_events (chain_id, contract_address, block_number, log_index);

CREATE TABLE IF NOT EXISTS indexer_checkpoints (
  chain_id bigint NOT NULL,
  service text NOT NULL,
  block_number bigint NOT NULL,
  block_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, service)
);

CREATE TABLE IF NOT EXISTS rounds (
  chain_id bigint NOT NULL,
  round_id numeric(78, 0) NOT NULL,
  contract_address text NOT NULL,
  state text NOT NULL DEFAULT 'prepared',
  roster jsonb NOT NULL DEFAULT '[]'::jsonb,
  deployment_block bigint,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  settled_at timestamptz,
  PRIMARY KEY (chain_id, round_id),
  UNIQUE (chain_id, contract_address)
);

CREATE TABLE IF NOT EXISTS market_assets (
  symbol text PRIMARY KEY,
  name text NOT NULL,
  canonical_address text,
  testnet_mock_address text,
  feed_id text,
  active boolean NOT NULL DEFAULT false,
  halted boolean NOT NULL DEFAULT false,
  current_multiplier numeric NOT NULL DEFAULT 1,
  pending_multiplier numeric,
  pending_multiplier_effective_at timestamptz,
  daily_volume numeric NOT NULL DEFAULT 0,
  last_bid numeric,
  last_ask numeric,
  quote_generated_at timestamptz,
  metadata_checked_at timestamptz NOT NULL DEFAULT now(),
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS market_samples (
  symbol text NOT NULL REFERENCES market_assets(symbol) ON DELETE CASCADE,
  sampled_at timestamptz NOT NULL,
  raw_mid numeric NOT NULL,
  adjusted_mid numeric NOT NULL,
  daily_volume numeric NOT NULL,
  halted boolean NOT NULL,
  PRIMARY KEY (symbol, sampled_at)
);
CREATE INDEX IF NOT EXISTS market_samples_recent
  ON market_samples (sampled_at DESC, symbol);

CREATE TABLE IF NOT EXISTS market_reports (
  source_report_hash text PRIMARY KEY,
  symbol text NOT NULL,
  feed_id text NOT NULL,
  price numeric NOT NULL,
  valid_from timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  verifier_type text NOT NULL,
  round_address text,
  accepted_transaction_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keeper_jobs (
  id bigserial PRIMARY KEY,
  chain_id bigint NOT NULL,
  idempotency_key text NOT NULL,
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending',
  transaction_hash text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS keeper_jobs_pending
  ON keeper_jobs (chain_id, state, id);

CREATE TABLE IF NOT EXISTS service_heartbeats (
  service text NOT NULL,
  chain_id bigint NOT NULL,
  status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service, chain_id)
);

COMMIT;
