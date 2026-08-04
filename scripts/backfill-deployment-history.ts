import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { deploymentKeyFor } from "../src/lib/deployment-key";

type Manifest = {
  environment: string;
  chainId: number;
  deploymentBlock: number;
  sourceCommit: string;
  contracts: { manager: string };
};

const chainId = Number(process.env.KEYGAME_CHAIN_ID || 46630);
const root = process.cwd();
const archiveDir = path.join(root, "deployments", "archive");
const archiveFiles = (await readdir(archiveDir))
  .filter((file) => file.startsWith(`${chainId}-`) && file.endsWith(".json"))
  .map((file) => path.join(archiveDir, file));
const files = [
  ...archiveFiles,
  path.join(root, "deployments", `${chainId}.json`),
];
const manifests = (
  await Promise.all(
    files.map(
      async (file) => JSON.parse(await readFile(file, "utf8")) as Manifest,
    ),
  )
)
  .filter(
    (manifest) =>
      manifest.chainId === chainId &&
      manifest.deploymentBlock &&
      manifest.contracts?.manager,
  )
  .sort((left, right) => left.deploymentBlock - right.deploymentBlock);

const database = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql:///keygame?host=/var/run/postgresql",
});
const client = await database.connect();
try {
  await client.query("BEGIN");
  for (const manifest of manifests) {
    const key = deploymentKeyFor(manifest);
    await client.query(
      `INSERT INTO deployments(
         deployment_key,chain_id,environment,deployment_block,
         source_commit,manifest)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(deployment_key) DO UPDATE SET
         environment=excluded.environment,
         deployment_block=excluded.deployment_block,
         source_commit=excluded.source_commit,
         manifest=excluded.manifest,
         updated_at=now()`,
      [
        key,
        manifest.chainId,
        manifest.environment,
        manifest.deploymentBlock,
        manifest.sourceCommit,
        JSON.stringify(manifest),
      ],
    );
  }

  for (let index = 0; index < manifests.length; index += 1) {
    const manifest = manifests[index];
    const key = deploymentKeyFor(manifest);
    const nextBlock = manifests[index + 1]?.deploymentBlock;
    await client.query(
      `UPDATE chain_events SET deployment_key=$1
       WHERE chain_id=$2 AND block_number >= $3
         AND ($4::bigint IS NULL OR block_number < $4)`,
      [key, chainId, manifest.deploymentBlock, nextBlock ?? null],
    );
    await client.query(
      `INSERT INTO rounds(
         deployment_key,chain_id,round_id,contract_address,state,
         deployment_block,prepared_at,settled_at)
       SELECT $1,$2,(prepared.args->>'roundId')::numeric,
         lower(prepared.args->>'round'),'prepared',prepared.block_number,
         coalesce(block.block_time,now()),NULL
       FROM chain_events prepared
       LEFT JOIN canonical_blocks block
         ON block.chain_id=prepared.chain_id
        AND block.number=prepared.block_number
       WHERE prepared.deployment_key=$1
         AND prepared.event_name='RoundPrepared'
         AND prepared.args->>'roundId' IS NOT NULL
         AND prepared.args->>'round' IS NOT NULL
       ON CONFLICT(deployment_key,round_id) DO UPDATE SET
         contract_address=excluded.contract_address,
         deployment_block=excluded.deployment_block`,
      [key, chainId],
    );
    await client.query(
      `UPDATE rounds r SET
         state=CASE
           WHEN EXISTS (
             SELECT 1 FROM chain_events e
             WHERE e.deployment_key=r.deployment_key
               AND lower(e.contract_address)=lower(r.contract_address)
               AND e.event_name='RoundSettled'
           ) THEN 'settled'
           WHEN EXISTS (
             SELECT 1 FROM chain_events e
             WHERE e.deployment_key=r.deployment_key
               AND lower(e.contract_address)=lower(r.contract_address)
               AND e.event_name='RoundCancelled'
           ) THEN 'cancelled'
           WHEN EXISTS (
             SELECT 1 FROM chain_events e
             WHERE e.deployment_key=r.deployment_key
               AND e.event_name='RoundActivated'
               AND e.args->>'roundId'=r.round_id::text
           ) THEN 'active'
           ELSE 'prepared'
         END,
         settled_at=(
           SELECT b.block_time FROM chain_events e
           JOIN canonical_blocks b
             ON b.chain_id=e.chain_id AND b.number=e.block_number
           WHERE e.deployment_key=r.deployment_key
             AND lower(e.contract_address)=lower(r.contract_address)
             AND e.event_name IN ('RoundSettled','RoundCancelled')
           ORDER BY e.block_number DESC LIMIT 1
         )
       WHERE r.deployment_key=$1`,
      [key],
    );
  }
  await client.query("COMMIT");
  process.stdout.write(
    `registered ${manifests.length} deployments and rebuilt round identities\n`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await database.end();
}
