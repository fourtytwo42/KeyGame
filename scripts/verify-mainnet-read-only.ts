import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";
import { robinhoodChainMainnet } from "../src/lib/web3/chains";
import {
  lastBellV4Abi,
  roundManagerV4Abi,
} from "../src/lib/web3/last-bell-abi";
import { assertMainnetLanOnlyRpcPolicy } from "../src/lib/release/mainnet-v4";

const managerAbi = [
  ...roundManagerV4Abi,
  ...parseAbi([
    "function admin() view returns (address)",
    "function pendingAdmin() view returns (address)",
    "function keeper() view returns (address)",
    "function treasury() view returns (address)",
    "function pendingTreasury() view returns (address)",
    "function paymentRouter() view returns (address)",
    "function paymentToken() view returns (address)",
    "function swapAdapter() view returns (address)",
    "function lifetimeVault() view returns (address)",
  ]),
] as const;
const adapterAbi = parseAbi([
  "function admin() view returns (address)",
  "function pendingAdmin() view returns (address)",
  "function configurationGuard() view returns (address)",
]);
const routerAbi = parseAbi([
  "function operator() view returns (address)",
  "function paymentToken() view returns (address)",
]);
const vaultAbi = parseAbi(["function manager() view returns (address)"]);
const rewardRouterAbi = parseAbi([
  "function lifetimeVault() view returns (address)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

const manifestPath = path.resolve(required("KEYGAME_DEPLOYMENT_MANIFEST"));
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  chainId: number;
  sourceCommit: string;
  deploymentBlock: number;
  mockOnly: boolean;
  contracts: Record<string, Address>;
  roles: Record<string, Address | null>;
  rpc: {
    primary: string;
    fallback?: string;
    policy?: string;
    referenceUse?: string;
    automaticFailover?: boolean;
  };
  market: {
    quoteToken: Address;
    approvedCatalog: Array<{
      symbol: string;
      stockToken: Address;
      pool: Address;
    }>;
  };
};
if (manifest.chainId !== 4663 || manifest.mockOnly) {
  throw new Error(
    "Read-only launch verification requires a value-bearing chain-4663 manifest.",
  );
}
const rpcPolicy = assertMainnetLanOnlyRpcPolicy({
  ...manifest.rpc,
  fallback:
    manifest.rpc.fallback ?? required("ROBINHOOD_MAINNET_FALLBACK_RPC_URL"),
});
const primary = createPublicClient({
  chain: robinhoodChainMainnet,
  transport: http(rpcPolicy.primaryUrl),
});
const reference = createPublicClient({
  chain: robinhoodChainMainnet,
  transport: http(rpcPolicy.referenceUrl),
});
const [primaryChain, referenceChain, primaryHead, referenceHead] =
  await Promise.all([
    primary.getChainId(),
    reference.getChainId(),
    primary.getBlockNumber(),
    reference.getBlockNumber(),
  ]);
if (primaryChain !== 4663 || referenceChain !== 4663)
  throw new Error("RPC chain mismatch.");
const headDelta =
  primaryHead > referenceHead
    ? primaryHead - referenceHead
    : referenceHead - primaryHead;
if (headDelta > 5n)
  throw new Error("RPC heads differ by more than five blocks.");
const commonHead = primaryHead < referenceHead ? primaryHead : referenceHead;
const [primaryBlock, referenceBlock] = await Promise.all([
  primary.getBlock({ blockNumber: commonHead }),
  reference.getBlock({ blockNumber: commonHead }),
]);
if (primaryBlock.hash !== referenceBlock.hash)
  throw new Error("RPC providers disagree on the canonical block.");

const contracts = Object.fromEntries(
  Object.entries(manifest.contracts).filter(
    ([, value]) => value && value !== zeroAddress,
  ),
) as Record<string, Address>;
const codeEvidence: Record<
  string,
  { address: Address; runtimeCodeHash: string }
> = {};
for (const [name, address] of Object.entries(contracts)) {
  const code = await primary.getCode({ address });
  if (!code || code === "0x")
    throw new Error(`${name} has no runtime bytecode.`);
  codeEvidence[name] = { address, runtimeCodeHash: keccak256(code) };
}

const manager = getAddress(contracts.manager);
const adapter = getAddress(contracts.swapAdapter);
const paymentRouter = getAddress(contracts.paymentRouter);
const vault = getAddress(contracts.lifetimePointsVault);
const rewardRouter = getAddress(contracts.rewardRouter);
const paymentToken = getAddress(contracts.paymentToken);
const [
  admin,
  pendingAdmin,
  keeper,
  treasury,
  pendingTreasury,
  managerRouter,
  managerToken,
  managerAdapter,
  managerVault,
  marketAdmin,
  pendingMarketAdmin,
  configurationGuard,
  routerOperator,
  routerToken,
  vaultManager,
  rewardVault,
  activeRound,
] = await Promise.all([
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "admin",
  }),
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "pendingAdmin",
  }),
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "keeper",
  }),
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "treasury",
  }),
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "pendingTreasury",
  }),
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "paymentRouter",
  }),
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "paymentToken",
  }),
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "swapAdapter",
  }),
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "lifetimeVault",
  }),
  primary.readContract({
    address: adapter,
    abi: adapterAbi,
    functionName: "admin",
  }),
  primary.readContract({
    address: adapter,
    abi: adapterAbi,
    functionName: "pendingAdmin",
  }),
  primary.readContract({
    address: adapter,
    abi: adapterAbi,
    functionName: "configurationGuard",
  }),
  primary.readContract({
    address: paymentRouter,
    abi: routerAbi,
    functionName: "operator",
  }),
  primary.readContract({
    address: paymentRouter,
    abi: routerAbi,
    functionName: "paymentToken",
  }),
  primary.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "manager",
  }),
  primary.readContract({
    address: rewardRouter,
    abi: rewardRouterAbi,
    functionName: "lifetimeVault",
  }),
  primary.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "activeRound",
  }),
]);
const expectedRole = getAddress(manifest.roles.managerAdmin!);
const relationshipsPass =
  [admin, keeper, treasury, marketAdmin].every(
    (value) => getAddress(value) === expectedRole,
  ) &&
  pendingAdmin === zeroAddress &&
  pendingTreasury === zeroAddress &&
  pendingMarketAdmin === zeroAddress &&
  getAddress(managerRouter) === paymentRouter &&
  getAddress(managerToken) === paymentToken &&
  getAddress(managerAdapter) === adapter &&
  getAddress(managerVault) === vault &&
  getAddress(configurationGuard) === manager &&
  getAddress(routerOperator) === manager &&
  getAddress(routerToken) === paymentToken &&
  getAddress(vaultManager) === manager &&
  getAddress(rewardVault) === vault;
