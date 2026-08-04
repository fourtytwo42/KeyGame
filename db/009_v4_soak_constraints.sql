BEGIN;

ALTER TABLE soak_runs
  DROP CONSTRAINT IF EXISTS soak_runs_target_rounds_check;
ALTER TABLE soak_runs
  ADD CONSTRAINT soak_runs_target_rounds_check
  CHECK (target_rounds > 0);

COMMIT;
