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
  unstartedSuccessorRounds: number;
}) {
  if (
    (input.totalRounds !== 2 && input.totalRounds !== 3) ||
    input.settledRounds !== 2 ||
    input.cancelledRounds !== 0 ||
    input.unstartedSuccessorRounds !== input.totalRounds - 2
  ) {
    throw new Error(
      `Expected exactly two settled rounds, no cancellations, and at most one unstarted successor; found ${JSON.stringify(input)}.`,
    );
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} evidence is missing or malformed.`);
  }
  return value as Record<string, unknown>;
}

export function validateFinalTestnetSmokeEvidence(input: {
  expectedCommit: string;
  manifest: unknown;
  bytecode: unknown;
  reconciliation: unknown;
}) {
  if (!/^[0-9a-f]{40}$/.test(input.expectedCommit)) {
    throw new Error("Expected source commit must be a full lowercase Git SHA.");
  }
  const manifest = record(input.manifest, "Testnet manifest");
  const bytecode = record(input.bytecode, "Testnet bytecode");
  const reconciliation = record(input.reconciliation, "Testnet reconciliation");
  const scope = record(reconciliation.scope, "Testnet reconciliation scope");
  const authorization = record(
    reconciliation.authorizationScope,
    "Testnet authorization scope",
  );
  const contributions = Array.isArray(reconciliation.contributionSummaries)
    ? reconciliation.contributionSummaries
    : [];
  const allocations = Array.isArray(reconciliation.allocations)
    ? reconciliation.allocations
    : [];
  const claims = Array.isArray(reconciliation.rewardClaims)
    ? reconciliation.rewardClaims
    : [];
  const comparisons = Array.isArray(bytecode.comparisons)
    ? bytecode.comparisons
    : [];
  const comparisonNames = new Set(
    comparisons.map((comparison) =>
      String(record(comparison, "Bytecode comparison").name),
    ),
  );
  const expectedContracts = [
    "RoundManagerV4",
    "RoundFactoryV5",
    "PaymentRouter",
    "LifetimePointsVault",
    "RewardRouterV4",
    "MockStockSwapAdapter",
    "LastBellRoundV4",
    "MockUSDG",
    "MockStockToken0",
    "MockStockToken1",
    "MockStockToken2",
    "MockStockToken3",
  ];
  const deployedSourceCommit = String(bytecode.deployedSourceCommit ?? "");
  if (!/^[0-9a-f]{40}$/.test(deployedSourceCommit)) {
    throw new Error(
      "Testnet bytecode evidence lacks a deployed source commit.",
    );
  }

  if (
    manifest.chainId !== 46630 ||
    manifest.mockOnly !== true ||
    manifest.contractVersion !== "saved-bell-v5-market-pot" ||
    manifest.sourceCommit !== deployedSourceCommit
  ) {
    throw new Error(
      "Testnet manifest does not match the frozen mock-only deployment.",
    );
  }
  if (
    bytecode.allMatch !== true ||
    bytecode.candidateSourceCommit !== input.expectedCommit ||
    bytecode.additionalTransactionsSubmitted !== 0 ||
    comparisons.length !== expectedContracts.length ||
    expectedContracts.some((name) => !comparisonNames.has(name)) ||
    comparisons.some(
      (comparison) => record(comparison, "Bytecode comparison").match !== true,
    )
  ) {
    throw new Error(
      "Deployed testnet bytecode does not exactly match the candidate.",
    );
  }
  if (
    reconciliation.ok !== true ||
    reconciliation.chainId !== 46630 ||
    reconciliation.sourceCommit !== deployedSourceCommit ||
    reconciliation.manifestHash !== bytecode.manifestSha256 ||
    authorization.maxDeployments !== 1 ||
    authorization.maxSettledRounds !== 2 ||
    scope.totalRounds !== 3 ||
    scope.settledRounds !== 2 ||
    scope.cancelledRounds !== 0 ||
    scope.unstartedSuccessorRounds !== 1 ||
    reconciliation.failedKeeperJobs !== "0"
  ) {
    throw new Error(
      "Testnet smoke scope or reconciliation does not satisfy the final gate.",
    );
  }
  if (
    contributions.length !== 2 ||
    contributions.some(
      (summary) => Number(record(summary, "Contribution summary").players) < 2,
    ) ||
    allocations.length !== 10
  ) {
    throw new Error(
      "Testnet smoke does not contain two players and five allocations per round.",
    );
  }
  const categories = new Set(
    claims.map((claim) => String(record(claim, "Reward claim").category)),
  );
  for (const category of ["LAST_BELL", "WINNING_STOCK", "LIFETIME"]) {
    if (!categories.has(category)) {
      throw new Error(`Testnet smoke is missing ${category} reward evidence.`);
    }
  }
  return {
    sourceCommit: input.expectedCommit,
    testnetSourceCommit: deployedSourceCommit,
    manifestSha256: String(bytecode.manifestSha256),
    settledRounds: 2,
    unstartedSuccessorRounds: 1,
    allocationRows: 10,
    currentBytecodeMatches: true,
  };
}
