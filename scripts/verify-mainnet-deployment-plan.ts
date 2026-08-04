import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAddress, type Address } from "viem";
import {
  validatePlannedMainnetDeployment,
  type MainnetPlannedAddresses,
} from "../src/lib/release/mainnet-deployment-plan";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

const planPath = path.resolve(required("KEYGAME_MAINNET_PLANNED_MANIFEST"));
const deploymentPath = path.resolve(required("KEYGAME_DEPLOYMENT_MANIFEST"));
const [planBytes, deploymentBytes] = await Promise.all([
  readFile(planPath),
  readFile(deploymentPath),
]);
const plan = validatePlannedMainnetDeployment(
  JSON.parse(planBytes.toString("utf8")),
);
const deployment = JSON.parse(deploymentBytes.toString("utf8")) as {
  chainId: number;
  sourceCommit: string;
  mockOnly: boolean;
  contracts: Record<string, Address>;
  roles: Record<string, Address | null>;
  runtimeCodeHashes: Record<string, `0x${string}`>;
  runtimeCodeSizes: Record<string, number>;
  buildProvenance: unknown;
  releaseGates?: Record<string, unknown>;
};
if (
  deployment.chainId !== 4663 ||
  deployment.mockOnly ||
  deployment.sourceCommit !== plan.sourceCommit
) {
  throw new Error("Final deployment identity does not match the plan.");
}
for (const [name, expectedAddress] of Object.entries(plan.expectedAddresses)) {
  const actualAddress = deployment.contracts[name];
  if (
    !actualAddress ||
    getAddress(actualAddress) !== getAddress(expectedAddress)
  ) {
    throw new Error(`Final ${name} address does not match the plan.`);
  }
  if (
    deployment.runtimeCodeHashes[name]?.toLowerCase() !==
    plan.expectedRuntimeCodeHashes[
      name as keyof MainnetPlannedAddresses
    ].toLowerCase()
  ) {
    throw new Error(`Final ${name} runtime bytecode does not match the plan.`);
  }
  if (
    deployment.runtimeCodeSizes[name] !==
    plan.expectedRuntimeCodeSizes[name as keyof MainnetPlannedAddresses]
  ) {
    throw new Error(`Final ${name} runtime size does not match the plan.`);
  }
}
if (
  JSON.stringify(deployment.buildProvenance) !==
  JSON.stringify(plan.buildProvenance)
) {
  throw new Error("Final build provenance does not match the plan.");
}
for (const role of [
  "managerAdmin",
  "marketAdmin",
  "keeper",
  "treasury",
  "conversionOperator",
]) {
  if (
    !deployment.roles[role] ||
    getAddress(deployment.roles[role]!) !== getAddress(plan.deployerAddress)
  ) {
    throw new Error(`Final ${role} does not match the planned deployer.`);
  }
}
if (
  deployment.releaseGates?.mainnetBroadcastAuthorized !== false ||
  deployment.releaseGates?.contractSizePassed !== true ||
  deployment.releaseGates?.mainnetAuthorizationState !== "CONSUMED" ||
  deployment.releaseGates?.launchValidationStatus !== "PENDING" ||
  deployment.releaseGates?.promotionStatus !== "LOCKED"
) {
  throw new Error(
    "Final release state is not locked for read-only validation.",
  );
}
const evidence = {
  ok: true,
  checkedAt: new Date().toISOString(),
  sourceCommit: plan.sourceCommit,
  chainId: 4663,
  plannedManifestSha256: sha256(planBytes),
  deploymentManifestSha256: sha256(deploymentBytes),
  expectedAddresses: plan.expectedAddresses,
  addressAndRuntimeBytecodeMatch: true,
  roleCustodyMatch: true,
  authorizationState: "CONSUMED",
  launchValidationStatus: "PENDING",
  promotionStatus: "LOCKED",
};
const output =
  process.env.KEYGAME_MAINNET_PLAN_COMPARISON_REPORT ??
  path.join("artifacts", "mainnet-release", "deployment-plan-comparison.json");
await mkdir(path.dirname(output), { recursive: true });
const json = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(output, json, "utf8");
await writeFile(
  `${output}.sha256`,
  `${sha256(json)}  ${path.basename(output)}\n`,
  "utf8",
);
process.stdout.write(json);
