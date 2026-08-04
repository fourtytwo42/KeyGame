import { readDexObservation } from "../services/dex-observation";
import {
  pinnedDexMarkets,
  QUOTE_NOTIONAL_USDG,
} from "../src/lib/game/dex-config";

const targetBandBps = 5;

const results = [];
for (const market of pinnedDexMarkets) {
  const observation = await readDexObservation(market);
  const observedImpactBps = Math.max(
    observation.buyImpactBps,
    observation.sellImpactBps,
  );
  const estimatedCapitalUsd =
    Number.isFinite(observedImpactBps) && observedImpactBps > 0
      ? (QUOTE_NOTIONAL_USDG * targetBandBps) / observedImpactBps
      : Number.POSITIVE_INFINITY;
  const feeRate = market.feeTier / 1_000_000;
  const estimatedRoundTripCostUsd =
    estimatedCapitalUsd * (feeRate * 2 + targetBandBps / 10_000);
  results.push({
    symbol: market.symbol,
    pool: market.pool,
    safe: observation.safe,
    twapWindowSeconds: 600,
    targetBandBps,
    observedThousandDollarImpactBps: observedImpactBps,
    estimatedCapitalUsd,
    estimatedRoundTripCostUsd,
    crownIntegrity: observation.safe ? "screened" : "exclude",
    caveat:
      "Crown-integrity estimate only. DEX movement cannot change any v3 financial allocation.",
  });
}

process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      purpose: "closing-print-crown-integrity",
      financialPayoutExposureUsd: 0,
      results,
      releaseBlocked: results.some((result) => !result.safe),
    },
    null,
    2,
  )}\n`,
);
