import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { validateMainnetPromotionAuthorization } from "../src/lib/release/mainnet-promotion";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}
async function externalFile(name: string) {
  const file = await realpath(required(name));
  const root = await realpath(process.cwd());
  const relative = path.relative(root, file);
  if (!relative.startsWith("..") && !path.isAbsolute(relative))
    throw new Error(`${name} must remain outside the repository.`);
  return file;
}

const authorizationPath = await externalFile(
  "MAINNET_PROMOTION_AUTHORIZATION_FILE",
);
const manifestPath = path.resolve(required("KEYGAME_DEPLOYMENT_MANIFEST"));
const reportPath = path.resolve(required("KEYGAME_MAINNET_READ_ONLY_REPORT"));
const [authorizationBytes, manifestBytes, reportBytes] = await Promise.all([
  readFile(authorizationPath),
  readFile(manifestPath),
  readFile(reportPath),
]);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  sourceCommit: string;
  chainId: number;
};
if (manifest.chainId !== 4663)
  throw new Error("Promotion manifest is not chain 4663.");
const authorization = validateMainnetPromotionAuthorization(
  JSON.parse(authorizationBytes.toString("utf8")),
  {
    deploymentManifestSha256: sha256(manifestBytes),
    readOnlyVerificationSha256: sha256(reportBytes),
    sourceCommit: manifest.sourceCommit,
  },
);
process.stdout.write(
  `${JSON.stringify({ valid: true, ...authorization }, null, 2)}\n`,
);
