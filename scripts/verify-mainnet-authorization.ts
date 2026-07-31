import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { getAddress } from "viem";
import { validateMainnetReleaseAuthorization } from "../src/lib/release/mainnet-v4";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

const projectRoot = await realpath(process.cwd());
const authorizationPath = required("MAINNET_RELEASE_AUTHORIZATION_FILE");
if (!isAbsolute(authorizationPath)) {
  throw new Error("MAINNET_RELEASE_AUTHORIZATION_FILE must be absolute.");
}
const resolvedAuthorization = await realpath(authorizationPath);
const insideProject = relative(projectRoot, resolvedAuthorization);
if (!insideProject.startsWith("..") && !isAbsolute(insideProject)) {
  throw new Error("Mainnet authorization must remain outside the repository.");
}

const sourceCommit = required("SOURCE_COMMIT").toLowerCase();
const deployerAddress = getAddress(required("DEPLOYER_ADDRESS"));
const canaryPlayerAddress = getAddress(required("KEYGAME_CANARY_ADDRESS"));
const manifestPath = resolve(required("MAINNET_MANIFEST_PATH"));
const manifestSha256 = sha256(await readFile(manifestPath));
const authorization = validateMainnetReleaseAuthorization(
  JSON.parse(await readFile(resolvedAuthorization, "utf8")),
  { sourceCommit, manifestSha256, deployerAddress, canaryPlayerAddress },
);

process.stdout.write(
  `${JSON.stringify(
    {
      valid: true,
      authorizationId: authorization.authorizationId,
      sourceCommit,
      manifestSha256,
      chainId: authorization.chainId,
      deployerAddress,
      canaryPlayerAddress,
      maximumDeployments: authorization.maximumDeployments,
      canaryMaximumSettledRounds: authorization.canaryMaximumSettledRounds,
      canaryDurationHours: authorization.canaryDurationHours,
      canaryUsdgBudget: authorization.canaryUsdgBudget,
      walletUatDisposition: authorization.walletUatDisposition,
      browserWalletCompatibility: authorization.browserWalletCompatibility,
      canaryWalletMode: authorization.canaryWalletMode,
      expiresAt: authorization.expiresAt,
      internalSecurityReviewSha256: authorization.internalSecurityReviewSha256,
    },
    null,
    2,
  )}\n`,
);