if (!relationshipsPass)
  throw new Error("Deployed contract or role relationship mismatch.");
if (activeRound === zeroAddress)
  throw new Error("No initial round is prepared.");
const [roundId, startedAt, acceptedClaims] = await Promise.all([
  primary.readContract({
    address: activeRound,
    abi: lastBellV4Abi,
    functionName: "roundId",
  }),
  primary.readContract({
    address: activeRound,
    abi: lastBellV4Abi,
    functionName: "startedAt",
  }),
  primary.readContract({
    address: activeRound,
    abi: lastBellV4Abi,
    functionName: "acceptedClaims",
  }),
]);
if (startedAt !== 0n || acceptedClaims !== 0n)
  throw new Error("Initial round is not in zero-call entry state.");

const custodyAddresses = [
  manager,
  paymentRouter,
  vault,
  rewardRouter,
  activeRound,
];
const custodyTokens = [
  manifest.market.quoteToken,
  ...manifest.market.approvedCatalog.map((item) => item.stockToken),
];
const custody: Array<{ token: Address; holder: Address; balance: string }> = [];
for (const token of custodyTokens) {
  for (const holder of custodyAddresses) {
    const balance = await primary.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [holder],
    });
    custody.push({ token, holder, balance: balance.toString() });
    if (balance !== 0n)
      throw new Error(`Unexpected pre-launch custody at ${holder}.`);
  }
}

