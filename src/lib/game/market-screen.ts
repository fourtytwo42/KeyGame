import type { RosterSnapshot, ScreeningAsset } from "./types";

export const EXPECTED_SAMPLES = 120;
export const MIN_COMPLETE_SAMPLES = 100;

export function realizedMovementBps(samples: ScreeningAsset["samples"]) {
  let movement = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1].price;
    const current = samples[index].price;
    if (previous > 0 && current > 0) {
      movement += Math.abs(((current - previous) * 10_000) / previous);
    }
  }
  return movement;
}

const baseEligible = (asset: ScreeningAsset) =>
  asset.active && asset.canonical && !asset.halted;

export function screenRoster(
  assets: ScreeningAsset[],
  screenedAt = Math.floor(Date.now() / 1000),
): RosterSnapshot {
  const verified = assets
    .filter(
      (asset) =>
        baseEligible(asset) &&
        Boolean(asset.marketId) &&
        Boolean(asset.dexMarket?.safety.eligible) &&
        asset.samples.length >= MIN_COMPLETE_SAMPLES,
    )
    .sort((left, right) => {
      const movement =
        realizedMovementBps(right.samples) - realizedMovementBps(left.samples);
      if (movement !== 0) return movement;
      if (right.dailyVolume !== left.dailyVolume) {
        return right.dailyVolume - left.dailyVolume;
      }
      return left.ticker.localeCompare(right.ticker);
    });

  if (verified.length >= 4) {
    return {
      mode: "DEX",
      label: "HEAT CHECK",
      selected: verified.slice(0, 4),
      delayed: false,
      screenedAt,
    };
  }

  const fallback = assets
    .filter(baseEligible)
    .sort(
      (left, right) =>
        right.dailyVolume - left.dailyVolume ||
        left.ticker.localeCompare(right.ticker),
    );
  if (fallback.length >= 4) {
    return {
      mode: "FLAT",
      label: "VOLUME CHECK",
      selected: fallback.slice(0, 4),
      delayed: false,
      screenedAt,
      reason: "Fewer than four safe, complete direct DEX markets.",
    };
  }

  return {
    mode: "FLAT",
    label: "VOLUME CHECK",
    selected: [],
    delayed: true,
    screenedAt,
    reason: "Fewer than four active, canonical, non-halted assets.",
  };
}

const MARKET_SAFETY_MAX_AGE = 45;
const METADATA_MAX_AGE = 300;
const SAMPLE_MAX_AGE = 30;
export const MIN_ACTIVATION_USDG_DEPTH = 10_000;

export const stockPotActivationExclusionReasons = (
  asset: ScreeningAsset,
  screenedAt: number,
) => {
  const reasons: string[] = [];
  if (!asset.canonical) reasons.push("not-canonical");
  if (!asset.active) reasons.push("inactive");
  if (asset.halted) reasons.push("halted");
  if (!asset.marketId || !asset.dexMarket)
    reasons.push("no-approved-direct-pool");
  if (asset.dexMarket && !asset.dexMarket.safety.eligible) {
    reasons.push(...asset.dexMarket.safety.reasons);
  }
  if (
    asset.dexMarket &&
    asset.dexMarket.safety.usdgDepth < MIN_ACTIVATION_USDG_DEPTH
  ) {
    reasons.push("below-10000-usdg-activation-depth");
  }
  if (asset.samples.length < MIN_COMPLETE_SAMPLES) {
    reasons.push("insufficient-30-minute-samples");
  }
  if (
    !asset.marketSafetyObservedAt ||
    asset.marketSafetyObservedAt > screenedAt + 5 ||
    screenedAt - asset.marketSafetyObservedAt > MARKET_SAFETY_MAX_AGE
  ) {
    reasons.push("stale-market-safety");
  }
  if (
    !asset.metadataCheckedAt ||
    asset.metadataCheckedAt > screenedAt + 5 ||
    screenedAt - asset.metadataCheckedAt > METADATA_MAX_AGE
  ) {
    reasons.push("stale-asset-metadata");
  }
  const latestSample = asset.samples.at(-1)?.timestamp;
  if (
    !latestSample ||
    latestSample > screenedAt + 5 ||
    screenedAt - latestSample > SAMPLE_MAX_AGE
  ) {
    reasons.push("stale-market-samples");
  }
  return [...new Set(reasons)];
};

/// V4 cannot place value through an unsafe fallback market. It delays the next
/// prepared round until four catalog assets satisfy every execution gate.
export function screenStockPotRoster(
  assets: ScreeningAsset[],
  catalogVersion?: `0x${string}`,
  screenedAt = Math.floor(Date.now() / 1000),
): RosterSnapshot {
  const ranked = assets
    .filter(
      (asset) =>
        stockPotActivationExclusionReasons(asset, screenedAt).length === 0,
    )
    .sort((left, right) => {
      const activity =
        (right.recentTradingActivity ?? 0) - (left.recentTradingActivity ?? 0);
      if (activity !== 0) return activity;
      if (right.dailyVolume !== left.dailyVolume) {
        return right.dailyVolume - left.dailyVolume;
      }
      return left.ticker.localeCompare(right.ticker);
    });
  const exclusions = assets
    .map((asset) => ({
      ticker: asset.ticker,
      reasons: stockPotActivationExclusionReasons(asset, screenedAt),
    }))
    .filter((asset) => asset.reasons.length > 0);
  if (ranked.length < 4) {
    return {
      mode: "DEX",
      label: "HEAT CHECK",
      selected: [],
      delayed: true,
      screenedAt,
      catalogVersion,
      approvedCatalogSize: assets.length,
      exclusions,
      reason: "Fewer than four approved Stock Token markets are safe.",
    };
  }
  return {
    mode: "DEX",
    label: "HEAT CHECK",
    selected: ranked.slice(0, 4),
    delayed: false,
    screenedAt,
    catalogVersion,
    approvedCatalogSize: assets.length,
    exclusions,
  };
}
