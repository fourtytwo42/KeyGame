export type TestnetSmokeAuthorization = {
  sourceCommit: string;
  twoRoundSmokeAuthorized: true;
  chainId: 46630;
  maxDeployments: 1;
  maxSettledRounds: 2;
};

const AUTHORIZATION_KEYS = new Set([
  "sourceCommit",
  "twoRoundSmokeAuthorized",
  "chainId",
  "maxDeployments",
  "maxSettledRounds",
]);

export function parseTestnetSmokeAuthorization(
  text: string,
  expectedCommit: string,
): TestnetSmokeAuthorization {
  const values = new Map<string, string>();
  for (const sourceLine of text.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0)
      throw new Error(`Malformed authorization line: ${line}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!AUTHORIZATION_KEYS.has(key)) {
      throw new Error(`Unknown authorization field: ${key}`);
    }
    if (values.has(key))
      throw new Error(`Duplicate authorization field: ${key}`);
    values.set(key, value);
  }

  if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
    throw new Error("Expected source commit must be a full lowercase Git SHA.");
  }
  if (values.get("sourceCommit") !== expectedCommit) {
    throw new Error("Testnet authorization does not match the release commit.");
  }
  if (values.get("twoRoundSmokeAuthorized") !== "true") {
    throw new Error("Authorization does not permit the two-round smoke.");
  }
  if (values.get("chainId") !== "46630") {
    throw new Error("Authorization is not scoped to Robinhood testnet.");
  }
  if (values.get("maxDeployments") !== "1") {
    throw new Error("Authorization must permit exactly one deployment.");
  }
  if (values.get("maxSettledRounds") !== "2") {
    throw new Error("Authorization must permit exactly two settled rounds.");
  }

  return {
    sourceCommit: expectedCommit,
    twoRoundSmokeAuthorized: true,
    chainId: 46630,
    maxDeployments: 1,
    maxSettledRounds: 2,
  };
}

export function calculateTestnetGasBudget(input: {
  balanceWei: bigint;
  deploymentGas: bigint;
  smokeGas: bigint;
  gasPriceWei: bigint;
  reserveWei: bigint;
  marginBps?: bigint;
}) {
  const marginBps = input.marginBps ?? 2_000n;
  if (
    input.balanceWei < 0n ||
    input.deploymentGas <= 0n ||
    input.smokeGas <= 0n ||
    input.gasPriceWei <= 0n ||
    input.reserveWei < 0n ||
    marginBps < 0n
  ) {
    throw new Error("Gas-budget inputs are invalid.");
  }
  const executionWei =
    (input.deploymentGas + input.smokeGas) * input.gasPriceWei;
  const executionWithMarginWei =
    (executionWei * (10_000n + marginBps) + 9_999n) / 10_000n;
  const requiredWei = input.reserveWei + executionWithMarginWei;
  return {
    ...input,
    marginBps,
    executionWei,
    executionWithMarginWei,
    requiredWei,
    headroomWei: input.balanceWei - requiredWei,
    sufficient: input.balanceWei >= requiredWei,
  };
}

export function smokeRoundLimitReached(
  latestRoundId: bigint,
  initialRoundId: bigint,
  maxSettledRounds: number,
) {
  if (initialRoundId <= 0n || maxSettledRounds !== 2) {
    throw new Error("The testnet smoke must be scoped to exactly two rounds.");
  }
  return latestRoundId >= initialRoundId + BigInt(maxSettledRounds) - 1n;
}

export function assertSmokeReconciliationScope(input: {
  totalRounds: number;
  settledRounds: number;
  cancelledRounds: number;
}) {
  if (
    input.totalRounds !== 2 ||
    input.settledRounds !== 2 ||
    input.cancelledRounds !== 0
  ) {
    throw new Error(
      `Expected exactly two settled rounds and no cancellations; found ${JSON.stringify(input)}.`,
    );
  }
}
