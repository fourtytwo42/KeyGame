import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, getAddress, http, type Address } from "viem";
import { robinhoodChainMainnet } from "../src/lib/web3/chains";
import {
  assertBuildProvenanceMatchesSizeReport,
  validatePlannedMainnetDeployment,
} from "../src/lib/release/mainnet-deployment-plan";
import { validateContractSizeReport } from "../src/lib/release/contract-size";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const planPath = path.resolve(required("KEYGAME_MAINNET_PLANNED_MANIFEST"));
const planBytes = await readFile(planPath);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const deployerAddress = getAddress(required("DEPLOYER_ADDRESS"));
const rpcUrl =
  process.env.ROBINHOOD_MAINNET_RPC_URL ?? "http://192.168.50.173:8547";
const client = createPublicClient({
  chain: robinhoodChainMainnet,
  transport: http(rpcUrl, { timeout: 8_000 }),
});
if ((await client.getChainId()) !== 4663) throw new Error("Wrong chain.");
const currentNonce = await client.getTransactionCount({
  address: deployerAddress,
  blockTag: "pending",
});
const plan = validatePlannedMainnetDeployment(
  JSON.parse(planBytes.toString("utf8")),
  { sourceCommit, deployerAddress, deploymentNonce: BigInt(currentNonce) },
);
const contractSizeEvidencePath = path.resolve(
  required("KEYGAME_CONTRACT_SIZE_EVIDENCE"),
);
const contractSizeEvidenceBytes = await readFile(contractSizeEvidencePath);
const contractSizeReport = validateContractSizeReport(
  JSON.parse(contractSizeEvidenceBytes.toString("utf8")),
  {
    sourceCommit,
    compilerConfigSha256: plan.buildProvenance.compilerConfigSha256,
  },
);
const contractSizeEvidenceSha256 = createHash("sha256")
  .update(contractSizeEvidenceBytes)
  .digest("hex");
if (contractSizeEvidenceSha256 !== plan.buildProvenance.sizeReportSha256) {
  throw new Error("Contract-size evidence differs from the planned manifest.");
}
assertBuildProvenanceMatchesSizeReport(
  plan.buildProvenance,
  contractSizeReport,
  contractSizeEvidenceSha256,
);
for (const address of Object.values(plan.expectedAddresses) as Address[]) {
  const code = await client.getCode({ address });
  if (code && code !== "0x") {
    throw new Error(`Planned address ${address} already contains bytecode.`);
  }
}
const configuredRoster = [0, 1, 2, 3].map((index) => ({
  symbol: required(`INITIAL_SYMBOL_${index}`),
  stockToken: getAddress(required(`INITIAL_STOCK_${index}`)),
}));
for (const [index, configured] of configuredRoster.entries()) {
  const planned = plan.initialRoster[index];
  if (
    configured.symbol !== planned.symbol ||
    configured.stockToken !== getAddress(planned.stockToken)
  ) {
    throw new Error(`Configured initial roster differs at index ${index}.`);
  }
}
const manifestSha256 = createHash("sha256").update(planBytes).digest("hex");
process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      checkedAt: new Date().toISOString(),
      chainId: 4663,
      sourceCommit,
      deployerAddress,
      deploymentNonce: currentNonce,
      manifestSha256,
      expectedAddresses: plan.expectedAddresses,
      expectedTransactionCount: plan.expectedTransactionCount,
      contractSizeEvidenceSha256,
      managerRuntimeBytes:
        plan.buildProvenance.contracts.RoundManagerV4.runtimeBytes,
      managerEip170MarginBytes:
        plan.buildProvenance.eip170RuntimeLimitBytes -
        plan.buildProvenance.contracts.RoundManagerV4.runtimeBytes,
      rpcPolicy: "LAN_ONLY",
      activeProvider: "lan",
      automaticFailover: false,
      broadcastAuthorized: false,
    },
    null,
    2,
  )}\n`,
);
