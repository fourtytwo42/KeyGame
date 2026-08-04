BEGIN;

ALTER TABLE market_assets
  ADD COLUMN IF NOT EXISTS market_id text,
  ADD COLUMN IF NOT EXISTS pool_address text,
  ADD COLUMN IF NOT EXISTS fee_tier integer,
  ADD COLUMN IF NOT EXISTS twap_window_seconds integer,
  ADD COLUMN IF NOT EXISTS source_chain_id bigint,
  ADD COLUMN IF NOT EXISTS pool_usdg_depth numeric,
  ADD COLUMN IF NOT EXISTS buy_impact_bps numeric,
  ADD COLUMN IF NOT EXISTS sell_impact_bps numeric,
  ADD COLUMN IF NOT EXISTS spot_twap_deviation_bps numeric,
  ADD COLUMN IF NOT EXISTS pool_liquidity numeric,
  ADD COLUMN IF NOT EXISTS dex_safe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dex_safety_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dex_observed_at timestamptz;

ALTER TABLE market_samples
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'robinhood-rest',
  ADD COLUMN IF NOT EXISTS twap_tick integer,
  ADD COLUMN IF NOT EXISTS source_block_number bigint,
  ADD COLUMN IF NOT EXISTS source_block_hash text;

ALTER TABLE market_reports
  ADD COLUMN IF NOT EXISTS market_id text,
  ADD COLUMN IF NOT EXISTS pool_address text,
  ADD COLUMN IF NOT EXISTS source_chain_id bigint,
  ADD COLUMN IF NOT EXISTS source_block_number bigint,
  ADD COLUMN IF NOT EXISTS source_block_hash text,
  ALTER COLUMN feed_id DROP NOT NULL;

COMMIT;
