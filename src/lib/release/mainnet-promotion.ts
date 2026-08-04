export type MainnetPromotionAuthorization = {
  authorizationId: string;
  chainId: 4663;
  deploymentManifestSha256: string;
  readOnlyVerificationSha256: string;
  sourceCommit: string;
  publicPromotionAuthorized: true;
  authorizedAt: string;
  expiresAt: string;
};

const keys = new Set<keyof MainnetPromotionAuthorization>([
  "authorizationId",
  "chainId",
  "deploymentManifestSha256",
  "readOnlyVerificationSha256",
  "sourceCommit",
  "publicPromotionAuthorized",
  "authorizedAt",
  "expiresAt",
]);

export function validateMainnetPromotionAuthorization(
  input: unknown,
  expected: {
    deploymentManifestSha256: string;
    readOnlyVerificationSha256: string;
    sourceCommit: string;
    now?: number;
  },
): MainnetPromotionAuthorization {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Promotion authorization must be a JSON object.");
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value))
    if (!keys.has(key as keyof MainnetPromotionAuthorization))
      throw new Error(`Unknown promotion authorization field: ${key}`);
  if (Object.keys(value).length !== keys.size)
    throw new Error("Promotion authorization is incomplete.");
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(String(value.authorizationId)))
    throw new Error("Promotion authorization ID is malformed.");
  if (value.chainId !== 4663)
    throw new Error("Promotion authorization must target chain 4663.");
  for (const field of [
    "deploymentManifestSha256",
    "readOnlyVerificationSha256",
  ] as const) {
    if (
      !/^[0-9a-f]{64}$/i.test(String(value[field])) ||
      value[field] !== expected[field]
    )
      throw new Error(`${field} mismatch.`);
  }
  if (value.sourceCommit !== expected.sourceCommit)
    throw new Error("Promotion source commit mismatch.");
  if (value.publicPromotionAuthorized !== true)
    throw new Error("Public promotion is not authorized.");
  const now = expected.now ?? Date.now();
  const authorizedAt = Date.parse(String(value.authorizedAt));
  const expiresAt = Date.parse(String(value.expiresAt));
  if (
    !Number.isFinite(authorizedAt) ||
    authorizedAt > now ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  )
    throw new Error(
      "Promotion authorization is future-dated, expired, or malformed.",
    );
  return value as MainnetPromotionAuthorization;
}
