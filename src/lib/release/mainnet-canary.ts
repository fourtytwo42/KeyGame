import { getAddress, parseUnits, type Address } from "viem";
import type { MainnetReleaseAuthorization } from "./mainnet-v4";

export type CanaryContributionPair = {
  deployerUsd: number;
  playerUsd: number;
};

export type CanaryRestartCheckpoint = {
  kind: "keeper" | "indexer";
  service: "v4-keeper" | "chain-indexer";
  afterSettledRounds: 4 | 7;
};

export const MAINNET_CANARY_ROUNDS = 10;
export const MAINNET_CANARY_DURATION_MS = 60 * 60 * 1_000;
export const MAINNET_CANARY_BUDGET_RAW = parseUnits("100", 6);
export const MAINNET_DEPLOYMENT_GAS_ENVELOPE = 25_000_000n;
export const MAINNET_CANARY_GAS_ENVELOPE = 50_000_000n;
export const MAINNET_CONVERSION_GAS_ENVELOPE = 5_000_000n;
export const MAINNET_GAS_MARGIN_BPS = 2_500n;
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

export function plannedCanarySpendByActorRaw() {
  return CANARY_CONTRIBUTIONS.reduce(
    (totals, pair) => ({
      deployer: totals.deployer + parseUnits(String(pair.deployerUsd), 6),
      player: totals.player + parseUnits(String(pair.playerUsd), 6),
    }),
    { deployer: 0n, player: 0n },
  );
}

export function calculateMainnetGasBudget(input: {
  gasPriceWei: bigint;
  reserveWei: bigint;
  playerReserveWei?: bigint;
  deploymentGas?: bigint;
  canaryGas?: bigint;
  conversionGas?: bigint;
}) {
  const deploymentGas = input.deploymentGas ?? MAINNET_DEPLOYMENT_GAS_ENVELOPE;
  const canaryGas = input.canaryGas ?? MAINNET_CANARY_GAS_ENVELOPE;
  const conversionGas = input.conversionGas ?? MAINNET_CONVERSION_GAS_ENVELOPE;
  if (
    input.gasPriceWei <= 0n ||
    input.reserveWei < 0n ||
    (input.playerReserveWei ?? 0n) < 0n ||
    deploymentGas <= 0n ||
    canaryGas <= 0n ||
    conversionGas <= 0n
  ) {
    throw new Error("Mainnet gas budget inputs must be positive.");
  }
  const executionGas = deploymentGas + canaryGas + conversionGas;
  const playerCanaryGas = canaryGas / 2n;
  const deployerCanaryGas = canaryGas - playerCanaryGas;
  const withMargin = (gas: bigint) =>
    (gas * input.gasPriceWei * (10_000n + MAINNET_GAS_MARGIN_BPS) + 9_999n) /
    10_000n;
  const deployerExecutionWithMarginWei = withMargin(
    deploymentGas + deployerCanaryGas + conversionGas,
  );
  const playerExecutionWithMarginWei = withMargin(playerCanaryGas);
  const playerReserveWei = input.playerReserveWei ?? 0n;
  return {
    deploymentGas,
    canaryGas,
    conversionGas,
    executionGas,
    deployerCanaryGas,
    playerCanaryGas,
    gasPriceWei: input.gasPriceWei,
    marginBps: MAINNET_GAS_MARGIN_BPS,
    deployerExecutionWithMarginWei,
    playerExecutionWithMarginWei,
    reserveWei: input.reserveWei,
    playerReserveWei,
    requiredDeployerWei: deployerExecutionWithMarginWei + input.reserveWei,
    requiredPlayerWei: playerExecutionWithMarginWei + playerReserveWei,
  };
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

export function restartCheckpointsForSettledRounds(
  settledRounds: number,
): CanaryRestartCheckpoint[] {
  const checkpoints: CanaryRestartCheckpoint[] = [];
  if (settledRounds >= 4) {
    checkpoints.push({
      kind: "keeper",
      service: "v4-keeper",
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
