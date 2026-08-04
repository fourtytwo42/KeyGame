-- Saved by the Bell v5 open-market pot accounting.
ALTER TABLE stock_pot_contributions
  ADD COLUMN IF NOT EXISTS usdg_consumed numeric(78,0),
  ADD COLUMN IF NOT EXISTS residual_usdg numeric(78,0);

UPDATE stock_pot_contributions
SET usdg_consumed = usdg_amount,
    residual_usdg = 0
WHERE usdg_consumed IS NULL OR residual_usdg IS NULL;

ALTER TABLE stock_pot_contributions
  ALTER COLUMN usdg_consumed SET NOT NULL,
  ALTER COLUMN residual_usdg SET NOT NULL;

ALTER TABLE stock_pot_contributions
  ADD CONSTRAINT stock_pot_contributions_usdg_conservation
  CHECK (usdg_amount = usdg_consumed + residual_usdg) NOT VALID;

ALTER TABLE stock_pot_contributions
  VALIDATE CONSTRAINT stock_pot_contributions_usdg_conservation;

ALTER TABLE stock_pot_allocations
  ADD COLUMN IF NOT EXISTS asset_kind text NOT NULL DEFAULT 'STOCK'
    CHECK (asset_kind IN ('STOCK','USDG'));

COMMENT ON COLUMN stock_pot_allocations.stock_token IS
  'Reward-basket token address. In v5 this includes the canonical USDG address.';

CREATE INDEX IF NOT EXISTS stock_pot_contributions_residual_idx
  ON stock_pot_contributions (deployment_key, round_id)
  WHERE residual_usdg > 0;

ALTER TABLE soak_asset_reconciliations
  DROP CONSTRAINT IF EXISTS soak_asset_reconciliations_ticker_index_check;
ALTER TABLE soak_asset_reconciliations
  ADD CONSTRAINT soak_asset_reconciliations_ticker_index_check
  CHECK (ticker_index BETWEEN 0 AND 4);

COMMENT ON COLUMN soak_asset_reconciliations.ticker_index IS
  'V5 uses indexes 0-3 for Stock Tokens and index 4 for residual USDG.';
