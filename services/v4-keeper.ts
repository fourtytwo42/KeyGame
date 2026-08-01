import { createHash } from "node:crypto";
import {
  encodePacked,
  keccak256,
  stringToHex,
  toHex,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import { screenStockPotRoster } from "../src/lib/game/market-screen";
import type { ScreeningAsset } from "../src/lib/game/types";
import { smokeRoundLimitReached } from "../src/lib/release/testnet-v4";
import {
  lastBellV4Abi,
  roundManagerV4Abi,
  stockSwapAdapterAbi,
} from "../src/lib/web3/last-bell-abi";
import {
  deploymentKeyFor,
  heartbeat,
  loadManifest,
  pool,
  publicClientFor,
  walletClientFor,
} from "./common";
import { assertMainnetPromotionAllowsKeeper } from "./mainnet-promotion-guard";

const manifest = await loadManifest();
if (
  (manifest.chainId !== 46630 && manifest.chainId !== 4663) ||
  manifest.contractVersion !== "last-bell-v4-stock-pot" ||
  !manifest.contracts.swapAdapter
) {
  throw new Error("The production v4 keeper requires a v4 chain manifest.");
}
if (
  (manifest.chainId === 4663 && manifest.mockOnly) ||
  (manifest.chainId === 46630 && !manifest.mockOnly)
) {
  throw new Error("V4 keeper mock policy does not match the chain.");
}
await assertMainnetPromotionAllowsKeeper({
  chainId: manifest.chainId,
  sourceCommit: manifest.sourceCommit,
});

const deploymentKey = deploymentKeyFor(manifest);
const client = publicClientFor(manifest);
const wallet = await walletClientFor(manifest, "keeper");
const operator = wallet.account;
if (!operator) throw new Error("Keeper account unavailable.");
const manager = manifest.contracts.manager;
const adapter = manifest.contracts.swapAdapter;
const pollMs = Number(process.env.V4_KEEPER_POLL_MS || 1_000);
const smokeInitialRoundId =
  manifest.chainId === 46630
    ? BigInt(process.env.KEYGAME_TESTNET_SMOKE_INITIAL_ROUND_ID || "0")
    : undefined;
const smokeMaxSettledRounds =
  manifest.chainId === 46630
    ? Number(process.env.KEYGAME_TESTNET_SMOKE_MAX_SETTLED_ROUNDS || "0")
    : undefined;
if (
  manifest.chainId === 46630 &&
  (smokeInitialRoundId === 0n || smokeMaxSettledRounds !== 2)
) {
  throw new Error(
    "Testnet v4 keeper requires an initial round and an exact two-round smoke limit.",
  );
}
const manifestHash = createHash("sha256")
  .update(JSON.stringify(manifest))
  .digest("hex");

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

async function loadRoster() {
  const [assets, samples] = await Promise.all([
    pool.query<{
      symbol: string;
      name: string;
      canonical_address: Address | null;
      testnet_mock_address: Address | null;
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
      dex_observed_at: Date | null;
      metadata_checked_at: Date;
    }>(
      `SELECT symbol,name,canonical_address,testnet_mock_address,market_id,
              pool_address,fee_tier,pool_usdg_depth,buy_impact_bps,
              sell_impact_bps,spot_twap_deviation_bps,dex_safe,
              dex_safety_reasons,active,halted,daily_volume,
              dex_observed_at,metadata_checked_at
       FROM market_assets ORDER BY symbol`,
    ),
    pool.query<{
      symbol: string;
      sampled_at: Date;
      adjusted_mid: string;
      daily_volume: string;
    }>(
      `SELECT symbol,sampled_at,adjusted_mid,daily_volume FROM market_samples
       WHERE sampled_at >= now() - interval '30 minutes'
         AND source='uniswap-v3-twap'
       ORDER BY symbol,sampled_at`,
    ),
  ]);
  const bySymbol = new Map<
    string,
    Array<{ timestamp: number; price: number; dailyVolume: number }>
  >();
  for (const sample of samples.rows) {
    const values = bySymbol.get(sample.symbol) ?? [];
    values.push({
      timestamp: Math.floor(sample.sampled_at.getTime() / 1000),
      price: Number(sample.adjusted_mid),
      dailyVolume: Number(sample.daily_volume),
    });
    bySymbol.set(sample.symbol, values);
  }
  const screening: ScreeningAsset[] = assets.rows
    .filter((asset) =>
      manifest.mockOnly
        ? Boolean(asset.testnet_mock_address)
        : Boolean(asset.canonical_address),
    )
    .map((asset) => ({
      ticker: asset.symbol,
      name: asset.name,
      tokenAddress: (manifest.mockOnly
        ? asset.testnet_mock_address
        : asset.canonical_address) as Address,
      canonicalAddress: asset.canonical_address ?? undefined,
      testnetMockAddress: asset.testnet_mock_address ?? undefined,
      marketId: asset.market_id ?? undefined,
      dexMarket:
        asset.market_id &&
        asset.pool_address &&
        asset.canonical_address &&
        asset.fee_tier
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
                spotTwapDeviationBps: Number(
                  asset.spot_twap_deviation_bps ?? 0,
                ),
                sampleCount: bySymbol.get(asset.symbol)?.length ?? 0,
                reasons: asset.dex_safety_reasons ?? [],
              },
            }
          : undefined,
      active: asset.active,
      halted: asset.halted,
      canonical: Boolean(asset.canonical_address),
      dailyVolume: Number(asset.daily_volume),
      recentTradingActivity: (() => {
        const activitySamples = bySymbol.get(asset.symbol) ?? [];
        if (activitySamples.length < 2) return 0;
        const first = activitySamples[0].dailyVolume;
        const last = activitySamples.at(-1)?.dailyVolume ?? first;
        return Math.max(0, last - first);
      })(),
      marketSafetyObservedAt: asset.dex_observed_at
        ? Math.floor(asset.dex_observed_at.getTime() / 1000)
        : undefined,
      metadataCheckedAt: Math.floor(asset.metadata_checked_at.getTime() / 1000),
      mockOnly: manifest.mockOnly,
      samples: bySymbol.get(asset.symbol) ?? [],
    }));
  const catalogVersion = keccak256(
    toHex(
      JSON.stringify(
        screening.map((asset) => ({
          ticker: asset.ticker,
          canonical: asset.canonicalAddress,
          pool: asset.dexMarket?.poolAddress,
          fee: asset.dexMarket?.feeTier,
        })),
      ),
    ),
  );
  return screenStockPotRoster(screening, catalogVersion);
}

