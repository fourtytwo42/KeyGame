import {
  stringToHex,
  type Address,
  type Hex,
  zeroAddress,
  zeroHash,
} from "viem";
import { screenRoster } from "../src/lib/game/market-screen";
import type { ScreeningAsset } from "../src/lib/game/types";
import { lastBellAbi, roundManagerAbi } from "../src/lib/web3/last-bell-abi";
import {
  hydrateRoundSettings,
  persistRoundSettings,
  type PersistedRoundSettings,
} from "./keeper-payload";
import {
  heartbeat,
  loadManifest,
  pool,
  publicClientFor,
  walletClientFor,
} from "./common";

const manifest = await loadManifest();
const client = publicClientFor(manifest);
const wallet = await walletClientFor(manifest, "keeper");
const manager = manifest.contracts.manager;
const lockId = BigInt(manifest.chainId) * 10_000n + 4663n;

async function loadRoster() {
  const assets = await pool.query<{
    symbol: string;
    name: string;
    canonical_address: Address;
    testnet_mock_address: Address;
    feed_id: Hex | null;
    active: boolean;
    halted: boolean;
    daily_volume: string;
    current_multiplier: string;
  }>(
    `SELECT symbol,name,canonical_address,testnet_mock_address,feed_id,
            active,halted,daily_volume,current_multiplier
     FROM market_assets ORDER BY symbol`,
  );
  const samples = await pool.query<{
    symbol: string;
    sampled_at: Date;
    adjusted_mid: string;
  }>(
    `SELECT symbol,sampled_at,adjusted_mid FROM market_samples
     WHERE sampled_at >= now() - interval '30 minutes'
     ORDER BY symbol,sampled_at`,
  );
  const bySymbol = new Map<
    string,
    Array<{ timestamp: number; price: number }>
  >();
  for (const sample of samples.rows) {
    const values = bySymbol.get(sample.symbol) ?? [];
    values.push({
      timestamp: Math.floor(sample.sampled_at.getTime() / 1000),
      price: Number(sample.adjusted_mid),
    });
    bySymbol.set(sample.symbol, values);
  }
  const screening: ScreeningAsset[] = assets.rows.map((asset) => ({
    ticker: asset.symbol,
    name: asset.name,
    tokenAddress: asset.testnet_mock_address,
    canonicalAddress: asset.canonical_address,
    testnetMockAddress: asset.testnet_mock_address,
    feedId: asset.feed_id ?? undefined,
    active: asset.active,
    halted: asset.halted,
    canonical: Boolean(asset.canonical_address),
    dailyVolume: Number(asset.daily_volume),
    currentMultiplier: Number(asset.current_multiplier),
    mockOnly: true,
    samples: bySymbol.get(asset.symbol) ?? [],
  }));
  return screenRoster(screening);
}

