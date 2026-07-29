import { NextRequest, NextResponse } from "next/server";
import {
  isRobinhoodNetwork,
  readRpcEndpoints,
  type RobinhoodNetwork,
} from "@/lib/web3/rpc-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_HEAD_LAG = 5n;
const HEALTH_TTL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 8_000;

const allowedMethods = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "eth_sendRawTransaction",
  "net_version",
  "web3_clientVersion",
]);

type Health = {
  checkedAt: number;
  usePrimary: boolean;
};

const healthByNetwork = new Map<RobinhoodNetwork, Health>();

const rpcFetch = async (endpoint: string, body: string, timeoutMs: number) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`RPC upstream returned HTTP ${response.status}.`);
  }
  return response;
};

const blockNumber = async (endpoint: string) => {
  const response = await rpcFetch(
    endpoint,
    JSON.stringify({
      jsonrpc: "2.0",
      id: "last-bell-health",
      method: "eth_blockNumber",
      params: [],
    }),
    2_500,
  );
  const payload = (await response.json()) as { result?: string };
  if (!payload.result) throw new Error("RPC upstream omitted block number.");
  return BigInt(payload.result);
};

const shouldUsePrimary = async (
  network: RobinhoodNetwork,
  primary: string,
  fallback: string,
) => {
  const cached = healthByNetwork.get(network);
  if (cached && Date.now() - cached.checkedAt < HEALTH_TTL_MS) {
    return cached.usePrimary;
  }

  let usePrimary = false;
  try {
    const [primaryHead, fallbackHead] = await Promise.all([
      blockNumber(primary),
      blockNumber(fallback),
    ]);
    usePrimary = primaryHead + MAX_HEAD_LAG >= fallbackHead;
  } catch {
    try {
      await blockNumber(primary);
      usePrimary = true;
    } catch {
      usePrimary = false;
    }
  }

  healthByNetwork.set(network, { checkedAt: Date.now(), usePrimary });
  return usePrimary;
};

const methodsFrom = (payload: unknown): string[] => {
  const requests = Array.isArray(payload) ? payload : [payload];
  return requests.map((request) => {
    if (
      typeof request !== "object" ||
      request === null ||
      !("method" in request) ||
      typeof request.method !== "string"
    ) {
      throw new Error("Malformed JSON-RPC request.");
    }
    return request.method;
  });
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ network: string }> },
) {
  const { network } = await context.params;
  if (!isRobinhoodNetwork(network)) {
    return NextResponse.json({ error: "Unknown network." }, { status: 404 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "RPC request is too large." },
      { status: 413 },
    );
  }

  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "RPC request is too large." },
      { status: 413 },
    );
  }

  try {
    const methods = methodsFrom(JSON.parse(body));
    if (methods.some((method) => !allowedMethods.has(method))) {
      return NextResponse.json(
        { error: "RPC method is not allowed." },
        { status: 403 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid JSON-RPC request.",
      },
      { status: 400 },
    );
  }

  const endpoints = readRpcEndpoints(network);
  const primaryHealthy = await shouldUsePrimary(
    network,
    endpoints.primary,
    endpoints.fallback,
  );
  const ordered = primaryHealthy
    ? [
        { endpoint: endpoints.primary, provider: "lan" },
        { endpoint: endpoints.fallback, provider: "fallback" },
      ]
    : [
        { endpoint: endpoints.fallback, provider: "fallback" },
        { endpoint: endpoints.primary, provider: "lan" },
      ];

  for (const { endpoint, provider } of ordered) {
    try {
      const response = await rpcFetch(endpoint, body, REQUEST_TIMEOUT_MS);
      return new NextResponse(await response.arrayBuffer(), {
        status: response.status,
        headers: {
          "content-type": "application/json",
          "x-last-bell-rpc-network": network,
          "x-last-bell-rpc-provider": provider,
        },
      });
    } catch {
      continue;
    }
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "All Robinhood RPC providers failed." },
    },
    { status: 502 },
  );
}
