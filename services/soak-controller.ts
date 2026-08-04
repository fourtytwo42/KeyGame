import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { deploymentKeyFor, heartbeat, loadManifest, pool } from "./common";

const execFileAsync = promisify(execFile);
const manifest = await loadManifest();
if (manifest.chainId !== 46630 || !manifest.mockOnly) {
  throw new Error("The soak controller is testnet-only.");
}
const deploymentKey = deploymentKeyFor(manifest);
const pollMs = Number(process.env.SOAK_CONTROLLER_POLL_MS || 15_000);

async function run(command: string, args: string[], environment = process.env) {
  return execFileAsync(command, args, {
    cwd: process.cwd(),
    env: environment,
    timeout: 10 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function tick() {
  const active = await pool.query<{
    id: string;
    started_at: Date;
    target_hours: number;
    target_rounds: number;
  }>(
    `SELECT id,started_at,target_hours,target_rounds FROM soak_runs
     WHERE deployment_key=$1 AND state IN ('running','monitoring')
     ORDER BY created_at DESC LIMIT 1`,
    [deploymentKey],
  );
  if (!active.rowCount) {
    await heartbeat("soak-controller", manifest.chainId, "waiting", {
      deploymentKey,
    });
    return;
  }
  const soak = active.rows[0];
  await run("corepack", ["pnpm", "soak:run"]);
  const faults = await pool.query<{ id: string }>(
    `SELECT id FROM soak_faults
     WHERE run_id=$1 AND state='scheduled' AND scheduled_at<=now()
     ORDER BY scheduled_at`,
    [soak.id],
  );
  for (const fault of faults.rows) {
    await run("bash", ["scripts/run-soak-fault.sh", fault.id], {
      ...process.env,
      SOAK_RUN_ID: soak.id,
    });
  }
  const progress = await pool.query<{
    confirmed: string;
    failed: string;
    scheduled: string;
  }>(
    `SELECT
       count(*) FILTER (WHERE state='confirmed')::text AS confirmed,
       count(*) FILTER (WHERE state='failed')::text AS failed,
       count(*) FILTER (WHERE state='scheduled')::text AS scheduled
     FROM soak_actions WHERE run_id=$1`,
    [soak.id],
  );
  const elapsedHours =
    (Date.now() - new Date(soak.started_at).getTime()) / 3_600_000;
  await pool.query(
    `INSERT INTO soak_service_health(run_id,service,status,details)
     VALUES($1,'soak-controller','healthy',$2)`,
    [
      soak.id,
      JSON.stringify({
        elapsedHours,
        confirmed: Number(progress.rows[0]?.confirmed ?? 0),
        failed: Number(progress.rows[0]?.failed ?? 0),
        scheduled: Number(progress.rows[0]?.scheduled ?? 0),
      }),
    ],
  );
  await heartbeat("soak-controller", manifest.chainId, "healthy", {
    runId: soak.id,
    elapsedHours,
    confirmed: Number(progress.rows[0]?.confirmed ?? 0),
  });
}

const lockClient = await pool.connect();
const lock = await lockClient.query<{ acquired: boolean }>(
  "SELECT pg_try_advisory_lock(hashtext('keygame-soak-controller')) AS acquired",
);
if (!lock.rows[0]?.acquired) {
  lockClient.release();
  throw new Error("Another soak controller owns the advisory lock.");
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

while (!stopping) {
  try {
    await tick();
  } catch (error) {
    await heartbeat("soak-controller", manifest.chainId, "degraded", {
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

await lockClient.query(
  "SELECT pg_advisory_unlock(hashtext('keygame-soak-controller'))",
);
lockClient.release();
await pool.end();