const appUrl = required("KEYGAME_MAINNET_APP_URL").replace(/\/$/, "");
const [statusResponse, snapshotResponse] = await Promise.all([
  fetch(`${appUrl}/api/status`),
  fetch(`${appUrl}/api/game/snapshot`),
]);
if (!statusResponse.ok || !snapshotResponse.ok)
  throw new Error("Mainnet application APIs are not healthy.");
const status = (await statusResponse.json()) as {
  ok: boolean;
  chainId: number;
  indexer?: { lag: number };
  rpc?: {
    policy?: string;
    activeProvider?: string;
    connectionStatus?: string;
    automaticFailover?: boolean;
  };
};
const snapshot = (await snapshotResponse.json()) as {
  ok: boolean;
  chainId: number;
  state?: { contractAddress?: Address; startedAt?: number; claims?: unknown[] };
};
if (
  !status.ok ||
  status.chainId !== 4663 ||
  status.rpc?.policy !== "LAN_ONLY" ||
  status.rpc?.activeProvider !== "lan" ||
  status.rpc?.connectionStatus !== "healthy" ||
  status.rpc?.automaticFailover !== false ||
  (status.indexer?.lag ?? Number.MAX_SAFE_INTEGER) > 3
) {
  throw new Error(
    "Mainnet status or indexer lag failed read-only verification.",
  );
}
if (
  !snapshot.ok ||
  snapshot.chainId !== 4663 ||
  getAddress(snapshot.state?.contractAddress ?? zeroAddress) !==
    getAddress(activeRound) ||
  snapshot.state?.startedAt !== 0 ||
  (snapshot.state?.claims?.length ?? -1) !== 0
) {
  throw new Error(
    "Mainnet API snapshot does not match the unstarted active round.",
  );
}

const evidence = {
  label: "MAINNET READ-ONLY LAUNCH VERIFICATION · GAMEPLAY NOT PRETESTED",
  generatedAt: new Date().toISOString(),
  sourceCommit: manifest.sourceCommit,
  manifestSha256: sha256(manifestBytes),
  chainId: 4663,
  launchValidation: "READ_ONLY",
  transactionsSubmitted: 0,
  rpc: {
    policy: "LAN_ONLY",
    activeProvider: "lan",
    referenceUse: "HEALTH_CHECK_ONLY",
    automaticFailover: false,
    primaryHead: primaryHead.toString(),
    referenceHead: referenceHead.toString(),
    commonBlockHash: primaryBlock.hash,
  },
  codeEvidence,
  roles: {
    admin,
    keeper,
    treasury,
    marketAdmin,
    pendingAdmin,
    pendingTreasury,
    pendingMarketAdmin,
  },
  relationshipsPass,
  initialRound: {
    address: activeRound,
    roundId: roundId.toString(),
    startedAt: "0",
    acceptedClaims: "0",
  },
  custody,
  application: {
    url: appUrl,
    statusOk: true,
    snapshotMatches: true,
    indexerLag: status.indexer!.lag,
  },
  browserWalletCompatibility: "UNVERIFIED",
  promotionRequiresSeparateAuthorization: true,
};
const output =
  process.env.KEYGAME_MAINNET_READ_ONLY_REPORT ??
  path.join("artifacts", "mainnet-release", "read-only-verification.json");
await mkdir(path.dirname(output), { recursive: true });
const json = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(output, json, "utf8");
await writeFile(
  `${output}.sha256`,
  `${sha256(json)}  ${path.basename(output)}\n`,
  "utf8",
);
process.stdout.write(json);
