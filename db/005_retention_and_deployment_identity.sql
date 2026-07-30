BEGIN;

ALTER TABLE deployments ADD COLUMN IF NOT EXISTS deployment_key text;
UPDATE deployments
SET deployment_key = concat(
  chain_id, ':',
  lower(manifest->'contracts'->>'manager'), ':',
  deployment_block
)
WHERE deployment_key IS NULL;
ALTER TABLE deployments ALTER COLUMN deployment_key SET NOT NULL;
ALTER TABLE deployments DROP CONSTRAINT IF EXISTS deployments_pkey;
ALTER TABLE deployments ADD PRIMARY KEY (deployment_key);
CREATE INDEX IF NOT EXISTS deployments_chain_lookup
  ON deployments (chain_id, deployment_block DESC);

ALTER TABLE chain_events ADD COLUMN IF NOT EXISTS deployment_key text;
UPDATE chain_events e
SET deployment_key = (
  SELECT d.deployment_key
  FROM deployments d
  WHERE d.chain_id=e.chain_id
  ORDER BY d.deployment_block DESC
  LIMIT 1
)
WHERE e.deployment_key IS NULL;
ALTER TABLE chain_events ALTER COLUMN deployment_key SET NOT NULL;
ALTER TABLE chain_events DROP CONSTRAINT IF EXISTS chain_events_pkey;
ALTER TABLE chain_events
  ADD PRIMARY KEY (deployment_key, transaction_hash, log_index);
CREATE INDEX IF NOT EXISTS chain_events_deployment_round_lookup
  ON chain_events (deployment_key, contract_address, block_number, log_index);

ALTER TABLE indexer_checkpoints ADD COLUMN IF NOT EXISTS deployment_key text;
UPDATE indexer_checkpoints c
SET deployment_key = (
  SELECT d.deployment_key
  FROM deployments d
  WHERE d.chain_id=c.chain_id
  ORDER BY d.deployment_block DESC
  LIMIT 1
)
WHERE c.deployment_key IS NULL;
ALTER TABLE indexer_checkpoints ALTER COLUMN deployment_key SET NOT NULL;
ALTER TABLE indexer_checkpoints
  DROP CONSTRAINT IF EXISTS indexer_checkpoints_pkey;
ALTER TABLE indexer_checkpoints
  ADD PRIMARY KEY (deployment_key, service);

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS deployment_key text;
UPDATE rounds r
SET deployment_key = (
  SELECT d.deployment_key
  FROM deployments d
  WHERE d.chain_id=r.chain_id
  ORDER BY d.deployment_block DESC
  LIMIT 1
)
WHERE r.deployment_key IS NULL;
ALTER TABLE rounds ALTER COLUMN deployment_key SET NOT NULL;
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_pkey;
ALTER TABLE rounds
  DROP CONSTRAINT IF EXISTS rounds_chain_id_contract_address_key;
ALTER TABLE rounds ADD PRIMARY KEY (deployment_key, round_id);
ALTER TABLE rounds ADD CONSTRAINT rounds_contract_address_unique
  UNIQUE (contract_address);

ALTER TABLE keeper_jobs ADD COLUMN IF NOT EXISTS deployment_key text;
UPDATE keeper_jobs k
SET deployment_key = (
  SELECT d.deployment_key
  FROM deployments d
  WHERE d.chain_id=k.chain_id
  ORDER BY d.deployment_block DESC
  LIMIT 1
)
WHERE k.deployment_key IS NULL;
ALTER TABLE keeper_jobs ALTER COLUMN deployment_key SET NOT NULL;
ALTER TABLE keeper_jobs
  DROP CONSTRAINT IF EXISTS keeper_jobs_chain_id_idempotency_key_key;
ALTER TABLE keeper_jobs
  ADD CONSTRAINT keeper_jobs_deployment_idempotency_unique
  UNIQUE (deployment_key, idempotency_key);
CREATE INDEX IF NOT EXISTS keeper_jobs_deployment_pending
  ON keeper_jobs (deployment_key, state, id);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce_hash text PRIMARY KEY,
  address text NOT NULL,
  chain_id bigint NOT NULL,
  domain text NOT NULL,
  origin text NOT NULL,
  message text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS auth_nonces_expiry
  ON auth_nonces (expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  address text NOT NULL,
  chain_id bigint NOT NULL,
  domain text NOT NULL,
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS auth_sessions_address
  ON auth_sessions (address, expires_at DESC);

CREATE TABLE IF NOT EXISTS player_profiles (
  address text PRIMARY KEY,
  handle text NOT NULL UNIQUE,
  display_name text NOT NULL,
  favorite_ticker text,
  avatar_seed text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_profiles_handle_format
    CHECK (handle = lower(handle) AND handle ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT player_profiles_display_name_length
    CHECK (char_length(display_name) BETWEEN 1 AND 24)
);

CREATE TABLE IF NOT EXISTS raid_campaigns (
  id text PRIMARY KEY,
  deployment_key text NOT NULL REFERENCES deployments(deployment_key),
  state text NOT NULL,
  threshold integer NOT NULL,
  eligible_voters integer NOT NULL,
  gathering_expires_at timestamptz NOT NULL,
  countdown_starts_at timestamptz,
  live_starts_at timestamptz,
  live_ends_at timestamptz,
  cooldown_ends_at timestamptz,
  discrepancy text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raid_campaign_state
    CHECK (state IN ('GATHERING','COUNTDOWN','LIVE','COOLDOWN','EXPIRED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_raid_per_deployment
  ON raid_campaigns (deployment_key)
  WHERE state IN ('GATHERING','COUNTDOWN','LIVE','COOLDOWN');

CREATE TABLE IF NOT EXISTS raid_votes (
  campaign_id text NOT NULL REFERENCES raid_campaigns(id) ON DELETE CASCADE,
  deployment_key text NOT NULL,
  address text NOT NULL,
  accepted_claim_tx text NOT NULL,
  accepted_claim_block bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  valid boolean NOT NULL DEFAULT true,
  PRIMARY KEY (campaign_id, address)
);
CREATE INDEX IF NOT EXISTS raid_votes_deployment
  ON raid_votes (deployment_key, created_at DESC);

CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket text NOT NULL,
  subject text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, subject)
);

COMMIT;
