import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateMainnetReleaseAuthorization } from "./mainnet-v4";

const expected = {
  sourceCommit: "a".repeat(40),
  manifestSha256: "b".repeat(64),
  deployerAddress: "0x1111111111111111111111111111111111111111",
  now: Date.parse("2026-07-31T00:00:00Z"),
};
const valid = {
  authorizationId: "release-2026-07-31",
  sourceCommit: expected.sourceCommit,
  manifestSha256: expected.manifestSha256,
  deployerAddress: expected.deployerAddress,
  chainId: 4663,
  maximumDeployments: 1,
  canaryMaximumSettledRounds: 10,
  expiresAt: "2026-08-01T00:00:00Z",
  mainnetBroadcastAuthorized: true,
  internalSecurityReviewSha256: "c".repeat(64),
};

describe("mainnet v4 release guards", () => {
  it("accepts only the exact commit, manifest, deployer, and canary scope", () => {
    expect(validateMainnetReleaseAuthorization(valid, expected)).toMatchObject({
      chainId: 4663,
      maximumDeployments: 1,
      canaryMaximumSettledRounds: 10,
    });
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, sourceCommit: "0".repeat(40) },
        expected,
      ),
    ).toThrow(/commit mismatch/);
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, canaryMaximumSettledRounds: 11 },
        expected,
      ),
    ).toThrow(/ten-round/);
  });

  it("rejects expired, incomplete, and unknown-field authorizations", () => {
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, expiresAt: "2026-07-30T00:00:00Z" },
        expected,
      ),
    ).toThrow(/expired/);
    const incomplete: Record<string, unknown> = { ...valid };
    delete incomplete.internalSecurityReviewSha256;
    expect(() =>
      validateMainnetReleaseAuthorization(incomplete, expected),
    ).toThrow(/incomplete/);
    expect(() =>
      validateMainnetReleaseAuthorization({ ...valid, extra: true }, expected),
    ).toThrow(/Unknown/);
  });

  it("pins sender, keystore, dual RPC, protected scan, and compile lock", () => {
    const shell = readFileSync("scripts/deploy-mainnet-v4.sh", "utf8");
    const solidity = readFileSync("script/DeployMainnet.s.sol", "utf8");
    expect(shell).toContain('--sender "$DEPLOYER_ADDRESS"');
    expect(shell).toContain('--keystore "$DEPLOYER_KEYSTORE"');
    expect(shell).toContain('--password-file "$DEPLOYER_PASSWORD_FILE"');
    expect(shell).toContain("ROBINHOOD_MAINNET_FALLBACK_RPC_URL");
    expect(shell).toContain("release:scan:mainnet");
    expect(solidity).toContain("MAINNET_BROADCAST_ENABLED = false");
  });
});
