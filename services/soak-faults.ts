import type { Pool, PoolClient } from "pg";

export async function activeSoakFault(
  database: Pool | PoolClient,
  faultType: string,
) {
  if (process.env.NEXT_PUBLIC_GAME_MODE !== "testnet") return null;
  const result = await database.query<{
    id: string;
    run_id: string;
    parameters: Record<string, unknown>;
  }>(
    `SELECT id,run_id,parameters
       FROM soak_faults
      WHERE fault_type=$1 AND state='active'
        AND (restore_at IS NULL OR restore_at > now())
      ORDER BY activated_at DESC LIMIT 1`,
    [faultType],
  );
  return result.rows[0] ?? null;
}
