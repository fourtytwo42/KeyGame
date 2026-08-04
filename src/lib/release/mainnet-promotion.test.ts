import { describe, expect, it } from "vitest";
import { validateMainnetPromotionAuthorization } from "./mainnet-promotion";

const expected = {
  deploymentManifestSha256: "a".repeat(64),
  readOnlyVerificationSha256: "b".repeat(64),
  sourceCommit: "c".repeat(40),
  now: Date.parse("2026-08-01T01:00:00Z"),
};
const valid = {
  authorizationId: "promote-2026-08-01",
  chainId: 4663,
  deploymentManifestSha256: expected.deploymentManifestSha256,
  readOnlyVerificationSha256: expected.readOnlyVerificationSha256,
  sourceCommit: expected.sourceCommit,
  publicPromotionAuthorized: true,
  authorizedAt: "2026-08-01T00:00:00Z",
  expiresAt: "2026-08-01T02:00:00Z",
};

describe("mainnet promotion authorization", () => {
  it("binds promotion to the deployed manifest and read-only report", () => {
    expect(
      validateMainnetPromotionAuthorization(valid, expected),
    ).toMatchObject({ chainId: 4663, publicPromotionAuthorized: true });
    expect(() =>
      validateMainnetPromotionAuthorization(
        { ...valid, readOnlyVerificationSha256: "d".repeat(64) },
        expected,
      ),
    ).toThrow(/mismatch/);
    expect(() =>
      validateMainnetPromotionAuthorization(
        { ...valid, publicPromotionAuthorized: false },
        expected,
      ),
    ).toThrow(/not authorized/);
  });
  it("rejects expired, incomplete, and unknown authorizations", () => {
    expect(() =>
      validateMainnetPromotionAuthorization(
        { ...valid, expiresAt: "2026-08-01T00:30:00Z" },
        expected,
      ),
    ).toThrow(/expired/);
    expect(() =>
      validateMainnetPromotionAuthorization(
        { ...valid, legacyCanary: true },
        expected,
      ),
    ).toThrow(/Unknown/);
    const incomplete: Record<string, unknown> = { ...valid };
    delete incomplete.readOnlyVerificationSha256;
    expect(() =>
      validateMainnetPromotionAuthorization(incomplete, expected),
    ).toThrow(/incomplete/);
  });
});
