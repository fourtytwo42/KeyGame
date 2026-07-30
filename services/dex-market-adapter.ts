import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import {
  dexMarketId,
  pinnedDexMarkets,
  TWAP_WINDOW_SECONDS,
} from "../src/lib/game/dex-config";
import { lastBellAbi, roundManagerAbi } from "../src/lib/web3/last-bell-abi";
import {
  encryptedWalletFor,
  heartbeat,
  loadManifest,
  pool,
  publicClientFor,
} from "./common";
import { mainnetDexClient, readDexObservation } from "./dex-observation";

const attestorAbi = [
  {
    type: "function",
    name: "attestor",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;
const marketById = new Map(
  pinnedDexMarkets.map((market) => [dexMarketId(market).toLowerCase(), market]),
);
let outageSince: number | undefined;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeTokenMatches(actual: string | undefined, expected: string) {
  if (!actual?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(actual.slice(7));
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

async function acquire(marketId: Hex, round: Address, symbol?: string) {
  const manifest = await loadManifest();
  if (manifest.chainId !== 46630 || !manifest.mockOnly) {
    throw new Error("DEX attestations are restricted to mock-only testnet.");
  }
  const market = marketById.get(marketId.toLowerCase());
  if (!market) throw new Error("The market is not in the pinned DEX manifest.");
  const observation = await readDexObservation(market, mainnetDexClient());
  if (!observation.safe) {
    throw new Error(`Unsafe DEX market: ${observation.reasons.join("; ")}`);
  }
  const wallet = await encryptedWalletFor("attestor");
  const publicClient = publicClientFor(manifest);
  const configuredAttestor = await publicClient.readContract({
    address: manifest.contracts.marketVerifier,
    abi: attestorAbi,
    functionName: "attestor",
  });
  if (getAddress(wallet.address) !== getAddress(configuredAttestor)) {
    throw new Error("The encrypted attestor does not match the deployment.");
  }
  const validFrom = observation.observedAt - TWAP_WINDOW_SECONDS;
  const expiresAt =
    Math.max(observation.observedAt, Math.floor(Date.now() / 1000)) + 15;
  const sourceReportHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "bytes32,address,int24,uint256,uint256,uint64,bytes32,uint64",
      ),
      [
        observation.marketId,
        observation.pool,
        observation.twapTick,
        observation.price18,
        4663n,
        observation.sourceBlockNumber,
        observation.sourceBlockHash,
        BigInt(observation.observedAt),
      ],
    ),
  );
  const domain = {
    name: "Last Bell Testnet DEX Attestation",
    version: "1",
    chainId: manifest.chainId,
    verifyingContract: manifest.contracts.marketVerifier,
  };
  const types = {
    DexObservation: [
      { name: "marketId", type: "bytes32" },
      { name: "pool", type: "address" },
      { name: "twapTick", type: "int24" },
      { name: "price", type: "uint256" },
      { name: "sourceChainId", type: "uint256" },
      { name: "sourceBlockNumber", type: "uint64" },
      { name: "sourceBlockHash", type: "bytes32" },
      { name: "validFrom", type: "uint64" },
      { name: "observedAt", type: "uint64" },
      { name: "expiresAt", type: "uint64" },
      { name: "round", type: "address" },
      { name: "sourceReportHash", type: "bytes32" },
    ],
  };
  const message = {
    marketId: observation.marketId,
    pool: observation.pool,
    twapTick: observation.twapTick,
    price: observation.price18,
    sourceChainId: 4663n,
    sourceBlockNumber: observation.sourceBlockNumber,
    sourceBlockHash: observation.sourceBlockHash,
    validFrom,
    observedAt: observation.observedAt,
    expiresAt,
    round,
    sourceReportHash,
  };
  const signature = await wallet.signTypedData(domain, types, message);
  const encoded = encodeAbiParameters(
    parseAbiParameters(
      "(bytes32 marketId,address pool,int24 twapTick,uint256 price,uint256 sourceChainId,uint64 sourceBlockNumber,bytes32 sourceBlockHash,uint64 validFrom,uint64 observedAt,uint64 expiresAt,address round,bytes32 sourceReportHash,bytes signature)",
    ),
    [
      {
        ...message,
        validFrom: BigInt(validFrom),
        observedAt: BigInt(observation.observedAt),
        expiresAt: BigInt(expiresAt),
        signature: signature as Hex,
      },
    ],
  );
  await pool.query(
    `INSERT INTO market_reports(
       source_report_hash,symbol,price,valid_from,observed_at,expires_at,
       verifier_type,round_address,market_id,pool_address,source_chain_id,
       source_block_number,source_block_hash,metadata)
     VALUES($1,$2,$3,to_timestamp($4),to_timestamp($5),to_timestamp($6),
       'testnet-dex-attested',$7,$8,$9,4663,$10,$11,$12)
     ON CONFLICT(source_report_hash) DO UPDATE SET metadata=excluded.metadata`,
    [
      sourceReportHash,
      symbol ?? market.symbol,
      observation.price18.toString(),
      validFrom,
      observation.observedAt,
      expiresAt,
      round,
      observation.marketId,
      observation.pool,
      observation.sourceBlockNumber.toString(),
      observation.sourceBlockHash,
      JSON.stringify({
        twapTick: observation.twapTick,
        twapWindowSeconds: TWAP_WINDOW_SECONDS,
        safety: {
          usdgDepth: observation.usdgDepth,
          buyImpactBps: observation.buyImpactBps,
          sellImpactBps: observation.sellImpactBps,
          spotTwapDeviationBps: observation.spotTwapDeviationBps,
        },
      }),
    ],
  );
  return {
    report: encoded,
    marketId: observation.marketId,
    poolAddress: observation.pool,
    price: observation.price,
    twapTick: observation.twapTick,
    validFrom,
    observedAt: observation.observedAt,
    expiresAt,
    sourceBlockNumber: Number(observation.sourceBlockNumber),
    sourceBlockHash: observation.sourceBlockHash,
    sourceReportHash,
    verifierType: "testnet-dex-attested",
  };
}

async function handle(url: URL) {
  const roundValue = url.searchParams.get("round");
  if (!roundValue || !isAddress(roundValue)) {
    throw new Error("A valid round address is required.");
  }
  const round = getAddress(roundValue);
  if (url.searchParams.get("opening") === "true") {
    const markets = (url.searchParams.get("markets") ?? "").split(",");
    if (
      markets.length !== 4 ||
      markets.some((market) => !/^0x[0-9a-fA-F]{64}$/.test(market))
    ) {
      throw new Error("Exactly four valid opening market IDs are required.");
    }
    const reports = await Promise.all(
      markets.map((market) => acquire(market as Hex, round)),
    );
    return { reports: reports.map((report) => report.report) };
  }
  const ticker = url.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) throw new Error("A ticker is required.");
  const market = pinnedDexMarkets.find((candidate) => candidate.symbol === ticker);
  if (!market) throw new Error(`${ticker} has no safe direct DEX market.`);
  return acquire(dexMarketId(market), round, ticker);
}