async function sendManager(
  functionName:
    "finalizeActive" | "activatePrepared" | "cancelActive" | "prepareRound",
  args: readonly unknown[] = [],
  onBroadcast?: (hash: Hex) => Promise<void>,
) {
  const account = wallet.account;
  if (!account) throw new Error("Keeper account unavailable");
  const request = await client.simulateContract({
    account,
    address: manager,
    abi: roundManagerAbi,
    functionName,
    args: args as never,
  });
  const hash = await wallet.writeContract(request.request);
  await onBroadcast?.(hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return hash;
}

async function prepareIfNeeded() {
  const [active, prepared, latest] = await Promise.all([
    client.readContract({
      address: manager,
      abi: roundManagerAbi,
      functionName: "activeRound",
    }),
    client.readContract({
      address: manager,
      abi: roundManagerAbi,
      functionName: "preparedRound",
    }),
    client.readContract({
      address: manager,
      abi: roundManagerAbi,
      functionName: "latestRoundId",
    }),
  ]);
  if (prepared !== zeroAddress) return;
  if (active !== zeroAddress) {
    const phase = await client.readContract({
      address: active,
      abi: lastBellAbi,
      functionName: "currentPhase",
    });
    if (Number(phase) !== 4 && Number(phase) !== 5) return;
  }
  const roster = await loadRoster();
  if (roster.delayed || roster.selected.length !== 4) {
    throw new Error(roster.reason || "Dynamic roster is delayed");
  }
  const settings = {
    roundId: latest + 1n,
    claimPrice: 1_000_000n,
    startDuration: 45,
    extensionDuration: 2,
    rugDuration: 10,
    hardCapDuration: 180,
    maxReportAge: 3,
    marketThresholdBps: 5,
    greenMultiplierBps: 12_500,
    flatMultiplierBps: 10_000,
    redMultiplierBps: 7_500,
    marketMode: roster.mode === "VERIFIED" ? 1 : 0,
    producerPassRequired: false,
  };
  const tickers = roster.selected.map((asset) => ({
    symbol: stringToHex(asset.ticker, { size: 32 }),
    token: asset.testnetMockAddress ?? asset.tokenAddress,
    feedId: asset.feedId ?? zeroHash,
  })) as [
    { symbol: Hex; token: Address; feedId: Hex },
    { symbol: Hex; token: Address; feedId: Hex },
    { symbol: Hex; token: Address; feedId: Hex },
    { symbol: Hex; token: Address; feedId: Hex },
  ];
  await pool.query(
    `INSERT INTO keeper_jobs(chain_id,idempotency_key,job_type,payload)
     VALUES($1,$2,'prepare',$3)
     ON CONFLICT(chain_id,idempotency_key) DO NOTHING`,
    [
      manifest.chainId,
      `prepare:${settings.roundId}`,
      JSON.stringify({
        roundId: settings.roundId.toString(),
        settings: persistRoundSettings(settings),
        tickers,
        roster,
      }),
    ],
  );
}

async function finalizeIfNeeded() {
  const active = await client.readContract({
    address: manager,
    abi: roundManagerAbi,
    functionName: "activeRound",
  });
  if (active === zeroAddress) return;
  const phase = await client.readContract({
    address: active,
    abi: lastBellAbi,
    functionName: "currentPhase",
  });
  if (Number(phase) === 3) {
    const roundId = await client.readContract({
      address: active,
      abi: lastBellAbi,
      functionName: "roundId",
    });
    await pool.query(
      `INSERT INTO keeper_jobs(chain_id,idempotency_key,job_type,payload)
       VALUES($1,$2,'finalize',$3)
       ON CONFLICT(chain_id,idempotency_key) DO NOTHING`,
      [
        manifest.chainId,
        `finalize:${active.toLowerCase()}`,
        JSON.stringify({ roundId: roundId.toString(), round: active }),
      ],
    );
  }
}

async function cancelForReportOutage() {
  const active = await client.readContract({
    address: manager,
    abi: roundManagerAbi,
    functionName: "activeRound",
  });
  if (active === zeroAddress) return;
  const [mode, startedAt, phase] = await Promise.all([
    client.readContract({
      address: active,
      abi: lastBellAbi,
      functionName: "marketMode",
    }),
    client.readContract({
      address: active,
      abi: lastBellAbi,
      functionName: "startedAt",
    }),
    client.readContract({
      address: active,
      abi: lastBellAbi,
      functionName: "currentPhase",
    }),
  ]);
  if (Number(mode) !== 1 || startedAt === 0n || Number(phase) > 2) return;
  const health = await pool.query<{
    status: string;
    details: { available?: number; outageSince?: number };
  }>(
    `SELECT status,details FROM service_heartbeats
     WHERE chain_id=$1 AND service='data-streams-adapter'`,
    [manifest.chainId],
  );
  const state = health.rows[0];
  const now = Math.floor(Date.now() / 1000);
  if (
    state?.status === "error" &&
    state.details.available === 0 &&
    state.details.outageSince &&
    now - state.details.outageSince >= 15
  ) {
    await pool.query(
      `INSERT INTO keeper_jobs(chain_id,idempotency_key,job_type,payload)
       VALUES($1,$2,'cancel',$3)
       ON CONFLICT(chain_id,idempotency_key) DO NOTHING`,
      [
        manifest.chainId,
        `cancel:market-data:${active.toLowerCase()}`,
        JSON.stringify({
          reason: stringToHex("MARKET_DATA_OUTAGE", { size: 32 }),
        }),
      ],
    );
  }
}

async function processJob() {
  const connection = await pool.connect();
  let activeJobId: string | undefined;
  try {
    await connection.query("BEGIN");
    const result = await connection.query<{
      id: string;
      state: string;
      transaction_hash: Hex | null;
      job_type: string;
      payload: {
        openingReports?: Hex[];
        reason?: Hex;
        settings?: PersistedRoundSettings;
        tickers?: Array<Record<string, string>>;
        roster?: unknown;
        roundId?: string;
      };
    }>(
      `SELECT id,state,transaction_hash,job_type,payload FROM keeper_jobs
       WHERE chain_id=$1 AND state IN ('pending','broadcasting') ORDER BY id
       FOR UPDATE SKIP LOCKED LIMIT 1`,
      [manifest.chainId],
    );
    if (!result.rowCount) {
      await connection.query("COMMIT");
      return;
    }
    const job = result.rows[0];
    activeJobId = job.id;
    if (job.transaction_hash) {
      const receipt = await client
        .getTransactionReceipt({
          hash: job.transaction_hash,
        })
        .catch(() => null);
      if (!receipt) {
        await connection.query("COMMIT");
        return;
      }
      await connection.query(
        `UPDATE keeper_jobs SET state=$2,last_error=$3,updated_at=now()
         WHERE id=$1`,
        [
          job.id,
          receipt.status === "success" ? "confirmed" : "failed",
          receipt.status === "success" ? null : "Transaction reverted",
        ],
      );
      await connection.query("COMMIT");
      return;
    }
    await connection.query(
      `UPDATE keeper_jobs SET state='broadcasting',attempts=attempts+1,
       updated_at=now() WHERE id=$1`,
      [job.id],
    );
    await connection.query("COMMIT");
    const rememberHash = async (hash: Hex) => {
      await pool.query(
        `UPDATE keeper_jobs SET transaction_hash=$2,updated_at=now()
         WHERE id=$1`,
        [job.id, hash],
      );
    };
    let hash: Hex;
    if (job.job_type === "activate") {
      const reports = job.payload.openingReports ?? ["0x", "0x", "0x", "0x"];
      if (reports.length !== 4)
        throw new Error("Activation needs four reports");
      hash = await sendManager("activatePrepared", [reports], rememberHash);
    } else if (job.job_type === "cancel") {
      hash = await sendManager(
        "cancelActive",
        [job.payload.reason ?? stringToHex("MARKET_DATA_OUTAGE", { size: 32 })],
        rememberHash,
      );
    } else if (job.job_type === "finalize") {
      hash = await sendManager("finalizeActive", [], rememberHash);
    } else if (job.job_type === "prepare") {
      if (!job.payload.settings || job.payload.tickers?.length !== 4) {
        throw new Error("Prepare job payload is malformed");
      }
      hash = await sendManager(
        "prepareRound",
        [
          hydrateRoundSettings(job.payload.settings),
          job.payload.tickers,
        ],
        rememberHash,
      );
    } else {
      throw new Error(`Unsupported keeper job ${job.job_type}`);
    }
    await pool.query(
      `UPDATE keeper_jobs SET state='confirmed',transaction_hash=$2,
       updated_at=now() WHERE id=$1`,
      [job.id, hash],
    );
    if (job.job_type === "prepare" && job.payload.roundId) {
      const roundAddress = await client.readContract({
        address: manager,
        abi: roundManagerAbi,
        functionName: "preparedRound",
      });
      await pool.query(
        `INSERT INTO rounds(chain_id,round_id,contract_address,state,roster)
         VALUES($1,$2,$3,'prepared',$4)
         ON CONFLICT(chain_id,round_id) DO UPDATE SET
           contract_address=excluded.contract_address,roster=excluded.roster`,
        [
          manifest.chainId,
          job.payload.roundId,
          roundAddress,
          JSON.stringify(job.payload.roster ?? []),
        ],
      );
    }
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    if (activeJobId) {
      await pool
        .query(
          `UPDATE keeper_jobs SET state='failed',last_error=$2,updated_at=now()
           WHERE id=$1 AND transaction_hash IS NULL`,
          [activeJobId, message],
        )
        .catch(() => undefined);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function run() {
  const lock = await pool.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [lockId.toString()],
  );
  if (!lock.rows[0]?.locked)
    throw new Error("Another keeper owns the chain lock");
  for (;;) {
    try {
      await finalizeIfNeeded();
      await cancelForReportOutage();
      await prepareIfNeeded();
      await processJob();
      const balance = wallet.account
        ? await client.getBalance({ address: wallet.account.address })
        : 0n;
      await heartbeat("keeper", manifest.chainId, "ok", {
        address: wallet.account?.address,
        nativeBalanceWei: balance.toString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await heartbeat("keeper", manifest.chainId, "error", { message }).catch(
        () => undefined,
      );
      process.stderr.write(`${new Date().toISOString()} ${message}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

await run();
