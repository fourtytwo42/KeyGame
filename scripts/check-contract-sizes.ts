import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { keccak256, type Hex } from "viem";
import {
  assertReleaseCompilerConfiguration,
  CONTRACT_SIZE_POLICY_VERSION,
  DEPLOYABLE_CONTRACTS,
  EIP170_RUNTIME_LIMIT_BYTES,
  evaluateContractSize,
  PRODUCTION_RUNTIME_BUDGET_BYTES,
  RELEASE_FOUNDRY_PROFILE,
  validateContractSizeReport,
  type ContractSizeReport,
} from "../src/lib/release/contract-size";

const releaseEnvironment = {
  ...process.env,
  FOUNDRY_PROFILE: RELEASE_FOUNDRY_PROFILE,
};

function run(command: string, args: string[]) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    env: releaseEnvironment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

const outputDirectory = path.resolve(
  process.env.KEYGAME_CONTRACT_SIZE_EVIDENCE_DIR ??
    path.join("artifacts", "contract-size"),
);
const jsonPath = path.join(outputDirectory, "release-contract-sizes.json");
const markdownPath = path.join(outputDirectory, "release-contract-sizes.md");
const checksumsPath = path.join(outputDirectory, "SHA256SUMS");

const sourceCommit = run("git", ["rev-parse", "HEAD"]);
const generatedAt = run("git", ["show", "-s", "--format=%cI", "HEAD"]);
const foundryVersion = run("forge", ["--version"]).split(/\r?\n/, 1)[0];
const forgeConfiguration = JSON.parse(
  run("forge", ["config", "--json"]),
) as Record<string, unknown>;
const compiler = assertReleaseCompilerConfiguration(forgeConfiguration);
const compilerConfigSha256 = createHash("sha256")
  .update(
    JSON.stringify({
      profile: RELEASE_FOUNDRY_PROFILE,
      compiler,
    }),
  )
  .digest("hex");

run("forge", ["build", "--force", "--quiet"]);
const contracts = DEPLOYABLE_CONTRACTS.map((contract) => {
  const bytecode = run("forge", [
    "inspect",
    contract.name,
    "deployedBytecode",
  ]) as Hex;
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(bytecode)) {
    throw new Error(`${contract.name} returned malformed runtime bytecode.`);
  }
  return evaluateContractSize({
    contractName: contract.name,
    tier: contract.tier,
    runtimeBytes: (bytecode.length - 2) / 2,
    runtimeCodeHash: keccak256(bytecode),
  });
});

const report: ContractSizeReport = {
  policyVersion: CONTRACT_SIZE_POLICY_VERSION,
  profile: RELEASE_FOUNDRY_PROFILE,
  sourceCommit,
  generatedAt,
  foundryVersion,
  compiler,
  compilerConfigSha256,
  limits: {
    eip170RuntimeBytes: EIP170_RUNTIME_LIMIT_BYTES,
    productionRuntimeBudgetBytes: PRODUCTION_RUNTIME_BUDGET_BYTES,
  },
  contracts,
  passed: contracts.every((contract) => contract.passed),
};

await mkdir(outputDirectory, { recursive: true });
const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = `# Release Contract Sizes

- Source commit: \`${report.sourceCommit}\`
- Foundry: \`${report.foundryVersion}\`
- Profile: \`${report.profile}\`
- Compiler: \`${report.compiler.solcVersion}\`, optimizer ${report.compiler.optimizerRuns}, via IR
- Policy: \`${report.policyVersion}\`
- EIP-170 limit: ${report.limits.eip170RuntimeBytes.toLocaleString("en-US")} bytes
- Production budget: ${report.limits.productionRuntimeBudgetBytes.toLocaleString("en-US")} bytes
- Result: **${report.passed ? "PASSED" : "FAILED"}**

| Contract | Tier | Runtime bytes | EIP-170 margin | Policy margin | Result |
| --- | --- | ---: | ---: | ---: | --- |
${report.contracts
  .map(
    (contract) =>
      `| ${contract.contractName} | ${contract.tier} | ${contract.runtimeBytes} | ${contract.eip170MarginBytes} | ${contract.policyMarginBytes} | ${contract.passed ? "PASS" : "FAIL"} |`,
  )
  .join("\n")}
`;
await writeFile(jsonPath, json);
await writeFile(markdownPath, markdown);
const checksums = [
  [createHash("sha256").update(json).digest("hex"), path.basename(jsonPath)],
  [
    createHash("sha256").update(markdown).digest("hex"),
    path.basename(markdownPath),
  ],
]
  .map(([hash, file]) => `${hash}  ${file}`)
  .join("\n");
await writeFile(checksumsPath, `${checksums}\n`);

validateContractSizeReport(report, { sourceCommit, compilerConfigSha256 });
process.stdout.write(
  `${JSON.stringify(
    {
      ok: report.passed,
      report: jsonPath,
      compilerConfigSha256,
      manager: report.contracts.find(
        (contract) => contract.contractName === "RoundManagerV4",
      ),
    },
    null,
    2,
  )}\n`,
);
if (!report.passed) {
  throw new Error("One or more deployable contracts exceed the size policy.");
}
