-- Canonical-event-derived presentation records. These are disposable views of
-- chain history: a reorg rollback deletes the affected provenance rows and the
-- indexer deterministically rebuilds them.
CREATE TABLE IF NOT EXISTS round_highlights (
  deployment_key text NOT NULL,
  round_id numeric(78,0) NOT NULL,
  highlight_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('CALL','WHALE','TICKER_FLIP','HEAT_CHANGE','POT_MILESTONE','RUG_STEAL','SETTLEMENT','CLAIM')),
  headline text NOT NULL,
  player_address text,
  ticker text,
  amount_usdg numeric(78,0),
  at_seconds numeric NOT NULL,
  block_number numeric(78,0),
  log_index integer,
  transaction_hash text,
  contract_version text NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  PRIMARY KEY (deployment_key, round_id, highlight_id)
);

CREATE TABLE IF NOT EXISTS player_achievements (
  deployment_key text NOT NULL,
  round_id numeric(78,0) NOT NULL,
  achievement_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('FINAL_CALLER','BELL_SNIPER','RUG_SURVIVOR','BIGGEST_APE','STOCK_CAPTAIN','FLIP_ARTIST','HEAT_STARTER')),
  player_address text NOT NULL,
  ticker text,
  title text NOT NULL,
  detail text NOT NULL,
  block_number numeric(78,0),
  log_index integer,
  transaction_hash text,
  contract_version text NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  PRIMARY KEY (deployment_key, round_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS round_highlights_provenance_idx
  ON round_highlights (deployment_key, block_number, log_index);
CREATE INDEX IF NOT EXISTS player_achievements_player_idx
  ON player_achievements (deployment_key, lower(player_address), round_id DESC);
