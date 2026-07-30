import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql:///keygame?host=/var/run/postgresql",
});

const migrationDir = path.join(process.cwd(), "db");
const migrations = (await readdir(migrationDir))
  .filter((file) => /^\d+.*\.sql$/.test(file))
  .sort();

for (const migration of migrations) {
  const existing = await pool
    .query("SELECT 1 FROM schema_migrations WHERE version = $1", [migration])
    .catch(() => ({ rowCount: 0 }));
  if (existing.rowCount) continue;
  const sql = await readFile(path.join(migrationDir, migration), "utf8");
  await pool.query(sql);
  await pool.query(
    "INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING",
    [migration],
  );
  process.stdout.write(`applied ${migration}\n`);
}

await pool.end();
