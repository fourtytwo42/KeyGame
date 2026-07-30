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
