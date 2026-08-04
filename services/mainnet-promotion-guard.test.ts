import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertMainnetPromotionAllowsKeeper } from "./mainnet-promotion-guard";

const envKeys = [
  "KEYGAME_MAINNET_KEEPER_BROADCAST_ENABLED",
  "MAINNET_PROMOTION_AUTHORIZATION_FILE",
  "KEYGAME_DEPLOYMENT_MANIFEST",
  "KEYGAME_MAINNET_READ_ONLY_REPORT",
] as const;
const original = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);
afterEach(() => {
  for (const key of envKeys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("mainnet keeper promotion guard", () => {
  it("blocks the keeper before promotion is explicitly enabled", async () => {
    delete process.env.KEYGAME_MAINNET_KEEPER_BROADCAST_ENABLED;
    await expect(
      assertMainnetPromotionAllowsKeeper({
        chainId: 4663,
        sourceCommit: "a".repeat(40),
      }),
    ).rejects.toThrow(/disabled before promotion/);
  });

  it("requires authorization bound to the deployment and zero-transaction report", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "keygame-promotion-"),
    );
    try {
      const sourceCommit = "a".repeat(40);
      const manifest = `${JSON.stringify({ chainId: 4663, sourceCommit })}\n`;
      const manifestPath = path.join(directory, "manifest.json");
      const report = `${JSON.stringify({
        sourceCommit,
        manifestSha256: sha256(manifest),
        launchValidation: "READ_ONLY",
        transactionsSubmitted: 0,
      })}\n`;
      const reportPath = path.join(directory, "report.json");
      const now = Date.now();
      const authorization = {
        authorizationId: "promotion-test-1",
        chainId: 4663,
        deploymentManifestSha256: sha256(manifest),
        readOnlyVerificationSha256: sha256(report),
        sourceCommit,
        publicPromotionAuthorized: true,
        authorizedAt: new Date(now - 1_000).toISOString(),
        expiresAt: new Date(now + 3_600_000).toISOString(),
      };
      const authorizationPath = path.join(directory, "promotion.json");
      await Promise.all([
        writeFile(manifestPath, manifest),
        writeFile(reportPath, report),
        writeFile(authorizationPath, `${JSON.stringify(authorization)}\n`),
      ]);
      process.env.KEYGAME_MAINNET_KEEPER_BROADCAST_ENABLED = "true";
      process.env.MAINNET_PROMOTION_AUTHORIZATION_FILE = authorizationPath;
      process.env.KEYGAME_DEPLOYMENT_MANIFEST = manifestPath;
      process.env.KEYGAME_MAINNET_READ_ONLY_REPORT = reportPath;
      await expect(
        assertMainnetPromotionAllowsKeeper({ chainId: 4663, sourceCommit }),
      ).resolves.toMatchObject({ authorizationId: "promotion-test-1" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