async function monitor() {
  const manifest = await loadManifest();
  try {
    const client = publicClientFor(manifest);
    const active = await client.readContract({
      address: manifest.contracts.manager,
      abi: roundManagerAbi,
      functionName: "activeRound",
    });
    if (active === "0x0000000000000000000000000000000000000000") {
      outageSince = undefined;
      await heartbeat("dex-market", manifest.chainId, "ok", {
        available: 0,
        total: 0,
      });
      return;
    }
    const mode = await client.readContract({
      address: active,
      abi: lastBellAbi,
      functionName: "marketMode",
    });
    if (Number(mode) === 0) {
      outageSince = undefined;
      await heartbeat("dex-market", manifest.chainId, "ok", {
        available: 4,
        total: 4,
        flatMode: true,
      });
      return;
    }
    const configs = await Promise.all(
      [0n, 1n, 2n, 3n].map((index) =>
        client.readContract({
          address: active,
          abi: lastBellAbi,
          functionName: "tickerConfigs",
          args: [index],
        }),
      ),
    );
    const checks = await Promise.allSettled(
      configs.map((config) => {
        const market = marketById.get(config[2].toLowerCase());
        if (!market) throw new Error("Unpinned market");
        return readDexObservation(market, mainnetDexClient());
      }),
    );
    const available = checks.filter(
      (check) => check.status === "fulfilled" && check.value.safe,
    ).length;
    if (available === 0) outageSince ??= Math.floor(Date.now() / 1000);
    else outageSince = undefined;
    await heartbeat(
      "dex-market",
      manifest.chainId,
      available === 0 ? "error" : "ok",
      { available, total: 4, outageSince },
    );
  } catch (error) {
    outageSince ??= Math.floor(Date.now() / 1000);
    await heartbeat("dex-market", manifest.chainId, "error", {
      available: 0,
      total: 4,
      outageSince,
      message: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
  }
}

async function main() {
  const manifest = await loadManifest();
  const token = required("DEX_MARKET_ADAPTER_TOKEN");
  const host = process.env.DEX_MARKET_ADAPTER_HOST || "127.0.0.1";
  const port = Number(process.env.DEX_MARKET_ADAPTER_PORT || 8787);
  const server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (!safeTokenMatches(request.headers.authorization, token)) {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: "Unauthorized." }));
      return;
    }
    try {
      response.end(
        JSON.stringify(
          await handle(new URL(request.url || "/", `http://${host}:${port}`)),
        ),
      );
    } catch (error) {
      response.statusCode = 503;
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });
  server.listen(port, host, async () => {
    await heartbeat("dex-market", manifest.chainId, "ok", { host, port });
    process.stdout.write(`DEX market adapter listening on ${host}:${port}\n`);
  });
  void monitor();
  setInterval(() => void monitor(), 3_000).unref();
}

if (process.env.NODE_ENV !== "test") await main();
