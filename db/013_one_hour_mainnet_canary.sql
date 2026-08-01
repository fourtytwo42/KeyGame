DO $$
BEGIN
  IF to_regclass('mainnet_canary_runs') IS NULL THEN
    RETURN;
  END IF;

  UPDATE mainnet_canary_runs
  SET state = 'stopped',
      last_error = coalesce(last_error || '; ', '') ||
        'Legacy 24-hour canary stopped by one-hour schedule migration',
      updated_at = now()
  WHERE duration_hours = 24
    AND state IN ('scheduled', 'running');

  ALTER TABLE mainnet_canary_runs
    DROP CONSTRAINT IF EXISTS mainnet_canary_runs_duration_hours_check;
  ALTER TABLE mainnet_canary_runs
    ADD CONSTRAINT mainnet_canary_runs_duration_hours_check CHECK (
      duration_hours = 1 OR
      (duration_hours = 24 AND state IN ('completed', 'stopped', 'failed'))
    );
END
$$;
