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
  deploymentKeyFor,
  loadManifest,
  pool,
  publicClientFor,
  walletClientFor,
} from "./common";

const manifest = await loadManifest();
const deploymentKey = deploymentKeyFor(manifest);
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
    market_id: Hex | null;
    pool_address: Address | null;
    fee_tier: number | null;
    pool_usdg_depth: string | null;
    buy_impact_bps: string | null;
    sell_impact_bps: string | null;
    spot_twap_deviation_bps: string | null;
    dex_safe: boolean;
    dex_safety_reasons: string[];
    active: boolean;
    halted: boolean;
    daily_volume: string;
    current_multiplier: string;
  }>(
    `SELECT symbol,name,canonical_address,testnet_mock_address,market_id,
            pool_address,fee_tier,pool_usdg_depth,buy_impact_bps,
            sell_impact_bps,spot_twap_deviation_bps,dex_safe,dex_safety_reasons,
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
       AND source='uniswap-v3-twap'
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
    marketId: asset.market_id ?? undefined,
    dexMarket:
      asset.market_id && asset.pool_address && asset.fee_tier
        ? {
            marketId: asset.market_id,
            poolAddress: asset.pool_address,
            stockTokenAddress: asset.canonical_address,
            quoteTokenAddress: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
            factoryAddress: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
            feeTier: asset.fee_tier,
            sourceChainId: 4663,
            twap: { seconds: 600, requiredHistorySeconds: 1800 },
            safety: {
              eligible: asset.dex_safe,
              usdgDepth: Number(asset.pool_usdg_depth ?? 0),
              buyImpactBps: Number(asset.buy_impact_bps ?? 0),
              sellImpactBps: Number(asset.sell_impact_bps ?? 0),
              spotTwapDeviationBps: Number(asset.spot_twap_deviation_bps ?? 0),
              sampleCount: bySymbol.get(asset.symbol)?.length ?? 0,
              reasons: asset.dex_safety_reasons ?? [],
            },
          }
        : undefined,
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
    maxReportAge: 15,
    marketThresholdBps: 5,
    greenMultiplierBps: 12_500,
    flatMultiplierBps: 10_000,
    redMultiplierBps: 7_500,
    marketMode: roster.mode === "DEX" ? 1 : 0,
    producerPassRequired: false,
  };
  const tickers = roster.selected.map((asset) => ({
    symbol: stringToHex(asset.ticker, { size: 32 }),
    token: asset.testnetMockAddress ?? asset.tokenAddress,
    marketId: asset.marketId ?? zeroHash,
  })) as [
    { symbol: Hex; token: Address; marketId: Hex },
    { symbol: Hex; token: Address; marketId: Hex },
    { symbol: Hex; token: Address; marketId: Hex },
    { symbol: Hex; token: Address; marketId: Hex },
  ];
  await pool.query(
    `INSERT INTO keeper_jobs(deployment_key,chain_id,idempotency_key,job_type,payload)
     VALUES($1,$2,$3,'prepare',$4)
     ON CONFLICT(deployment_key,idempotency_key) DO NOTHING`,
    [
      deploymentKey,
      manifest.chainId,
      `prepare:${manager.toLowerCase()}:${settings.roundId}`,
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
      `INSERT INTO keeper_jobs(deployment_key,chain_id,idempotency_key,job_type,payload)
       VALUES($1,$2,$3,'finalize',$4)
       ON CONFLICT(deployment_key,idempotency_key) DO NOTHING`,
      [
        deploymentKey,
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
     WHERE chain_id=$1 AND service='dex-market'`,
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
      `INSERT INTO keeper_jobs(deployment_key,chain_id,idempotency_key,job_type,payload)
       VALUES($1,$2,$3,'cancel',$4)
       ON CONFLICT(deployment_key,idempotency_key) DO NOTHING`,
      [
        deploymentKey,
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
       WHERE deployment_key=$1 AND state IN ('pending','broadcasting') ORDER BY id
       FOR UPDATE SKIP LOCKED LIMIT 1`,
      [deploymentKey],
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
        [hydrateRoundSettings(job.payload.settings), job.payload.tickers],
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
        `INSERT INTO rounds(deployment_key,chain_id,round_id,contract_address,state,roster)
         VALUES($1,$2,$3,$4,'prepared',$5)
         ON CONFLICT(deployment_key,round_id) DO UPDATE SET
           contract_address=excluded.contract_address,roster=excluded.roster`,
        [
          deploymentKey,
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
