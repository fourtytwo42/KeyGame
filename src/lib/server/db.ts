import "server-only";
import { Pool } from "pg";

declare global {
  var __keyGamePool: Pool | undefined;
}

export const database =
  globalThis.__keyGamePool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql:///keygame?host=/var/run/postgresql",
    max: 10,
    connectionTimeoutMillis: 2_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__keyGamePool = database;
}

export async function databaseHealth() {
  const started = Date.now();
  const result = await database.query<{ now: Date }>("SELECT now()");
  return {
    ok: true,
    latencyMs: Date.now() - started,
    serverTime: result.rows[0].now.toISOString(),
  };
}
