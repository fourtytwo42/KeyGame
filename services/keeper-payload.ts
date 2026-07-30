export type PersistedRoundSettings = Record<
  string,
  string | number | boolean
>;

export function persistRoundSettings<
  T extends {
    roundId: bigint;
    claimPrice: bigint;
  },
>(settings: T): PersistedRoundSettings {
  return {
    ...settings,
    roundId: settings.roundId.toString(),
    claimPrice: settings.claimPrice.toString(),
  };
}

export function hydrateRoundSettings(settings: PersistedRoundSettings) {
  return {
    ...settings,
    roundId: BigInt(String(settings.roundId)),
    claimPrice: BigInt(String(settings.claimPrice)),
  };
}
