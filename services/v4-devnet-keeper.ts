import {
  createWalletClient,
  http,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import {
  lastBellV4Abi,
  roundManagerV4Abi,
} from "../src/lib/web3/last-bell-abi";
import {
  deploymentKeyFor,
  heartbeat,
  loadManifest,
  pool,
  publicClientFor,
} from "./common";

process.env.KEYGAME_CHAIN_ID ??= "31337";
const manifest = await loadManifest();
if (
  manifest.chainId !== 31337 ||
  !manifest.mockOnly ||
  manifest.contractVersion !== "saved-bell-v5-market-pot"
) {
  throw new Error("The v4 devnet keeper only runs on mock chain 31337.");
}

const operator = (manifest as typeof manifest & { deployer?: Address })
  .deployer;
if (!operator) throw new Error("The devnet deployment has no operator.");

const deploymentKey = deploymentKeyFor(manifest);
const client = publicClientFor(manifest);
const wallet = createWalletClient({
  account: operator,
  chain: client.chain,
  pollingInterval: 100,
  transport: http(manifest.rpc.primary),
});
const manager = manifest.contracts.manager;
const pollMs = Number(process.env.V4_KEEPER_POLL_MS || 250);

type KeeperPayload = {
  round?: Address;
  roundId?: string;
  settings?: {
    roundId: string;
    startDuration: string;
    extensionDuration: string;
    rugDuration: string;
    hardCapDuration: string;
    heatTarget: string;
    producerPassRequired: boolean;
  };
  tickers?: Array<{ symbol: Hex; assetId: Hex; token: Address }>;
};

async function enqueue(
  type: "v4-finalize" | "v4-prepare" | "v4-activate",
  key: string,
  payload: KeeperPayload,
) {
  await pool.query(
    `INSERT INTO keeper_jobs(
       deployment_key,chain_id,idempotency_key,job_type,payload)
     VALUES($1,31337,$2,$3,$4)
     ON CONFLICT(deployment_key,idempotency_key) DO UPDATE SET
       job_type=excluded.job_type,
       payload=excluded.payload,
       state='pending',
       transaction_hash=NULL,
       last_error=NULL,
       updated_at=now()
     WHERE keeper_jobs.state='failed'
       AND keeper_jobs.transaction_hash IS NULL`,
    [deploymentKey, key, type, JSON.stringify(payload)],
  );
}

async function scheduleLifecycle() {
  const [active, prepared, latest] = await Promise.all([
    client.readContract({
      address: manager,
      abi: roundManagerV4Abi,
      functionName: "activeRound",
    }),
    client.readContract({
      address: manager,
      abi: roundManagerV4Abi,
      functionName: "preparedRound",
    }),
    client.readContract({
      address: manager,
      abi: roundManagerV4Abi,
      functionName: "latestRoundId",
    }),
  ]);

  if (prepared !== zeroAddress) {
    await enqueue("v4-activate", `v4:activate:${prepared.toLowerCase()}`, {
      round: prepared,
      roundId: latest.toString(),
    });
    return;
  }
  if (active === zeroAddress) return;

  const phase = Number(
    await client.readContract({
      address: active,
      abi: lastBellV4Abi,
      functionName: "currentPhase",
    }),
  );
  if (phase === 3) {
    await enqueue("v4-finalize", `v4:finalize:${active.toLowerCase()}`, {
      round: active,
      roundId: latest.toString(),
    });
    return;
  }
  if (phase !== 4 && phase !== 5) return;

  const configs = await Promise.all(
    [0n, 1n, 2n, 3n].map((index) =>
      client.readContract({
        address: active,
        abi: lastBellV4Abi,
        functionName: "tickerConfigs",
        args: [index],
      }),
    ),
  );
  const nextId = latest + 1n;
  await enqueue("v4-prepare", `v4:prepare:${manager}:${nextId}`, {
    roundId: nextId.toString(),
    settings: {
      roundId: nextId.toString(),
      startDuration: "300",
      extensionDuration: "2",
      rugDuration: "10",
      hardCapDuration: "600",
      heatTarget: "4000000000",
      producerPassRequired: false,
    },
    tickers: configs.map((config) => ({
      symbol: config[0],
      assetId: config[1],
      token: config[2],
    })),
  });
}

async function reconcileBroadcast(job: { id: string; transaction_hash: Hex }) {
  const receipt = await client
    .getTransactionReceipt({ hash: job.transaction_hash })
    .catch(() => null);
  if (!receipt) return false;
  await pool.query(
    `UPDATE keeper_jobs
       SET state=$2,last_error=$3,updated_at=now()
     WHERE id=$1`,
    [
      job.id,
      receipt.status === "success" ? "confirmed" : "failed",
      receipt.status === "success" ? null : "Transaction reverted",
    ],
  );
  return true;
}

async function processJob() {
  const connection = await pool.connect();
  let job:
    | {
        id: string;
        job_type: string;
        transaction_hash: Hex | null;
        payload: KeeperPayload;
      }
    | undefined;
  try {
    await connection.query("BEGIN");
    const result = await connection.query<typeof job & object>(
      `SELECT id,job_type,transaction_hash,payload
       FROM keeper_jobs
       WHERE deployment_key=$1
         AND job_type LIKE 'v4-%'
         AND state IN ('pending','broadcasting')
       ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`,
      [deploymentKey],
    );
    job = result.rows[0] as typeof job;
    if (!job) {
      await connection.query("COMMIT");
      return;
    }
    if (job.transaction_hash) {
      await connection.query("COMMIT");
      await reconcileBroadcast({
        id: job.id,
        transaction_hash: job.transaction_hash,
      });
      return;
    }
    await connection.query(
      `UPDATE keeper_jobs SET state='broadcasting',attempts=attempts+1,
         updated_at=now() WHERE id=$1`,
      [job.id],
    );
    await connection.query("COMMIT");
  } finally {
    connection.release();
  }

  if (!job) return;
  try {
    let request;
    if (job.job_type === "v4-finalize") {
      request = await client.simulateContract({
        account: operator,
        address: manager,
        abi: roundManagerV4Abi,
        functionName: "finalizeActive",
      });
    } else if (job.job_type === "v4-activate") {
      request = await client.simulateContract({
        account: operator,
        address: manager,
        abi: roundManagerV4Abi,
        functionName: "activatePrepared",
        args: [[0n, 0n, 0n, 0n], [0n, 0n, 0n, 0n], (1n << 64n) - 1n],
      });
    } else {
      if (!job.payload.settings || job.payload.tickers?.length !== 4) {
        throw new Error("Malformed v4 prepare job.");
      }
      const settings = job.payload.settings;
      request = await client.simulateContract({
        account: operator,
        address: manager,
        abi: roundManagerV4Abi,
        functionName: "prepareRound",
        args: [
          {
            roundId: BigInt(settings.roundId),
            startDuration: BigInt(settings.startDuration),
            extensionDuration: BigInt(settings.extensionDuration),
            rugDuration: BigInt(settings.rugDuration),
            hardCapDuration: BigInt(settings.hardCapDuration),
            heatTarget: BigInt(settings.heatTarget),
            producerPassRequired: settings.producerPassRequired,
          },
          job.payload.tickers as [
            { symbol: Hex; assetId: Hex; token: Address },
            { symbol: Hex; assetId: Hex; token: Address },
            { symbol: Hex; assetId: Hex; token: Address },
            { symbol: Hex; assetId: Hex; token: Address },
          ],
        ],
      });
    }
    const hash = await wallet.writeContract(request.request as never);
    await pool.query(
      `UPDATE keeper_jobs SET transaction_hash=$2,updated_at=now()
       WHERE id=$1`,
      [job.id, hash],
    );
    await reconcileBroadcast({ id: job.id, transaction_hash: hash });
  } catch (error) {
    await pool.query(
      `UPDATE keeper_jobs SET state='failed',last_error=$2,updated_at=now()
       WHERE id=$1 AND transaction_hash IS NULL`,
      [job.id, error instanceof Error ? error.message : String(error)],
    );
    throw error;
  }
}

const lockClient = await pool.connect();
const lock = await lockClient.query<{ acquired: boolean }>(
  "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
  [`keygame-v4-keeper:${deploymentKey}`],
);
if (!lock.rows[0]?.acquired)
  throw new Error("Another v4 keeper owns the lock.");

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

while (!stopping) {
  try {
    await scheduleLifecycle();
    await processJob();
    await heartbeat("v4-devnet-keeper", 31337, "ok", { deploymentKey });
  } catch (error) {
    await heartbeat("v4-devnet-keeper", 31337, "error", {
      message: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [
  `keygame-v4-keeper:${deploymentKey}`,
]);
lockClient.release();
await pool.end();