async function persistRoster(
  roundId: bigint,
  roster: ReturnType<typeof screenStockPotRoster>,
) {
  if (!roster.catalogVersion) throw new Error("Roster has no catalog version.");
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      `UPDATE market_catalog_versions SET retired_at=now()
       WHERE deployment_key=$1 AND retired_at IS NULL
         AND catalog_version<>$2`,
      [deploymentKey, roster.catalogVersion],
    );
    await connection.query(
      `INSERT INTO market_catalog_versions(
         deployment_key,catalog_version,manifest_hash,assets)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(deployment_key,catalog_version) DO UPDATE SET
         manifest_hash=excluded.manifest_hash,assets=excluded.assets,
         activated_at=now(),retired_at=NULL`,
      [
        deploymentKey,
        roster.catalogVersion,
        manifestHash,
        JSON.stringify(roster.selected),
      ],
    );
    await connection.query(
      `INSERT INTO round_roster_evidence(
         deployment_key,round_id,catalog_version,screened_at,evidence)
       VALUES($1,$2,$3,to_timestamp($4),$5)
       ON CONFLICT(deployment_key,round_id) DO UPDATE SET
         catalog_version=excluded.catalog_version,
         screened_at=excluded.screened_at,evidence=excluded.evidence`,
      [
        deploymentKey,
        roundId.toString(),
        roster.catalogVersion,
        roster.screenedAt,
        JSON.stringify(roster),
      ],
    );
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

