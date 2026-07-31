import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createPublicClient, http, keccak256, parseAbi } from "viem";
import {
  ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_UNISWAP_V3_FACTORY,
  ROBINHOOD_USDG,
  pinnedDexMarkets,
} from "../src/lib/game/dex-config";
import { robinhoodChainMainnet } from "../src/lib/web3/chains";
import {
  mainnetDexClient,
  readDexObservation,
} from "../services/dex-observation";

type RobinhoodAsset = {
  tokenSymbol: string;
  status: string;
  deployments: Array<{ chainId: number; contractAddress: string }>;
};

const rpc =
  process.env.ROBINHOOD_MAINNET_RPC_URL ?? "http://192.168.50.173:8547";
const client = createPublicClient({
  chain: robinhoodChainMainnet,
  transport: http(rpc, { timeout: 5_000 }),
});
const factoryAbi = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
]);
const metadataAbi = parseAbi(["function decimals() view returns (uint8)"]);
const poolAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

function normalized(value: string) {
  return value.toLowerCase();
}

const syncingRequest = fetch(rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_syncing",
    params: [],
  }),
  signal: AbortSignal.timeout(5_000),
}).then(
  async (response) =>
    (await response.json()) as { result?: boolean | Record<string, string> },
);
const [chainId, syncing, head, templateText, assetsResponse] =
  await Promise.all([
    client.getChainId(),
    syncingRequest,
    client.getBlock(),
    readFile("deployments/4663.template.json", "utf8"),
    fetch(
      process.env.ROBINHOOD_STOCK_TOKEN_API_URL
        ? `${process.env.ROBINHOOD_STOCK_TOKEN_API_URL}/assets`
        : "https://api.robinhood.com/rhj/assets",
      {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { "user-agent": "KeyGame-MainnetPreflight/1.0" },
      },
    ),
  ]);
if (chainId !== ROBINHOOD_MAINNET_CHAIN_ID || syncing.result !== false) {
  throw new Error("Robinhood mainnet RPC is not synchronized chain 4663.");
}
if (!assetsResponse.ok) {
  throw new Error(
    `Robinhood asset registry returned ${assetsResponse.status}.`,
  );
}
const payload = (await assetsResponse.json()) as { assets: RobinhoodAsset[] };
const bySymbol = new Map(
  payload.assets.map((asset) => [asset.tokenSymbol, asset]),
);

const baseContracts = [
  ["factory", ROBINHOOD_UNISWAP_V3_FACTORY],
  ["usdg", ROBINHOOD_USDG],
] as const;
const codeEvidence = [];
for (const [name, address] of baseContracts) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new Error(`${name} has no bytecode.`);
  codeEvidence.push({ name, address, runtimeCodeHash: keccak256(code) });
}
const usdgDecimals = await client.readContract({
  address: ROBINHOOD_USDG,
  abi: metadataAbi,
  functionName: "decimals",
});
if (usdgDecimals !== 6) throw new Error("Canonical USDG is not 6 decimals.");

const markets = [];
const dexClient = mainnetDexClient();
for (const market of pinnedDexMarkets) {
  const official = bySymbol.get(market.symbol);
  const canonical = official?.deployments.find(
    (deployment) => deployment.chainId === ROBINHOOD_MAINNET_CHAIN_ID,
  )?.contractAddress;
  if (
    official?.status !== "ASSET_STATUS_ACTIVE" ||
    !canonical ||
    normalized(canonical) !== normalized(market.stockToken)
  ) {
    throw new Error(
      `${market.symbol} canonical registry mismatch or inactive.`,
    );
  }
  const [pool, stockDecimals, tokens, stockCode, poolCode, observation] =
    await Promise.all([
      client.readContract({
        address: ROBINHOOD_UNISWAP_V3_FACTORY,
        abi: factoryAbi,
        functionName: "getPool",
        args: [market.stockToken, ROBINHOOD_USDG, market.feeTier],
      }),
      client.readContract({
        address: market.stockToken,
        abi: metadataAbi,
        functionName: "decimals",
      }),
      Promise.all([
        client.readContract({
          address: market.pool,
          abi: poolAbi,
          functionName: "token0",
        }),
        client.readContract({
          address: market.pool,
          abi: poolAbi,
          functionName: "token1",
        }),
      ]),
      client.getCode({ address: market.stockToken }),
      client.getCode({ address: market.pool }),
      readDexObservation(market, dexClient),
    ]);
  if (
    normalized(pool) !== normalized(market.pool) ||
    stockDecimals !== 18 ||
    !stockCode ||
    stockCode === "0x" ||
    !poolCode ||
    poolCode === "0x" ||
    !tokens.map(normalized).includes(normalized(ROBINHOOD_USDG)) ||
    !tokens.map(normalized).includes(normalized(market.stockToken))
  ) {
    throw new Error(`${market.symbol} failed canonical pool identity checks.`);
  }
  markets.push({
    symbol: market.symbol,
    stockToken: market.stockToken,
    pool: market.pool,
    feeTier: market.feeTier,
    stockCodeHash: keccak256(stockCode),
    poolCodeHash: keccak256(poolCode),
    sourceBlockNumber: observation.sourceBlockNumber.toString(),
    sourceBlockHash: observation.sourceBlockHash,
    usdgDepth: observation.usdgDepth,
    buyImpactBps: observation.buyImpactBps,
    sellImpactBps: observation.sellImpactBps,
    spotTwapDeviationBps: observation.spotTwapDeviationBps,
    eligible: observation.safe,
    exclusionReasons: observation.reasons,
  });
}
const safeSymbols = markets
  .filter((market) => market.eligible)
  .map((market) => market.symbol);
if (safeSymbols.length < 4) {
  throw new Error(
    `Only ${safeSymbols.length} catalog markets are currently safe; four are required.`,
  );
}

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const sourceStatus = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
}).trim();
const evidence = {
  ok: true,
  checkedAt: new Date().toISOString(),
  chainId,
  head: head.number.toString(),
  headHash: head.hash,
  sourceCommit,
  sourceClean: sourceStatus.length === 0,
  templateSha256: createHash("sha256").update(templateText).digest("hex"),
  contracts: codeEvidence,
  markets,
  safeSymbols,
  broadcastAuthorized: false,
};
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
