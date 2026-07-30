import "server-only";
import type { ScreeningAsset } from "@/lib/game/types";
import { database } from "./db";

type MarketRow = {
  symbol: string;
  name: string;
  canonical_address: string | null;
  testnet_mock_address: string | null;
  feed_id: string | null;
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
      `SELECT symbol,name,canonical_address,testnet_mock_address,feed_id,
              active,halted,current_multiplier,daily_volume,quote_generated_at
       FROM market_assets ORDER BY symbol`,
    ),
    database.query<SampleRow>(
      `SELECT symbol,sampled_at,adjusted_mid
       FROM market_samples
       WHERE sampled_at >= now() - interval '30 minutes'
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
      canonicalAddress: asset.canonical_address as
        | `0x${string}`
        | undefined,
      testnetMockAddress: asset.testnet_mock_address as
        | `0x${string}`
        | undefined,
      feedId: (asset.feed_id || undefined) as `0x${string}` | undefined,
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
