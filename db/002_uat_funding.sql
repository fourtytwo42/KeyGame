BEGIN;

CREATE TABLE IF NOT EXISTS uat_funding_requests (
  id bigserial PRIMARY KEY,
  wallet_address text NOT NULL,
  native_transaction_hash text,
  token_transaction_hash text,
  requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uat_funding_rate_limit
  ON uat_funding_requests (wallet_address, requested_at DESC);

COMMIT;
