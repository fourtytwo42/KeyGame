export type RobinhoodNetwork = "testnet" | "mainnet";

type RpcEndpointSet = {
  primary: string;
  fallback: string;
};

export type LanRpcHealth = {
  status: "healthy" | "degraded";
  primaryHead?: bigint;
  referenceHead?: bigint;
  lag?: bigint;
  reason?: "PRIMARY_UNAVAILABLE" | "PRIMARY_BEHIND" | "REFERENCE_UNAVAILABLE";
};

export const MAX_LAN_HEAD_LAG = 5n;

const defaults: Record<RobinhoodNetwork, RpcEndpointSet> = {
  testnet: {
    primary: "http://192.168.50.117:8547",
    fallback: "https://rpc.testnet.chain.robinhood.com",
  },
  mainnet: {
    primary: "http://192.168.50.173:8547",
    fallback: "https://rpc.mainnet.chain.robinhood.com",
  },
};

const url = (name: string, value: string) => {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(
      `SAVED BY THE BELL RPC CONFIGURATION ERROR: ${name} is invalid.`,
    );
  }
};

export function readRpcEndpoints(
  network: RobinhoodNetwork,
  source: Partial<NodeJS.ProcessEnv> = process.env,
): RpcEndpointSet {
  const prefix =
    network === "mainnet" ? "ROBINHOOD_MAINNET" : "ROBINHOOD_TESTNET";
  return {
    primary: url(
      `${prefix}_RPC_URL`,
      source[`${prefix}_RPC_URL`] || defaults[network].primary,
    ),
    fallback: url(
      `${prefix}_FALLBACK_RPC_URL`,
      source[`${prefix}_FALLBACK_RPC_URL`] || defaults[network].fallback,
    ),
  };
}

export function isRobinhoodNetwork(value: string): value is RobinhoodNetwork {
  return value === "testnet" || value === "mainnet";
}

async function rpcBlockNumber(endpoint: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "last-bell-lan-health",
      method: "eth_blockNumber",
      params: [],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(2_500),
  });
  if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}.`);
  const payload = (await response.json()) as { result?: string };
  if (!payload.result) throw new Error("RPC omitted its block number.");
  return BigInt(payload.result);
}

export function classifyLanRpcHealth(input: {
  primaryHead?: bigint;
  referenceHead?: bigint;
  primaryAvailable: boolean;
  referenceAvailable: boolean;
}): LanRpcHealth {
  if (!input.primaryAvailable || input.primaryHead === undefined) {
    return {
      status: "degraded",
      referenceHead: input.referenceHead,
      reason: "PRIMARY_UNAVAILABLE",
    };
  }
  if (!input.referenceAvailable || input.referenceHead === undefined) {
    return {
      status: "healthy",
      primaryHead: input.primaryHead,
      reason: "REFERENCE_UNAVAILABLE",
    };
  }
  const lag =
    input.referenceHead > input.primaryHead
      ? input.referenceHead - input.primaryHead
      : 0n;
  return {
    status: lag > MAX_LAN_HEAD_LAG ? "degraded" : "healthy",
    primaryHead: input.primaryHead,
    referenceHead: input.referenceHead,
    lag,
    ...(lag > MAX_LAN_HEAD_LAG ? { reason: "PRIMARY_BEHIND" as const } : {}),
  };
}

/**
 * The secondary endpoint is observational only. This function may compare its
 * block height with the LAN node, but no application read, write, or signed
 * transaction is ever routed through it.
 */
export async function assessLanRpcHealth(
  endpoints: RpcEndpointSet,
): Promise<LanRpcHealth> {
  const [primary, reference] = await Promise.allSettled([
    rpcBlockNumber(endpoints.primary),
    rpcBlockNumber(endpoints.fallback),
  ]);
  return classifyLanRpcHealth({
    primaryAvailable: primary.status === "fulfilled",
    primaryHead: primary.status === "fulfilled" ? primary.value : undefined,
    referenceAvailable: reference.status === "fulfilled",
    referenceHead:
      reference.status === "fulfilled" ? reference.value : undefined,
  });
}
