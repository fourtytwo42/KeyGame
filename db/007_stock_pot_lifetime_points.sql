-- Last Bell v4 stock-pot and lifetime-points event-derived state.
CREATE TABLE IF NOT EXISTS stock_pot_contributions (
  deployment_key text NOT NULL,
  round_id numeric NOT NULL,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL,
  player_address text NOT NULL,
  ticker_index smallint NOT NULL CHECK (ticker_index BETWEEN 0 AND 3),
  stock_token text NOT NULL,
  usdg_amount numeric(78,0) NOT NULL,
  stock_received numeric(78,0) NOT NULL,
  multiplier_bps integer NOT NULL,
  points numeric(78,0) NOT NULL,
  recent_volume numeric(78,0) NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  PRIMARY KEY (deployment_key, transaction_hash, log_index)
);

CREATE TABLE IF NOT EXISTS lifetime_point_epochs (
  deployment_key text NOT NULL,
  round_id numeric NOT NULL,
  player_address text NOT NULL,
  ticker_asset_id text NOT NULL,
  pending_points numeric(78,0) NOT NULL DEFAULT 0,
  activated_points numeric(78,0) NOT NULL DEFAULT 0,
  cancelled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (deployment_key, round_id, player_address, ticker_asset_id)
);

CREATE TABLE IF NOT EXISTS stock_pot_allocations (
  deployment_key text NOT NULL,
  round_id numeric NOT NULL,
  stock_token text NOT NULL,
  accounted_amount numeric(78,0) NOT NULL,
  holder_amount numeric(78,0) NOT NULL,
  winning_stock_amount numeric(78,0) NOT NULL,
  lifetime_amount numeric(78,0) NOT NULL,
  seed_amount numeric(78,0) NOT NULL,
  protocol_amount numeric(78,0) NOT NULL,
  PRIMARY KEY (deployment_key, round_id, stock_token)
);

CREATE TABLE IF NOT EXISTS stock_reward_claims (
  deployment_key text NOT NULL,
  round_id numeric,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL,
  beneficiary text NOT NULL,
  category text NOT NULL CHECK (
    category IN ('LAST_BELL','WINNING_STOCK','LIFETIME','REFUND','SEED','PROTOCOL')
  ),
  stock_token text NOT NULL,
  amount numeric(78,0) NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  PRIMARY KEY (deployment_key, transaction_hash, log_index, stock_token)
);

CREATE TABLE IF NOT EXISTS leaderboard_materializations (
  deployment_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('round','season','lifetime')),
  scope_id text NOT NULL,
  player_address text NOT NULL,
  total_points numeric(78,0) NOT NULL DEFAULT 0,
  settled_usdg numeric(78,0) NOT NULL DEFAULT 0,
  largest_call numeric(78,0) NOT NULL DEFAULT 0,
  ticker_flips bigint NOT NULL DEFAULT 0,
  final_bells bigint NOT NULL DEFAULT 0,
  rewards_claimed_usd numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_key, scope, scope_id, player_address)
);

CREATE INDEX IF NOT EXISTS stock_pot_contributions_player_idx
  ON stock_pot_contributions (deployment_key, lower(player_address), round_id);
CREATE INDEX IF NOT EXISTS stock_reward_claims_beneficiary_idx
  ON stock_reward_claims (deployment_key, lower(beneficiary), round_id);
