#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

database_url="${DATABASE_URL:-postgresql:///keygame?host=/var/run/postgresql}"
psql "$database_url" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
\i $project_root/db/014_v4_launch_rehearsal.sql
INSERT INTO v4_launch_rehearsal_runs(
  id,deployment_key,source_commit,manifest_hash,
  operator_address,player_a_address,player_b_address,
  state,target_rounds,duration_minutes,usdg_budget,
  initial_round_id,started_at,ends_at
) VALUES (
  'migration-check','31337:test','source','manifest',
  '0x1','0x2','0x3','running',10,60,100000000,
  1,now(),now()+interval '60 minutes'
);
DO \$\$
BEGIN
  BEGIN
    INSERT INTO v4_launch_rehearsal_runs(
      id,deployment_key,source_commit,manifest_hash,
      operator_address,player_a_address,player_b_address,
      chain_id,state,target_rounds,duration_minutes,usdg_budget,
      initial_round_id,started_at,ends_at
    ) VALUES (
      'wrong-chain','4663:test','source','manifest',
      '0x1','0x2','0x3',4663,'running',10,60,100000000,
      1,now(),now()+interval '60 minutes'
    );
    RAISE EXCEPTION 'chain-4663 rehearsal was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END \$\$;
ROLLBACK;
SQL

echo "Devnet launch rehearsal migration test passed."
