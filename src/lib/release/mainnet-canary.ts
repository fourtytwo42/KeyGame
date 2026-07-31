import { getAddress, parseUnits, type Address } from "viem";
import type { MainnetReleaseAuthorization } from "./mainnet-v4";

export type CanaryContributionPair = {
  deployerUsd: number;
  playerUsd: number;
};

export const MAINNET_CANARY_ROUNDS = 10;
export const MAINNET_CANARY_DURATION_MS = 24 * 60 * 60 * 1_000;
export const MAINNET_CANARY_BUDGET_RAW = parseUnits("100", 6);
export const CANARY_CONTRIBUTIONS: readonly CanaryContributionPair[] = [
  { deployerUsd: 1, playerUsd: 2 },
  { deployerUsd: 2, playerUsd: 5 },
  { deployerUsd: 5, playerUsd: 10 },
  { deployerUsd: 10, playerUsd: 1 },
  { deployerUsd: 1, playerUsd: 2 },
  { deployerUsd: 2, playerUsd: 5 },
  { deployerUsd: 5, playerUsd: 10 },
  { deployerUsd: 10, playerUsd: 1 },
  { deployerUsd: 1, playerUsd: 2 },
  { deployerUsd: 2, playerUsd: 5 },
] as const;

export function plannedCanarySpendRaw() {
  return CANARY_CONTRIBUTIONS.reduce(
    (total, pair) =>
      total +
      parseUnits(String(pair.deployerUsd), 6) +
      parseUnits(String(pair.playerUsd), 6),
    0n,
  );
}

export function canaryRoundSchedule(startedAtMs: number) {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    throw new Error("Canary start time is invalid.");
  }
  const interval = MAINNET_CANARY_DURATION_MS / MAINNET_CANARY_ROUNDS;
  return CANARY_CONTRIBUTIONS.map((contributions, index) => ({
    ordinal: index + 1,
    plannedAtMs: Math.floor(startedAtMs + interval * index),
    contributions,
  }));
}

export function validateCanaryActors(input: {
  deployer: Address;
  player: Address;
  roles: Array<Address | null | undefined>;
}) {
  const deployer = getAddress(input.deployer);
  const player = getAddress(input.player);
  if (deployer === player) {
    throw new Error("Canary player must differ from the privileged deployer.");
  }
  const normalizedRoles = input.roles
    .filter((role): role is Address => Boolean(role))
    .map((role) => getAddress(role));
  const conflictingRole = normalizedRoles.find((role) => role !== deployer);
  if (conflictingRole) {
    throw new Error("Every privileged role must resolve to the deployer.");
  }
  if (normalizedRoles.includes(player)) {
    throw new Error("Canary player must not hold a privileged role.");
  }
  return { deployer, player };
}

export function assertCanaryScope(input: {
  authorization: MainnetReleaseAuthorization;
  settledRounds: number;
  spentRaw: bigint;
  startedAtMs: number;
  nowMs?: number;
}) {
  if (input.authorization.walletUatDisposition !== "SKIPPED_BY_OPERATOR") {
    throw new Error("Canary requires the explicit external-wallet UAT waiver.");
  }
  if (input.settledRounds < 0 || input.settledRounds > MAINNET_CANARY_ROUNDS) {
    throw new Error("Canary settled-round limit exceeded.");
  }
  if (input.spentRaw < 0n || input.spentRaw > MAINNET_CANARY_BUDGET_RAW) {
    throw new Error("Canary USDG budget exceeded.");
  }
  const now = input.nowMs ?? Date.now();
  if (now > input.startedAtMs + MAINNET_CANARY_DURATION_MS) {
    throw new Error("Canary authorization window expired.");
  }
}

if (plannedCanarySpendRaw() > MAINNET_CANARY_BUDGET_RAW) {
  throw new Error("The compiled canary contribution plan exceeds 100 USDG.");
}
