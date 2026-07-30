import { readFile } from "node:fs/promises";
import path from "node:path";
import { heartbeat, pool } from "./common";
import {
  pinnedDexMarkets,
  pinnedMarketBySymbol,
  REQUIRED_HISTORY_SECONDS,
  ROBINHOOD_MAINNET_CHAIN_ID,
  TWAP_WINDOW_SECONDS,
} from "../src/lib/game/dex-config";
import { mainnetDexClient, readDexObservation } from "./dex-observation";

type Catalog = {
  sourceGitCommit: string;
  sourceManifestSha256: string;
  disclosure: string;
  assets: Array<{
    symbol: string;
    name: string;
    mainnetAddress: string;
    testnetMockAddress: string;
  }>;
};

type RobinhoodAsset = {
  tokenSymbol: string;
  tokenName: string;
  currentMultiplier: string;
  pendingMultiplier?: string;
  pendingMultiplierEffectiveTime?: string;
  status: string;
  deployments: Array<{ chainId: number; contractAddress: string }>;
};

type RobinhoodQuote = {
  tokenSymbol: string;
  bid: string;
  ask: string;
  dailyTradingVolume: string;
  isTradingHalt: boolean;
  generatedAt: string;
};

const chainId = Number(process.env.KEYGAME_CHAIN_ID || 46630);
const intervalMs = Number(process.env.MARKET_SAMPLE_INTERVAL_MS || 15_000);
const apiBase =
  process.env.ROBINHOOD_STOCK_TOKEN_API_URL ?? "https://api.robinhood.com/rhj";

const catalog = JSON.parse(
  await readFile(
    path.join(process.cwd(), "config", "testnet-stock-token-mocks.json"),
    "utf8",
  ),
) as Catalog;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
    headers: { "user-agent": "KeyGame-MarketCollector/1.0" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
}

