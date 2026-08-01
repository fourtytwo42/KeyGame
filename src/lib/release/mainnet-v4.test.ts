import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  resolveWalletUatDisposition,
  validateMainnetReleaseAuthorization,
} from "./mainnet-v4";

const expected = {
  sourceCommit: "a".repeat(40),
  manifestSha256: "b".repeat(64),
  deployerAddress: "0x1111111111111111111111111111111111111111",
  canaryPlayerAddress: "0x2222222222222222222222222222222222222222",
  now: Date.parse("2026-07-31T00:00:00Z"),
};
const valid = {
  authorizationId: "release-2026-07-31",
  sourceCommit: expected.sourceCommit,
  manifestSha256: expected.manifestSha256,
  deployerAddress: expected.deployerAddress,
  canaryPlayerAddress: expected.canaryPlayerAddress,
  chainId: 4663,
  maximumDeployments: 1,
  canaryMaximumSettledRounds: 10,
  canaryDurationHours: 1,
  canaryUsdgBudget: 100,
  walletUatDisposition: "SKIPPED_BY_OPERATOR",
  browserWalletCompatibility: "UNVERIFIED",
  canaryWalletMode: "DEPLOYER_PLUS_ONE_ENCRYPTED_PLAYER",
  authorizedAt: "2026-07-31T00:00:00Z",
  expiresAt: "2026-08-01T00:00:00Z",
  mainnetBroadcastAuthorized: true,
  internalSecurityReviewSha256: "c".repeat(64),
};

describe("mainnet v4 release guards", () => {
  it("keeps an operator skip distinct from a passing wallet test", () => {
    expect(
      resolveWalletUatDisposition({
        externalWalletUatPassed: false,
        externalWalletUatStatus: "SKIPPED_BY_OPERATOR",
        browserWalletCompatibility: "UNVERIFIED",
        walletUatRequiredForCanary: false,
      }),
    ).toEqual({
      status: "SKIPPED_BY_OPERATOR",
      passed: false,
      browserWalletCompatibility: "UNVERIFIED",
      requiredForCanary: false,
    });
    expect(
      resolveWalletUatDisposition({ externalWalletUatPassed: true }),
    ).toMatchObject({ status: "PASSED", passed: true });
    expect(() =>
      resolveWalletUatDisposition({
        externalWalletUatPassed: true,
        externalWalletUatStatus: "SKIPPED_BY_OPERATOR",
      }),
    ).toThrow(/conflicts/);
  });
  it("accepts only the exact commit, manifest, deployer, and canary scope", () => {
    expect(validateMainnetReleaseAuthorization(valid, expected)).toMatchObject({
      chainId: 4663,
      maximumDeployments: 1,
      canaryMaximumSettledRounds: 10,
      canaryDurationHours: 1,
      canaryUsdgBudget: 100,
      walletUatDisposition: "SKIPPED_BY_OPERATOR",
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
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, canaryDurationHours: 24 },
        expected,
      ),
    ).toThrow(/one-hour/);
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, walletUatDisposition: "PASSED" },
        expected,
      ),
    ).toThrow(/explicitly skipped/);
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, browserWalletCompatibility: "VERIFIED" },
        expected,
      ),
    ).toThrow(/UNVERIFIED/);
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, canaryUsdgBudget: 101 },
        expected,
      ),
    ).toThrow(/100 USDG/);
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, canaryPlayerAddress: expected.deployerAddress },
        expected,
      ),
    ).toThrow(/canary player mismatch|must differ/);
  });

  it("rejects expired, incomplete, and unknown-field authorizations", () => {
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, expiresAt: "2026-07-30T00:00:00Z" },
        expected,
      ),
    ).toThrow(/expired/);
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, expiresAt: "2026-07-31T01:59:59Z" },
        expected,
      ),
    ).toThrow(/less than two hours/);
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, authorizedAt: "2026-07-31T00:00:01Z" },
        expected,
      ),
    ).toThrow(/future-dated/);
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
    const restartHelper = readFileSync(
      "scripts/mainnet-canary-restart-service.sh",
      "utf8",
    );
    const timer = readFileSync(
      "ops/systemd/keygame-mainnet-canary.timer",
      "utf8",
    );
    expect(shell).toContain('--sender "$DEPLOYER_ADDRESS"');
    expect(shell).toContain('--keystore "$DEPLOYER_KEYSTORE"');
    expect(shell).toContain('--password-file "$DEPLOYER_PASSWORD_FILE"');
    expect(shell).toContain("KEYGAME_CANARY_KEYSTORE");
    expect(shell).toContain("SKIPPED_BY_OPERATOR");
    expect(shell).toContain("ROBINHOOD_MAINNET_FALLBACK_RPC_URL");
    expect(shell).toContain("release:scan:mainnet");
    expect(solidity).toContain("MAINNET_BROADCAST_ENABLED = false");
    expect(restartHelper).toContain('case "${1:-}" in');
    expect(restartHelper).toContain('exec /usr/bin/systemctl restart "$unit"');
    expect(restartHelper).not.toContain("sh -c");
    expect(timer).toContain("OnUnitActiveSec=10s");
    expect(timer).toContain("Persistent=false");
  });
});
