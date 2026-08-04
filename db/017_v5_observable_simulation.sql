ALTER TABLE soak_runs
  DROP CONSTRAINT IF EXISTS soak_runs_run_profile_check;

ALTER TABLE soak_runs
  ADD CONSTRAINT soak_runs_run_profile_check
  CHECK (run_profile IN (
    'legacy-testnet',
    'v4-accelerated',
    'v4-endurance',
    'v4-fixture',
    'v4-torture',
    'v5-observable'
  ));
