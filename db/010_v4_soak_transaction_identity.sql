BEGIN;

ALTER TABLE soak_transactions
  DROP CONSTRAINT IF EXISTS soak_transactions_transaction_hash_key;
CREATE INDEX IF NOT EXISTS soak_transactions_hash_lookup
  ON soak_transactions(transaction_hash);

COMMIT;
