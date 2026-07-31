CREATE TABLE IF NOT EXISTS market_catalog_versions (
  deployment_key text NOT NULL,
  catalog_version text NOT NULL,
  manifest_hash text NOT NULL,
  assets jsonb NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY (deployment_key, catalog_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS market_catalog_one_active
  ON market_catalog_versions(deployment_key)
  WHERE retired_at IS NULL;

CREATE TABLE IF NOT EXISTS round_roster_evidence (
  deployment_key text NOT NULL,
  round_id numeric(78,0) NOT NULL,
  round_address text,
  catalog_version text NOT NULL,
  screened_at timestamptz NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_key, round_id)
);

CREATE INDEX IF NOT EXISTS round_roster_evidence_catalog
  ON round_roster_evidence(deployment_key, catalog_version, screened_at DESC);