export async function collectOnce() {
  const assetsPayload = await fetchJson<{ assets: RobinhoodAsset[] }>(
    `${apiBase}/assets`,
  );
  const official = new Map(
    assetsPayload.assets.map((asset) => [asset.tokenSymbol, asset]),
  );
  const dexClient = mainnetDexClient();
  const observations = new Map(
    (
      await Promise.allSettled(
        pinnedDexMarkets.map((market) => readDexObservation(market, dexClient)),
      )
    )
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof readDexObservation>>
        > => result.status === "fulfilled",
      )
      .map((result) => [result.value.symbol, result.value]),
  );

  let collected = 0;
  for (const mapped of catalog.assets) {
    const asset = official.get(mapped.symbol);
    if (!asset) continue;
    const quotePayload = await fetchJson<{ quotes: RobinhoodQuote[] }>(
      `${apiBase}/prices/${encodeURIComponent(mapped.symbol)}`,
    );
    const quote = quotePayload.quotes[0];
    if (!quote) continue;
    const bid = Number(quote.bid);
    const ask = Number(quote.ask);
    const multiplier = Number(asset.currentMultiplier);
    if (
      !Number.isFinite(bid) ||
      !Number.isFinite(ask) ||
      !Number.isFinite(multiplier) ||
      bid <= 0 ||
      ask <= 0 ||
      multiplier <= 0
    )
      continue;
    const dex = observations.get(mapped.symbol);
    const pinned = pinnedMarketBySymbol.get(
      mapped.symbol as Parameters<typeof pinnedMarketBySymbol.get>[0],
    );
    const canonicalAddress =
      asset.deployments.find((deployment) => deployment.chainId === 4663)
        ?.contractAddress ?? mapped.mainnetAddress;
    const provenance = {
      catalogCommit: catalog.sourceGitCommit,
      catalogSha256: catalog.sourceManifestSha256,
      disclosure: catalog.disclosure,
    };
    await pool.query(
      `INSERT INTO market_assets(
         symbol,name,canonical_address,testnet_mock_address,feed_id,active,halted,
         current_multiplier,pending_multiplier,pending_multiplier_effective_at,
         daily_volume,last_bid,last_ask,quote_generated_at,metadata_checked_at,
         source_provenance,market_id,pool_address,fee_tier,twap_window_seconds,
         source_chain_id,pool_usdg_depth,buy_impact_bps,sell_impact_bps,
         spot_twap_deviation_bps,pool_liquidity,dex_safe,dex_safety_reasons,
         dex_observed_at)
       VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14,
         $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       ON CONFLICT(symbol) DO UPDATE SET
         name=excluded.name,canonical_address=excluded.canonical_address,
         testnet_mock_address=excluded.testnet_mock_address,
         feed_id=NULL,active=excluded.active,halted=excluded.halted,
         current_multiplier=excluded.current_multiplier,
         pending_multiplier=excluded.pending_multiplier,
         pending_multiplier_effective_at=excluded.pending_multiplier_effective_at,
         daily_volume=excluded.daily_volume,last_bid=excluded.last_bid,
         last_ask=excluded.last_ask,quote_generated_at=excluded.quote_generated_at,
         metadata_checked_at=now(),source_provenance=excluded.source_provenance,
         market_id=excluded.market_id,pool_address=excluded.pool_address,
         fee_tier=excluded.fee_tier,
         twap_window_seconds=excluded.twap_window_seconds,
         source_chain_id=excluded.source_chain_id,
         pool_usdg_depth=excluded.pool_usdg_depth,
         buy_impact_bps=excluded.buy_impact_bps,
         sell_impact_bps=excluded.sell_impact_bps,
         spot_twap_deviation_bps=excluded.spot_twap_deviation_bps,
         pool_liquidity=excluded.pool_liquidity,dex_safe=excluded.dex_safe,
         dex_safety_reasons=excluded.dex_safety_reasons,
         dex_observed_at=excluded.dex_observed_at`,
      [
        mapped.symbol,
        asset.tokenName || mapped.name,
        canonicalAddress,
        mapped.testnetMockAddress,
        asset.status === "ASSET_STATUS_ACTIVE",
        quote.isTradingHalt,
        multiplier,
        asset.pendingMultiplier || null,
        asset.pendingMultiplierEffectiveTime || null,
        quote.dailyTradingVolume || "0",
        bid,
        ask,
        quote.generatedAt,
        JSON.stringify(provenance),
        dex?.marketId ?? null,
        pinned?.pool ?? null,
        pinned?.feeTier ?? null,
        pinned ? TWAP_WINDOW_SECONDS : null,
        pinned ? ROBINHOOD_MAINNET_CHAIN_ID : null,
        dex?.usdgDepth ?? null,
        Number.isFinite(dex?.buyImpactBps) ? dex?.buyImpactBps : null,
        Number.isFinite(dex?.sellImpactBps) ? dex?.sellImpactBps : null,
        dex?.spotTwapDeviationBps ?? null,
        dex?.liquidity.toString() ?? null,
        Boolean(dex?.safe),
        JSON.stringify(
          dex?.reasons ??
            (pinned
              ? [
                  `${REQUIRED_HISTORY_SECONDS}-second DEX observation unavailable`,
                ]
              : ["No pinned direct Stock Token/USDG market"]),
        ),
        dex ? new Date(dex.observedAt * 1000) : null,
      ],
    );
    if (dex) {
      const sampledAt = new Date(dex.observedAt * 1000);
      sampledAt.setMilliseconds(0);
      await pool.query(
        `INSERT INTO market_samples(
           symbol,sampled_at,raw_mid,adjusted_mid,daily_volume,halted,source,
           twap_tick,source_block_number,source_block_hash)
         VALUES($1,$2,$3,$3,$4,$5,'uniswap-v3-twap',$6,$7,$8)
         ON CONFLICT(symbol,sampled_at) DO NOTHING`,
        [
          mapped.symbol,
          sampledAt,
          dex.price,
          quote.dailyTradingVolume || "0",
          quote.isTradingHalt,
          dex.twapTick,
          dex.sourceBlockNumber.toString(),
          dex.sourceBlockHash,
        ],
      );
    }
    collected += 1;
  }
  await pool.query(
    "DELETE FROM market_samples WHERE sampled_at < now() - interval '48 hours'",
  );
  await heartbeat("market-collector", chainId, "ok", { collected });
  return collected;
}

async function run() {
  for (;;) {
    const started = Date.now();
    try {
      const collected = await collectOnce();
      process.stdout.write(
        `${new Date().toISOString()} collected ${collected} assets\n`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await heartbeat("market-collector", chainId, "error", { message }).catch(
        () => undefined,
      );
      process.stderr.write(`${new Date().toISOString()} ${message}\n`);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1_000, intervalMs - (Date.now() - started))),
    );
  }
}

if (process.env.NODE_ENV !== "test") {
  if (process.env.MARKET_COLLECT_ONCE === "true") {
    const collected = await collectOnce();
    process.stdout.write(`collected ${collected} assets\n`);
    await pool.end();
  } else {
    await run();
  }
}
