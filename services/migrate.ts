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
const manifestPath =
  process.env.KEYGAME_DEPLOYMENT_MANIFEST ??
  path.join(
    process.cwd(),
    "deployments",
    `${Number(process.env.KEYGAME_CHAIN_ID || 46630)}.json`,
  );
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  chainId: number;
  environment: string;
  deploymentBlock: number;
  sourceCommit: string;
  contracts: { manager: string };
};

for (const migration of migrations) {
  const existing = await pool
    .query("SELECT 1 FROM schema_migrations WHERE version = $1", [migration])
    .catch(() => ({ rowCount: 0 }));
  if (existing.rowCount) continue;
  if (migration === "005_retention_and_deployment_identity.sql") {
    await pool.query(
      `INSERT INTO deployments(
         chain_id,environment,deployment_block,source_commit,manifest)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(chain_id) DO UPDATE SET
         environment=excluded.environment,
         deployment_block=excluded.deployment_block,
         source_commit=excluded.source_commit,
         manifest=excluded.manifest,
         updated_at=now()`,
      [
        manifest.chainId,
        manifest.environment,
        manifest.deploymentBlock,
        manifest.sourceCommit,
        JSON.stringify(manifest),
      ],
    );
  }
  const sql = await readFile(path.join(migrationDir, migration), "utf8");
  await pool.query(sql);
  await pool.query(
    "INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING",
    [migration],
  );
  process.stdout.write(`applied ${migration}\n`);
}

await pool.end();
