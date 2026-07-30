import { readDexObservation } from "../services/dex-observation";
import {
  pinnedDexMarkets,
  QUOTE_NOTIONAL_USDG,
} from "../src/lib/game/dex-config";

const maximumPotUsd = Number(process.env.MAXIMUM_REVIEWED_POT_USD || 100);
const affectedPoolUsd = maximumPotUsd * 0.3;
const requiredAttackCostUsd = affectedPoolUsd * 10;
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
    requiredAttackCostUsd,
    passesTenTimesPayout:
      observation.safe && estimatedRoundTripCostUsd >= requiredAttackCostUsd,
    caveat:
      "Screening estimate only. A forked sequential-swap model and independent economic review remain required.",
  });
}

process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      maximumPotUsd,
      affectedClosingPrintPoolUsd: affectedPoolUsd,
      requiredAttackCostUsd,
      results,
      releaseBlocked: results.some((result) => !result.passesTenTimesPayout),
    },
    null,
    2,
  )}\n`,
);
