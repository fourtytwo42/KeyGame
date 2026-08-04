import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { validateMainnetPromotionAuthorization } from "../src/lib/release/mainnet-promotion";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for mainnet keeper access.`);
  return value;
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export async function assertMainnetPromotionAllowsKeeper(expected: {
  chainId: number;
  sourceCommit: string;
}) {
  if (expected.chainId !== 4663) return null;
  if (process.env.KEYGAME_MAINNET_KEEPER_BROADCAST_ENABLED !== "true") {
    throw new Error(
      "Mainnet keeper broadcasting remains disabled before promotion.",
    );
  }
  const authorizationPath = path.resolve(
    required("MAINNET_PROMOTION_AUTHORIZATION_FILE"),
  );
  const projectRoot = await realpath(process.cwd());
  const resolvedAuthorization = await realpath(authorizationPath);
  const relativeAuthorization = path.relative(
    projectRoot,
    resolvedAuthorization,
  );
  if (
    relativeAuthorization === "" ||
    (!relativeAuthorization.startsWith("..") &&
      !path.isAbsolute(relativeAuthorization))
  ) {
    throw new Error(
      "Mainnet promotion authorization must remain outside the repository.",
    );
  }
  const deploymentManifestPath = path.resolve(
    process.env.KEYGAME_DEPLOYMENT_MANIFEST ?? "deployments/4663.json",
  );
  const readOnlyReportPath = path.resolve(
    required("KEYGAME_MAINNET_READ_ONLY_REPORT"),
  );
  const [authorizationBytes, manifestBytes, reportBytes] = await Promise.all([
    readFile(resolvedAuthorization),
    readFile(deploymentManifestPath),
    readFile(readOnlyReportPath),
  ]);
  const report = JSON.parse(reportBytes.toString("utf8")) as {
    sourceCommit?: string;
    manifestSha256?: string;
    launchValidation?: string;
    transactionsSubmitted?: number;
  };
  const manifestSha256 = sha256(manifestBytes);
  if (
    report.sourceCommit !== expected.sourceCommit ||
    report.manifestSha256 !== manifestSha256 ||
    report.launchValidation !== "READ_ONLY" ||
    report.transactionsSubmitted !== 0
  ) {
    throw new Error("Read-only launch evidence does not match the deployment.");
  }
  return validateMainnetPromotionAuthorization(
    JSON.parse(authorizationBytes.toString("utf8")),
    {
      deploymentManifestSha256: manifestSha256,
      readOnlyVerificationSha256: sha256(reportBytes),
      sourceCommit: expected.sourceCommit,
    },
  );
}
