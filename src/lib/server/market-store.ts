import "server-only";
import type { ScreeningAsset } from "@/lib/game/types";
import { database } from "./db";

type MarketRow = {
  symbol: string;
  name: string;
  canonical_address: string | null;
  testnet_mock_address: string | null;
  market_id: string | null;
  pool_address: string | null;
  fee_tier: number | null;
  twap_window_seconds: number | null;
  source_chain_id: number | null;
  pool_usdg_depth: string | null;
  buy_impact_bps: string | null;
  sell_impact_bps: string | null;
  spot_twap_deviation_bps: string | null;
  dex_safe: boolean;
  dex_safety_reasons: string[];
  active: boolean;
  halted: boolean;
  current_multiplier: string;
  daily_volume: string;
  quote_generated_at: Date | null;
};

type SampleRow = {
  symbol: string;
  sampled_at: Date;
  adjusted_mid: string;
};

export async function loadScreeningAssets(): Promise<ScreeningAsset[]> {
  const [assets, samples] = await Promise.all([
    database.query<MarketRow>(
      `SELECT symbol,name,canonical_address,testnet_mock_address,market_id,
              pool_address,fee_tier,twap_window_seconds,source_chain_id,
              pool_usdg_depth,buy_impact_bps,sell_impact_bps,
              spot_twap_deviation_bps,dex_safe,dex_safety_reasons,
              active,halted,current_multiplier,daily_volume,quote_generated_at
       FROM market_assets ORDER BY symbol`,
    ),
    database.query<SampleRow>(
      `SELECT symbol,sampled_at,adjusted_mid
       FROM market_samples
       WHERE sampled_at >= now() - interval '30 minutes'
         AND source='uniswap-v3-twap'
       ORDER BY symbol,sampled_at`,
    ),
  ]);
  const bySymbol = new Map<string, SampleRow[]>();
  for (const sample of samples.rows) {
    const list = bySymbol.get(sample.symbol) ?? [];
    list.push(sample);
    bySymbol.set(sample.symbol, list);
  }
  return assets.rows
    .filter((asset) => asset.testnet_mock_address || asset.canonical_address)
    .map((asset) => ({
      ticker: asset.symbol,
      name: asset.name,
      tokenAddress: (asset.testnet_mock_address ??
        asset.canonical_address) as `0x${string}`,
      canonicalAddress: asset.canonical_address as `0x${string}` | undefined,
      testnetMockAddress: asset.testnet_mock_address as
        `0x${string}` | undefined,
      marketId: (asset.market_id || undefined) as `0x${string}` | undefined,
      dexMarket:
        asset.market_id &&
        asset.pool_address &&
        asset.canonical_address &&
        asset.fee_tier
          ? {
              marketId: asset.market_id as `0x${string}`,
              poolAddress: asset.pool_address as `0x${string}`,
              stockTokenAddress: asset.canonical_address as `0x${string}`,
              quoteTokenAddress: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
              factoryAddress: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
              feeTier: asset.fee_tier,
              sourceChainId: asset.source_chain_id ?? 4663,
              twap: {
                seconds: 600,
                requiredHistorySeconds: 1800,
              },
              safety: {
                eligible: asset.dex_safe,
                usdgDepth: Number(asset.pool_usdg_depth ?? 0),
                buyImpactBps: Number(asset.buy_impact_bps ?? 0),
                sellImpactBps: Number(asset.sell_impact_bps ?? 0),
                spotTwapDeviationBps: Number(
                  asset.spot_twap_deviation_bps ?? 0,
                ),
                sampleCount: (bySymbol.get(asset.symbol) ?? []).length,
                reasons: asset.dex_safety_reasons ?? [],
              },
            }
          : undefined,
      active: asset.active,
      halted: asset.halted,
      canonical: Boolean(asset.canonical_address),
      dailyVolume: Number(asset.daily_volume),
      currentMultiplier: Number(asset.current_multiplier),
      quoteGeneratedAt: asset.quote_generated_at
        ? Math.floor(asset.quote_generated_at.getTime() / 1000)
        : undefined,
      mockOnly: Boolean(asset.testnet_mock_address),
      samples: (bySymbol.get(asset.symbol) ?? []).map((sample) => ({
        timestamp: Math.floor(sample.sampled_at.getTime() / 1000),
        price: Number(sample.adjusted_mid),
      })),
    }));
}