async function enqueue(
  type: "v4-finalize" | "v4-prepare" | "v4-activate",
  key: string,
  payload: KeeperPayload,
) {
  await pool.query(
    `INSERT INTO keeper_jobs(
       deployment_key,chain_id,idempotency_key,job_type,payload)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(deployment_key,idempotency_key) DO NOTHING`,
    [deploymentKey, manifest.chainId, key, type, JSON.stringify(payload)],
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
  if (
    smokeInitialRoundId !== undefined &&
    smokeMaxSettledRounds !== undefined &&
    smokeRoundLimitReached(latest, smokeInitialRoundId, smokeMaxSettledRounds)
  ) {
    await heartbeat("v4-keeper", manifest.chainId, "smoke-complete", {
      deploymentKey,
      latestRoundId: latest.toString(),
      maxSettledRounds: smokeMaxSettledRounds,
    });
    return;
  }
  const roster = await loadRoster();
  if (roster.delayed || roster.selected.length !== 4) {
    await heartbeat("v4-keeper", manifest.chainId, "waiting-for-safe-roster", {
      deploymentKey,
      reason: roster.reason,
      exclusions: roster.exclusions,
    });
    return;
  }
  const nextId = latest + 1n;
  await persistRoster(nextId, roster);
  const tickers = roster.selected.map((asset) => ({
    symbol: stringToHex(asset.ticker, { size: 32 }),
    assetId: keccak256(
      encodePacked(
        ["string", "address"],
        ["ROBINHOOD_CANONICAL", asset.canonicalAddress!],
      ),
    ),
    token: asset.tokenAddress,
  })) as [
    { symbol: Hex; assetId: Hex; token: Address },
    { symbol: Hex; assetId: Hex; token: Address },
    { symbol: Hex; assetId: Hex; token: Address },
    { symbol: Hex; assetId: Hex; token: Address },
  ];
  await enqueue("v4-prepare", `v4:prepare:${manager}:${nextId}`, {
    roundId: nextId.toString(),
    settings: {
      roundId: nextId.toString(),
      startDuration: "45",
      extensionDuration: "2",
      rugDuration: "10",
      hardCapDuration: "180",
      heatTarget: "4000000000",
      producerPassRequired: false,
    },
    tickers,
  });
}

async function activationProtection(prepared: Address) {
  const indexes = [0n, 1n, 2n, 3n] as const;
  const [oldTokens, amounts, configs, block] = await Promise.all([
    Promise.all(
      indexes.map((index) =>
        client.readContract({
          address: manager,
          abi: roundManagerV4Abi,
          functionName: "seedTokens",
          args: [index],
        }),
      ),
    ),
    Promise.all(
      indexes.map((index) =>
        client.readContract({
          address: manager,
          abi: roundManagerV4Abi,
          functionName: "seedAmounts",
          args: [index],
        }),
      ),
    ),
    Promise.all(
      indexes.map((index) =>
        client.readContract({
          address: prepared,
          abi: lastBellV4Abi,
          functionName: "tickerConfigs",
          args: [index],
        }),
      ),
    ),
    client.getBlock({ blockTag: "pending" }),
  ]);
  const empty = amounts.every((amount) => amount === 0n);
  const same = oldTokens.every(
    (token, index) => token.toLowerCase() === configs[index][2].toLowerCase(),
  );
  if (empty || same) {
    return {
      sellMinimums: [0n, 0n, 0n, 0n] as const,
      buyMinimums: [0n, 0n, 0n, 0n] as const,
      deadline: BigInt(block.timestamp + 30n),
    };
  }
  const sellQuotes = await Promise.all(
    indexes.map((index) =>
      amounts[Number(index)] === 0n
        ? Promise.resolve(0n)
        : client.readContract({
            address: adapter,
            abi: stockSwapAdapterAbi,
            functionName: "quoteStockForUsdg",
            args: [oldTokens[Number(index)], amounts[Number(index)]],
          }),
    ),
  );
  const proceeds = sellQuotes.reduce((total, value) => total + value, 0n);
  const each = proceeds / 4n;
  const buyQuotes = await Promise.all(
    indexes.map((index) =>
      client.readContract({
        address: adapter,
        abi: stockSwapAdapterAbi,
        functionName: "quoteUsdgForStock",
        args: [
          configs[Number(index)][2],
          index === 3n ? proceeds - each * 3n : each,
        ],
      }),
    ),
  );
  return {
    sellMinimums: sellQuotes.map((quote) => (quote * 9_800n) / 10_000n) as [
      bigint,
      bigint,
      bigint,
      bigint,
    ],
    buyMinimums: buyQuotes.map((quote) => (quote * 9_800n) / 10_000n) as [
      bigint,
      bigint,
      bigint,
      bigint,
    ],
    deadline: BigInt(block.timestamp + 30n),
  };
}

async function reconcileBroadcast(job: { id: string; hash: Hex }) {
  const receipt = await client
    .getTransactionReceipt({ hash: job.hash })
    .catch(() => null);
  if (!receipt) return;
  await pool.query(
    `UPDATE keeper_jobs SET state=$2,last_error=$3,updated_at=now()
     WHERE id=$1`,
    [
      job.id,
      receipt.status === "success" ? "confirmed" : "failed",
      receipt.status === "success" ? null : "Transaction reverted",
    ],
  );
}

async function processJob() {
  const connection = await pool.connect();
  let job:
    | {
        id: string;
        job_type: string;
        transaction_hash: Hex | null;
        attempts: number;
        payload: KeeperPayload;
      }
    | undefined;
  try {
    await connection.query("BEGIN");
    const result = await connection.query(
      `SELECT id,job_type,transaction_hash,attempts,payload FROM keeper_jobs
       WHERE deployment_key=$1 AND job_type LIKE 'v4-%'
         AND (
           state='broadcasting'
           OR (state='pending' AND updated_at <= now() - interval '2 seconds')
         )
       ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`,
      [deploymentKey],
    );
    job = result.rows[0];
    if (!job) {
      await connection.query("COMMIT");
      return;
    }
    if (job.transaction_hash) {
      await connection.query("COMMIT");
      await reconcileBroadcast({ id: job.id, hash: job.transaction_hash });
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
      if (!job.payload.round) throw new Error("Activate job has no round.");
      const protection = await activationProtection(job.payload.round);
      request = await client.simulateContract({
        account: operator,
        address: manager,
        abi: roundManagerV4Abi,
        functionName: "activatePrepared",
        args: [
          protection.sellMinimums,
          protection.buyMinimums,
          protection.deadline,
        ],
      });
    } else {
      if (!job.payload.settings || job.payload.tickers?.length !== 4) {
        throw new Error("Malformed prepare job.");
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
    await reconcileBroadcast({ id: job.id, hash });
  } catch (error) {
    await pool.query(
      `UPDATE keeper_jobs SET
         state=CASE WHEN attempts >= 10 THEN 'failed' ELSE 'pending' END,
         last_error=$2,updated_at=now()
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
    await heartbeat("v4-keeper", manifest.chainId, "ok", { deploymentKey });
  } catch (error) {
    await heartbeat("v4-keeper", manifest.chainId, "error", {
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
