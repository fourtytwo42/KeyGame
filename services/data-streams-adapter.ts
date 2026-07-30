import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import {
  createClient,
  decodeReport,
  type Report,
} from "@chainlink/data-streams-sdk";
import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { lastBellAbi, roundManagerAbi } from "../src/lib/web3/last-bell-abi";
import {
  encryptedWalletFor,
  heartbeat,
  loadManifest,
  pool,
  publicClientFor,
} from "./common";

const PRICE_SCALE_DOWN = 10_000_000_000n;
const MAX_REPORT_AGE_SECONDS = 3;
const FUTURE_TOLERANCE_SECONDS = 1;
const attestorAbi = [
  {
    type: "function",
    name: "attestor",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

type NormalizedReport = {
  feedId: Hex;
  fullReport: Hex;
  price: bigint;
  validFrom: number;
  observedAt: number;
  expiresAt: number;
  sourceReportHash: Hex;
  version: "V8" | "V10";
  marketStatus: number;
};
let dataStreamsClient: ReturnType<typeof createClient> | undefined;
let outageSince: number | undefined;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function streamsClient() {
  dataStreamsClient ??= createClient({
    apiKey: required("CHAINLINK_CLIENT_ID"),
    userSecret: required("CHAINLINK_CLIENT_SECRET"),
    endpoint: required("CHAINLINK_API_URL"),
    wsEndpoint: required("CHAINLINK_WEBSOCKET_URL"),
    timeout: 2_000,
    retryAttempts: 1,
  });
  return dataStreamsClient;
}

function safeTokenMatches(actual: string | undefined, expected: string) {
  if (!actual?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(actual.slice(7));
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

export function normalizeReport(
  report: Report,
  decoded: ReturnType<typeof decodeReport>,
  nowSeconds = Math.floor(Date.now() / 1000),
): NormalizedReport {
  if (decoded.version !== "V8" && decoded.version !== "V10") {
    throw new Error(`Unsupported equity report schema ${decoded.version}`);
  }
  const price18 =
    decoded.version === "V8" ? decoded.midPrice : decoded.tokenizedPrice;
  const price = price18 / PRICE_SCALE_DOWN;
  const expiresAt = decoded.expiresAt;
  if (price <= 0n) throw new Error("The report price is not positive.");
  if (report.validFromTimestamp > report.observationsTimestamp) {
    throw new Error("The report validity window is malformed.");
  }
  if (report.observationsTimestamp > nowSeconds + FUTURE_TOLERANCE_SECONDS) {
    throw new Error("The report is future-dated.");
  }
  if (nowSeconds - report.observationsTimestamp > MAX_REPORT_AGE_SECONDS) {
    throw new Error("The report is stale.");
  }
  if (expiresAt < nowSeconds) throw new Error("The report has expired.");
  if (!isHex(report.fullReport) || !isHex(report.feedID)) {
    throw new Error("The report contains malformed hex.");
  }
  return {
    feedId: report.feedID as Hex,
    fullReport: report.fullReport as Hex,
    price,
    validFrom: report.validFromTimestamp,
    observedAt: report.observationsTimestamp,
    expiresAt,
    sourceReportHash: keccak256(report.fullReport as Hex),
    version: decoded.version,
    marketStatus: Number(decoded.marketStatus),
  };
}

async function acquire(
  feedId: Hex,
  round: Address,
  symbol?: string,
): Promise<NormalizedReport & { encoded: Hex }> {
  const manifest = await loadManifest();
  if (manifest.chainId !== 46630 || !manifest.mockOnly) {
    throw new Error(
      "The attestation adapter is restricted to mock-only testnet.",
    );
  }
  const source = await streamsClient().getLatestReport(feedId);
  if (source.feedID.toLowerCase() !== feedId.toLowerCase()) {
    throw new Error("Chainlink returned the wrong feed.");
  }
  const normalized = normalizeReport(
    source,
    decodeReport(source.fullReport, source.feedID),
  );
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
  const domain = {
    name: "Last Bell Testnet Market Attestation",
    version: "1",
    chainId: manifest.chainId,
    verifyingContract: manifest.contracts.marketVerifier,
  };
  const types = {
    MarketReport: [
      { name: "feedId", type: "bytes32" },
      { name: "price", type: "uint256" },
      { name: "validFrom", type: "uint64" },
      { name: "observedAt", type: "uint64" },
      { name: "expiresAt", type: "uint64" },
      { name: "round", type: "address" },
      { name: "sourceReportHash", type: "bytes32" },
    ],
  };
  const signature = await wallet.signTypedData(domain, types, {
    feedId: normalized.feedId,
    price: normalized.price,
    validFrom: normalized.validFrom,
    observedAt: normalized.observedAt,
    expiresAt: normalized.expiresAt,
    round,
    sourceReportHash: normalized.sourceReportHash,
  });
  const encoded = encodeAbiParameters(
    parseAbiParameters(
      "(bytes32 feedId,uint256 price,uint64 validFrom,uint64 observedAt,uint64 expiresAt,address round,bytes32 sourceReportHash,bytes signature)",
    ),
    [
      {
        feedId: normalized.feedId,
        price: normalized.price,
        validFrom: BigInt(normalized.validFrom),
        observedAt: BigInt(normalized.observedAt),
        expiresAt: BigInt(normalized.expiresAt),
        round,
        sourceReportHash: normalized.sourceReportHash,
        signature: signature as Hex,
      },
    ],
  );
  await pool.query(
    `INSERT INTO market_reports(
       source_report_hash,symbol,feed_id,price,valid_from,observed_at,expires_at,
       verifier_type,round_address,metadata)
     VALUES($1,$2,$3,$4,to_timestamp($5),to_timestamp($6),to_timestamp($7),
       'testnet-attested',$8,$9)
     ON CONFLICT(source_report_hash) DO UPDATE SET
       metadata=excluded.metadata`,
    [
      normalized.sourceReportHash,
      symbol ?? feedId,
      feedId,
      normalized.price.toString(),
      normalized.validFrom,
      normalized.observedAt,
      normalized.expiresAt,
      round,
      JSON.stringify({
        reportVersion: normalized.version,
        marketStatus: normalized.marketStatus,
      }),
    ],
  );
  return { ...normalized, encoded };
}

function responsePayload(report: NormalizedReport & { encoded: Hex }) {
  return {
    report: report.encoded,
    price: Number(report.price),
    validFrom: report.validFrom,
    observedAt: report.observedAt,
    expiresAt: report.expiresAt,
    sourceReportHash: report.sourceReportHash,
    verifierType: "testnet-attested",
    reportVersion: report.version,
    marketStatus: report.marketStatus,
  };
}

async function handle(url: URL) {
  const roundValue = url.searchParams.get("round");
  if (!roundValue || !isAddress(roundValue)) {
    throw new Error("A valid round address is required.");
  }
  const round = getAddress(roundValue);
  if (url.searchParams.get("opening") === "true") {
    const feeds = (url.searchParams.get("feeds") ?? "").split(",");
    if (
      feeds.length !== 4 ||
      feeds.some((feed) => !/^0x[0-9a-fA-F]{64}$/.test(feed))
    ) {
      throw new Error("Exactly four valid opening feed IDs are required.");
    }
    const reports = await Promise.all(
      feeds.map((feed) => acquire(feed as Hex, round)),
    );
    return { reports: reports.map((report) => report.encoded) };
  }

  const ticker = url.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) throw new Error("A ticker is required.");
  const feedMap = JSON.parse(
    process.env.DATA_STREAMS_FEED_MAP_JSON || "{}",
  ) as Record<string, string>;
  const feed = feedMap[ticker];
  if (!feed || !/^0x[0-9a-fA-F]{64}$/.test(feed)) {
    throw new Error(`${ticker} has no configured Data Streams feed.`);
  }
  return responsePayload(await acquire(feed as Hex, round, ticker));
}

async function main() {
  const manifest = await loadManifest();
  const token = required("DATA_STREAMS_REPORT_ADAPTER_TOKEN");
  const host = process.env.DATA_STREAMS_ADAPTER_HOST || "127.0.0.1";
  const port = Number(process.env.DATA_STREAMS_ADAPTER_PORT || 8787);
  const server = createServer(async (request, response) => {
    response.setHeader("content-type", "application/json");
    if (!safeTokenMatches(request.headers.authorization, token)) {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: "Unauthorized." }));
      return;
    }
    try {
      const payload = await handle(
        new URL(request.url || "/", `http://${host}:${port}`),
      );
      response.statusCode = 200;
      response.end(JSON.stringify(payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await heartbeat("data-streams-adapter", manifest.chainId, "error", {
        message,
      }).catch(() => undefined);
      response.statusCode = 503;
      response.end(JSON.stringify({ error: message }));
    }
  });
  server.listen(port, host, async () => {
    await heartbeat("data-streams-adapter", manifest.chainId, "ok", {
      host,
      port,
    });
    process.stdout.write(`Data Streams adapter listening on ${host}:${port}\n`);
  });
  const monitor = async () => {
    try {
      const publicClient = publicClientFor(manifest);
      const active = await publicClient.readContract({
        address: manifest.contracts.manager,
        abi: roundManagerAbi,
        functionName: "activeRound",
      });
      if (active === "0x0000000000000000000000000000000000000000") {
        outageSince = undefined;
        await heartbeat("data-streams-adapter", manifest.chainId, "ok", {
          available: 0,
          total: 0,
        });
        return;
      }
      const mode = await publicClient.readContract({
        address: active,
        abi: lastBellAbi,
        functionName: "marketMode",
      });
      if (Number(mode) === 0) {
        outageSince = undefined;
        await heartbeat("data-streams-adapter", manifest.chainId, "ok", {
          available: 4,
          total: 4,
          flatMode: true,
        });
        return;
      }
      const configs = await Promise.all(
        [0n, 1n, 2n, 3n].map((index) =>
          publicClient.readContract({
            address: active,
            abi: lastBellAbi,
            functionName: "tickerConfigs",
            args: [index],
          }),
        ),
      );
      const checks = await Promise.allSettled(
        configs.map(async (config) => {
          const report = await streamsClient().getLatestReport(config[2]);
          return normalizeReport(
            report,
            decodeReport(report.fullReport, report.feedID),
          );
        }),
      );
      const available = checks.filter(
        (check) => check.status === "fulfilled",
      ).length;
      if (available === 0) outageSince ??= Math.floor(Date.now() / 1000);
      else outageSince = undefined;
      await heartbeat(
        "data-streams-adapter",
        manifest.chainId,
        available === 0 ? "error" : "ok",
        { available, total: 4, outageSince },
      );
    } catch (error) {
      outageSince ??= Math.floor(Date.now() / 1000);
      await heartbeat("data-streams-adapter", manifest.chainId, "error", {
        available: 0,
        total: 4,
        outageSince,
        message: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    }
  };
  void monitor();
  setInterval(() => void monitor(), 3_000).unref();
}

if (process.env.NODE_ENV !== "test") {
  await main();
}
