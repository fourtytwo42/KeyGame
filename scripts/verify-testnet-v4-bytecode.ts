import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  http,
  keccak256,
  type Address,
  type Hex,
} from "viem";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}
type Artifact = {
  deployedBytecode: {
    object: Hex;
    immutableReferences?: Record<
      string,
      Array<{ start: number; length: number }>
    >;
  };
};
function normalize(
  code: Hex,
  refs: Artifact["deployedBytecode"]["immutableReferences"],
) {
  const chars = code.slice(2).split("");
  for (const locations of Object.values(refs ?? {})) {
    for (const { start, length } of locations)
      chars.fill("0", start * 2, (start + length) * 2);
  }
  return `0x${chars.join("")}` as Hex;
}

const manifestPath = path.resolve(required("TESTNET_V4_DEPLOYMENT_MANIFEST"));
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  chainId: number;
  sourceCommit: string;
  contractVersion: string;
  contracts: Record<string, Address | Address[] | string>;
  rpc?: { primary?: string };
};
if (
  manifest.chainId !== 46630 ||
  manifest.contractVersion !== "last-bell-v4-stock-pot"
)
  throw new Error(
    "Evidence manifest is not the deployed v4 Robinhood testnet release.",
  );
const rpcUrl =
  process.env.ROBINHOOD_TESTNET_RPC_URL ??
  manifest.rpc?.primary ??
  "http://192.168.50.117:8547";
const client = createPublicClient({ transport: http(rpcUrl) });
if ((await client.getChainId()) !== 46630)
  throw new Error("Bytecode comparison RPC is not chain 46630.");

const targets: Array<{ name: string; address: Address; artifact: string }> = [
  {
    name: "RoundManagerV4",
    address: manifest.contracts.manager as Address,
    artifact: "out/RoundManagerV4.sol/RoundManagerV4.json",
  },
  {
    name: "PaymentRouter",
    address: manifest.contracts.paymentRouter as Address,
    artifact: "out/PaymentRouter.sol/PaymentRouter.json",
  },
  {
    name: "LifetimePointsVault",
    address: manifest.contracts.lifetimePointsVault as Address,
    artifact: "out/LifetimePointsVault.sol/LifetimePointsVault.json",
  },
  {
    name: "RewardRouterV4",
    address: manifest.contracts.rewardRouter as Address,
    artifact: "out/RewardRouterV4.sol/RewardRouterV4.json",
  },
  {
    name: "MockStockSwapAdapter",
    address: manifest.contracts.swapAdapter as Address,
    artifact: "out/MockStockSwapAdapter.sol/MockStockSwapAdapter.json",
  },
  {
    name: "LastBellRoundV4",
    address: manifest.contracts.activeRound as Address,
    artifact: "out/LastBellRoundV4.sol/LastBellRoundV4.json",
  },
  {
    name: "MockUSDG",
    address: manifest.contracts.mockUsdg as Address,
    artifact: "out/MockUSDG.sol/MockUSDG.json",
  },
  ...(manifest.contracts.mockStockTokens as Address[]).map(
    (address, index) => ({
      name: `MockStockToken${index}`,
      address,
      artifact: "out/MockStockToken.sol/MockStockToken.json",
    }),
  ),
];
const comparisons = [];
for (const target of targets) {
  const artifact = JSON.parse(
    await readFile(target.artifact, "utf8"),
  ) as Artifact;
  const deployed = await client.getCode({ address: target.address });
  if (!deployed || deployed === "0x")
    throw new Error(`${target.name} has no deployed code.`);
  const expected = normalize(
    artifact.deployedBytecode.object,
    artifact.deployedBytecode.immutableReferences,
  );
  const actual = normalize(
    deployed,
    artifact.deployedBytecode.immutableReferences,
  );
  const match = expected === actual;
  comparisons.push({
    name: target.name,
    address: target.address,
    match,
    expectedNormalizedHash: keccak256(expected),
    actualNormalizedHash: keccak256(actual),
  });
  if (!match)
    throw new Error(
      `${target.name} deployed bytecode differs from the current candidate.`,
    );
}
const evidence = {
  label: "TESTNET TWO-ROUND SMOKE · CURRENT BYTECODE MATCH",
  checkedAt: new Date().toISOString(),
  chainId: 46630,
  deployedSourceCommit: manifest.sourceCommit,
  candidateSourceCommit:
    process.env.SOURCE_COMMIT ??
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  manifestSha256: sha256(manifestBytes),
  comparisons,
  additionalTransactionsSubmitted: 0,
};
const output =
  process.env.TESTNET_V4_BYTECODE_EVIDENCE ??
  path.join("artifacts", "testnet-v4-smoke", "current-bytecode-match.json");
await mkdir(path.dirname(output), { recursive: true });
const json = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(output, json, "utf8");
await writeFile(
  `${output}.sha256`,
  `${sha256(json)}  ${path.basename(output)}\n`,
  "utf8",
);
process.stdout.write(json);
