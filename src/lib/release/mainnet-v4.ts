import { getAddress } from "viem";

export type MainnetReleaseAuthorization = {
  authorizationId: string;
  sourceCommit: string;
  manifestSha256: string;
  chainId: 4663;
  deployerAddress: string;
  maximumDeployments: 1;
  canaryMaximumSettledRounds: 10;
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
  "canaryMaximumSettledRounds",
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
  if (value.canaryMaximumSettledRounds !== 10) {
    throw new Error("Authorization must bind the ten-round canary scope.");
  }
  if (value.mainnetBroadcastAuthorized !== true) {
    throw new Error("Authorization does not permit mainnet broadcast.");
  }
  const expiresAt = Date.parse(String(value.expiresAt));
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= (expected.now ?? Date.now())
  ) {
    throw new Error("Authorization is expired or malformed.");
  }
  for (const field of ["internalSecurityReviewSha256"] as const) {
    if (!/^[0-9a-f]{64}$/i.test(String(value[field]))) {
      throw new Error(`${field} must be a SHA-256 digest.`);
    }
  }
  return value as MainnetReleaseAuthorization;
}
