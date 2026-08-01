import { getAddress, parseUnits, type Address } from "viem";

export type RehearsalContributionPair = {
  deployerUsd: number;
  playerUsd: number;
};

export type RehearsalRestartCheckpoint = {
  kind: "keeper" | "indexer";
  service: "v4-devnet-keeper" | "chain-indexer";
  afterSettledRounds: 4 | 7;
};

export const DEVNET_REHEARSAL_CHAIN_ID = 31_337;
export const DEVNET_REHEARSAL_ROUNDS = 10;
export const DEVNET_REHEARSAL_DURATION_MS = 60 * 60 * 1_000;
export const DEVNET_REHEARSAL_BUDGET_RAW = parseUnits("100", 6);

export function rehearsalGasLimit(estimatedGas: bigint) {
  if (estimatedGas <= 0n) throw new Error("Estimated gas must be positive.");
  return (estimatedGas * 125n + 99n) / 100n;
}
export const REHEARSAL_CONTRIBUTIONS: readonly RehearsalContributionPair[] = [
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

export function plannedRehearsalSpendRaw() {
  return REHEARSAL_CONTRIBUTIONS.reduce(
    (total, pair) =>
      total +
      parseUnits(String(pair.deployerUsd), 6) +
      parseUnits(String(pair.playerUsd), 6),
    0n,
  );
}

export function plannedRehearsalSpendByActorRaw() {
  return REHEARSAL_CONTRIBUTIONS.reduce(
    (totals, pair) => ({
      deployer: totals.deployer + parseUnits(String(pair.deployerUsd), 6),
      player: totals.player + parseUnits(String(pair.playerUsd), 6),
    }),
    { deployer: 0n, player: 0n },
  );
}

export function rehearsalRoundSchedule(startedAtMs: number) {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    throw new Error("Rehearsal start time is invalid.");
  }
  const interval = DEVNET_REHEARSAL_DURATION_MS / DEVNET_REHEARSAL_ROUNDS;
  return REHEARSAL_CONTRIBUTIONS.map((contributions, index) => ({
    ordinal: index + 1,
    plannedAtMs: Math.floor(startedAtMs + interval * index),
    contributions,
  }));
}

export function restartCheckpointsForSettledRounds(
  settledRounds: number,
): RehearsalRestartCheckpoint[] {
  const checkpoints: RehearsalRestartCheckpoint[] = [];
  if (settledRounds >= 4) {
    checkpoints.push({
      kind: "keeper",
      service: "v4-devnet-keeper",
      afterSettledRounds: 4,
    });
  }
  if (settledRounds >= 7) {
    checkpoints.push({
      kind: "indexer",
      service: "chain-indexer",
      afterSettledRounds: 7,
    });
  }
  return checkpoints;
}

export function validateRehearsalActors(input: {
  operator: Address;
  playerA: Address;
  playerB: Address;
  roles: Array<Address | null | undefined>;
}) {
  const operator = getAddress(input.operator);
  const playerA = getAddress(input.playerA);
  const playerB = getAddress(input.playerB);
  if (operator === playerA || operator === playerB || playerA === playerB) {
    throw new Error("Rehearsal actors must be three distinct addresses.");
  }
  const normalizedRoles = input.roles
    .filter((role): role is Address => Boolean(role))
    .map((role) => getAddress(role));
  const conflictingRole = normalizedRoles.find((role) => role !== operator);
  if (conflictingRole) {
    throw new Error("Every privileged role must resolve to the deployer.");
  }
  if (normalizedRoles.includes(playerA) || normalizedRoles.includes(playerB)) {
    throw new Error("Rehearsal players must not hold privileged roles.");
  }
  return { operator, playerA, playerB };
}

export function assertRehearsalScope(input: {
  chainId: number;
  settledRounds: number;
  spentRaw: bigint;
  startedAtMs: number;
  nowMs?: number;
}) {
  if (input.chainId !== DEVNET_REHEARSAL_CHAIN_ID) {
    throw new Error("Launch rehearsal is restricted to chain 31337.");
  }
  if (
    input.settledRounds < 0 ||
    input.settledRounds > DEVNET_REHEARSAL_ROUNDS
  ) {
    throw new Error("Rehearsal settled-round limit exceeded.");
  }
  if (input.spentRaw < 0n || input.spentRaw > DEVNET_REHEARSAL_BUDGET_RAW) {
    throw new Error("Rehearsal USDG budget exceeded.");
  }
  const now = input.nowMs ?? Date.now();
  if (now > input.startedAtMs + DEVNET_REHEARSAL_DURATION_MS) {
    throw new Error("Rehearsal window expired.");
  }
}

if (plannedRehearsalSpendRaw() > DEVNET_REHEARSAL_BUDGET_RAW) {
  throw new Error("The compiled rehearsal contribution plan exceeds 100 USDG.");
}
