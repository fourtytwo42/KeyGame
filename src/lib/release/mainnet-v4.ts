import { getAddress } from "viem";

export type MainnetRpcPolicy = {
  primary: string;
  fallback?: string;
  policy?: string;
  referenceUse?: string;
  automaticFailover?: boolean;
};

export function assertMainnetLanOnlyRpcPolicy(
  rpc: MainnetRpcPolicy,
): { primaryUrl: string; referenceUrl: string } {
  if (!rpc.primary?.trim()) {
    throw new Error("The LAN primary RPC URL is required.");
  }
  if (!rpc.fallback?.trim()) {
    throw new Error("A health-reference RPC URL is required.");
  }
  if (rpc.primary === rpc.fallback) {
    throw new Error("The LAN primary and health-reference RPCs must differ.");
  }
  if (rpc.policy !== "LAN_ONLY") {
    throw new Error("Mainnet RPC policy must be LAN_ONLY.");
  }
  if (rpc.referenceUse !== "HEALTH_CHECK_ONLY") {
    throw new Error("The secondary RPC must be HEALTH_CHECK_ONLY.");
  }
  if (rpc.automaticFailover !== false) {
    throw new Error("Automatic RPC failover must remain disabled.");
  }
  return { primaryUrl: rpc.primary, referenceUrl: rpc.fallback };
}

export type WalletUatDisposition = {
  status: "PASSED" | "SKIPPED_BY_OPERATOR" | "NOT_PERFORMED";
  passed: boolean;
  browserWalletCompatibility: "VERIFIED" | "UNVERIFIED";
  requiredForCanary: boolean;
};

export function resolveWalletUatDisposition(
  gates: Record<string, unknown> | undefined,
): WalletUatDisposition {
  const legacyPassed = gates?.externalWalletUatPassed === true;
  const explicit = gates?.externalWalletUatStatus;
  const status =
    explicit === "PASSED" ||
    explicit === "SKIPPED_BY_OPERATOR" ||
    explicit === "NOT_PERFORMED"
      ? explicit
      : legacyPassed
        ? "PASSED"
        : "NOT_PERFORMED";
  const passed = status === "PASSED";
  if (legacyPassed !== passed && explicit !== undefined) {
    throw new Error(
      "External wallet UAT status conflicts with the legacy pass flag.",
    );
  }
  const compatibility = gates?.browserWalletCompatibility;
  const browserWalletCompatibility =
    compatibility === "VERIFIED" || compatibility === "UNVERIFIED"
      ? compatibility
      : passed
        ? "VERIFIED"
        : "UNVERIFIED";
  if (passed !== (browserWalletCompatibility === "VERIFIED")) {
    throw new Error(
      "Browser wallet compatibility conflicts with the UAT disposition.",
    );
  }
  return {
    status,
    passed,
    browserWalletCompatibility,
    requiredForCanary: gates?.walletUatRequiredForCanary !== false,
  };
}

export type MainnetReleaseAuthorization = {
  authorizationId: string;
  sourceCommit: string;
  manifestSha256: string;
  chainId: 4663;
  deployerAddress: string;
  maximumDeployments: 1;
  launchValidation: "READ_ONLY";
  promotionRequiresSeparateAuthorization: true;
  walletUatDisposition: "SKIPPED_BY_OPERATOR";
  browserWalletCompatibility: "UNVERIFIED";
  authorizedAt: string;
  expiresAt: string;
  mainnetBroadcastAuthorized: true;
  internalSecurityReviewSha256: string;
};

const keys = new Set<keyof MainnetReleaseAuthorization>([
  "authorizationId",
  "sourceCommit",
  "manifestSha256",
  "chainId",
  "deployerAddress",
  "maximumDeployments",
  "launchValidation",
  "promotionRequiresSeparateAuthorization",
  "walletUatDisposition",
  "browserWalletCompatibility",
  "authorizedAt",
  "expiresAt",
  "mainnetBroadcastAuthorized",
  "internalSecurityReviewSha256",
]);

export function validateMainnetReleaseAuthorization(
  input: unknown,
  expected: {
    sourceCommit: string;
    manifestSha256: string;
    deployerAddress: string;
    now?: number;
  },
): MainnetReleaseAuthorization {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Mainnet authorization must be a JSON object.");
  }
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (!keys.has(key as keyof MainnetReleaseAuthorization)) {
      throw new Error(`Unknown mainnet authorization field: ${key}`);
    }
  }
  if (Object.keys(value).length !== keys.size) {
    throw new Error("Mainnet authorization is incomplete.");
  }
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(String(value.authorizationId))) {
    throw new Error("Authorization ID is missing or malformed.");
  }
  if (value.sourceCommit !== expected.sourceCommit) {
    throw new Error("Authorization source commit mismatch.");
  }
  if (value.manifestSha256 !== expected.manifestSha256) {
    throw new Error("Authorization manifest hash mismatch.");
  }
  if (value.chainId !== 4663) {
    throw new Error("Authorization is not for Robinhood mainnet chain 4663.");
  }
  if (
    getAddress(String(value.deployerAddress)) !==
    getAddress(expected.deployerAddress)
  ) {
    throw new Error("Authorization deployer mismatch.");
  }
  if (value.maximumDeployments !== 1) {
    throw new Error("Authorization must permit exactly one deployment.");
  }
  if (value.launchValidation !== "READ_ONLY") {
    throw new Error("Authorization must require read-only launch validation.");
  }
  if (value.promotionRequiresSeparateAuthorization !== true) {
    throw new Error("Public promotion must require separate authorization.");
  }
  if (value.walletUatDisposition !== "SKIPPED_BY_OPERATOR") {
    throw new Error(
      "External wallet UAT must be explicitly skipped by the operator.",
    );
  }
  if (value.browserWalletCompatibility !== "UNVERIFIED") {
    throw new Error("Browser wallet compatibility must remain UNVERIFIED.");
  }
  if (value.mainnetBroadcastAuthorized !== true) {
    throw new Error("Authorization does not permit mainnet broadcast.");
  }
  const now = expected.now ?? Date.now();
  const authorizedAt = Date.parse(String(value.authorizedAt));
  const expiresAt = Date.parse(String(value.expiresAt));
  if (!Number.isFinite(authorizedAt) || authorizedAt > now) {
    throw new Error("Authorization start time is future-dated or malformed.");
  }
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= now ||
    expiresAt < authorizedAt + 60 * 60 * 1_000
  ) {
    throw new Error(
      "Authorization is expired, malformed, or valid for less than one hour.",
    );
  }
  for (const field of ["internalSecurityReviewSha256"] as const) {
    if (!/^[0-9a-f]{64}$/i.test(String(value[field]))) {
      throw new Error(`${field} must be a SHA-256 digest.`);
    }
  }
  return value as MainnetReleaseAuthorization;
}
