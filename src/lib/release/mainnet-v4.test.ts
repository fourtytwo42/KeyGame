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
  now: Date.parse("2026-07-31T00:00:00Z"),
};
const valid = {
  authorizationId: "release-2026-07-31",
  sourceCommit: expected.sourceCommit,
  manifestSha256: expected.manifestSha256,
  deployerAddress: expected.deployerAddress,
  chainId: 4663,
  maximumDeployments: 1,
  launchValidation: "READ_ONLY",
  promotionRequiresSeparateAuthorization: true,
  walletUatDisposition: "SKIPPED_BY_OPERATOR",
  browserWalletCompatibility: "UNVERIFIED",
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
  it("accepts only the exact commit, manifest, deployer, and read-only scope", () => {
    expect(validateMainnetReleaseAuthorization(valid, expected)).toMatchObject({
      chainId: 4663,
      maximumDeployments: 1,
      launchValidation: "READ_ONLY",
      promotionRequiresSeparateAuthorization: true,
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
        { ...valid, launchValidation: "SCRIPTED_CANARY" },
        expected,
      ),
    ).toThrow(/read-only/);
    expect(() =>
      validateMainnetReleaseAuthorization(
        { ...valid, promotionRequiresSeparateAuthorization: false },
        expected,
      ),
    ).toThrow(/promotion/);
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
        { ...valid, canaryDurationHours: 1 },
        expected,
      ),
    ).toThrow(/Unknown/);
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
        { ...valid, expiresAt: "2026-07-31T00:59:59Z" },
        expected,
      ),
    ).toThrow(/less than one hour/);
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
    const rehearsal = readFileSync("scripts/v4-launch-rehearsal.ts", "utf8");
    const readOnly = readFileSync(
      "scripts/verify-mainnet-read-only.ts",
      "utf8",
    );
    const timer = readFileSync(
      "ops/systemd/keygame-v4-launch-rehearsal.timer",
      "utf8",
    );
    expect(shell).toContain('--sender "$DEPLOYER_ADDRESS"');
    expect(shell).toContain('--keystore "$DEPLOYER_KEYSTORE"');
    expect(shell).toContain('--password-file "$DEPLOYER_PASSWORD_FILE"');
    expect(shell).not.toContain("KEYGAME_CANARY_KEYSTORE");
    expect(shell).toContain("SKIPPED_BY_OPERATOR");
    expect(shell).toContain("ROBINHOOD_MAINNET_FALLBACK_RPC_URL");
    expect(shell).toContain("release:scan:mainnet");
    expect(solidity).toContain("MAINNET_BROADCAST_ENABLED = false");
    expect(rehearsal).toContain("manifest.chainId !== 31_337");
    expect(rehearsal).not.toContain("4663");
    expect(readOnly).toContain('launchValidation: "READ_ONLY"');
    expect(readOnly).not.toMatch(
      /createWalletClient|sendTransaction|writeContract|signTransaction|privateKeyToAccount/,
    );
    expect(timer).toContain("OnUnitActiveSec=10s");
    expect(timer).toContain("Persistent=false");
  });
});
