import {
  createPublicClient,
  fallback,
  formatUnits,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { robinhoodChainMainnet } from "../src/lib/web3/chains";
import {
  MAX_QUOTE_IMPACT_BPS,
  MAX_SPOT_TWAP_DEVIATION_BPS,
  MIN_USDG_DEPTH,
  QUOTE_NOTIONAL_USDG,
  REQUIRED_HISTORY_SECONDS,
  ROBINHOOD_USDG,
  TWAP_WINDOW_SECONDS,
  dexMarketId,
  type PinnedDexMarket,
} from "../src/lib/game/dex-config";

const poolAbi = parseAbi([
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives,uint160[] secondsPerLiquidityCumulativeX128s)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const QUOTER = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7" as Address;

export type DexObservationResult = {
  marketId: Hex;
  symbol: string;
  pool: Address;
  stockToken: Address;
  feeTier: number;
  twapTick: number;
  spotTick: number;
  price: number;
  price18: bigint;
  observedAt: number;
  expiresAt: number;
  sourceBlockNumber: bigint;
  sourceBlockHash: Hex;
  liquidity: bigint;
  usdgDepth: number;
  buyImpactBps: number;
  sellImpactBps: number;
  spotTwapDeviationBps: number;
  sampleHistoryAvailable: boolean;
  safe: boolean;
  reasons: string[];
};

export function mainnetDexClient() {
  const primary =
    process.env.ROBINHOOD_MAINNET_RPC_URL ?? "http://192.168.50.173:8547";
  const backup =
    process.env.ROBINHOOD_MAINNET_FALLBACK_RPC_URL ??
    "https://rpc.mainnet.chain.robinhood.com";
  return createPublicClient({
    chain: robinhoodChainMainnet,
    transport: fallback([
      http(primary, { timeout: 3_000 }),
      http(backup, { timeout: 4_000 }),
    ]),
  });
}

export function meanTick(cumulatives: readonly bigint[]) {
  const delta = cumulatives[2] - cumulatives[1];
  let tick = delta / BigInt(TWAP_WINDOW_SECONDS);
  if (delta < 0n && delta % BigInt(TWAP_WINDOW_SECONDS) !== 0n) tick -= 1n;
  return Number(tick);
}

export function stockPriceFromTick(tick: number, stockToken: Address) {
  const rawToken1PerToken0 = Math.pow(1.0001, tick);
  return stockToken.toLowerCase() < ROBINHOOD_USDG.toLowerCase()
    ? rawToken1PerToken0 * 1e12
    : 1 / (rawToken1PerToken0 * 1e-12);
}

export async function readDexObservation(
  market: PinnedDexMarket,
  client = mainnetDexClient(),
): Promise<DexObservationResult> {
  const block = await client.getBlock();
  const [slot0, liquidity, usdgRaw, observed] = await Promise.all([
    client.readContract({
      address: market.pool,
      abi: poolAbi,
      functionName: "slot0",
    }),
    client.readContract({
      address: market.pool,
      abi: poolAbi,
      functionName: "liquidity",
    }),
    client.readContract({
      address: ROBINHOOD_USDG,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [market.pool],
    }),
    client
      .readContract({
        address: market.pool,
        abi: poolAbi,
        functionName: "observe",
        args: [[REQUIRED_HISTORY_SECONDS, TWAP_WINDOW_SECONDS, 0]],
      })
      .catch(() => undefined),
  ]);
  const reasons: string[] = [];
  if (!observed) reasons.push("30-minute observation history unavailable");
  const twapTick = observed ? meanTick(observed[0]) : Number(slot0[1]);
  const spotTick = Number(slot0[1]);
  const price = stockPriceFromTick(twapTick, market.stockToken);
  const usdgDepth = Number(formatUnits(usdgRaw, 6));
  const stockNotional = parseUnits(
    (QUOTE_NOTIONAL_USDG / price).toFixed(18),
    18,
  );
  let buyImpactBps = Number.POSITIVE_INFINITY;
  let sellImpactBps = Number.POSITIVE_INFINITY;
  try {
    const [buy, sell] = await Promise.all([
      client.simulateContract({
        address: QUOTER,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: ROBINHOOD_USDG,
            tokenOut: market.stockToken,
            amountIn: parseUnits(String(QUOTE_NOTIONAL_USDG), 6),
            fee: market.feeTier,
            sqrtPriceLimitX96: 0n,
          },
        ],
      }),
      client.simulateContract({
        address: QUOTER,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: market.stockToken,
            tokenOut: ROBINHOOD_USDG,
            amountIn: stockNotional,
            fee: market.feeTier,
            sqrtPriceLimitX96: 0n,
          },
        ],
      }),
    ]);
    const bought = Number(formatUnits(buy.result[0], 18));
    const soldFor = Number(formatUnits(sell.result[0], 6));
    buyImpactBps = Math.abs(QUOTE_NOTIONAL_USDG / bought / price - 1) * 10_000;
    sellImpactBps = Math.abs(soldFor / QUOTE_NOTIONAL_USDG - 1) * 10_000;
  } catch {
    reasons.push("two-sided 1,000 USDG quote unavailable");
  }
  const spotTwapDeviationBps =
    Math.abs(Math.pow(1.0001, spotTick - twapTick) - 1) * 10_000;
  if (liquidity === 0n) reasons.push("zero active liquidity");
  if (usdgDepth < MIN_USDG_DEPTH) reasons.push("USDG depth below 10,000");
  if (buyImpactBps > MAX_QUOTE_IMPACT_BPS)
    reasons.push("1,000 USDG buy impact above 1%");
  if (sellImpactBps > MAX_QUOTE_IMPACT_BPS)
    reasons.push("1,000 USDG sell impact above 1%");
  if (spotTwapDeviationBps > MAX_SPOT_TWAP_DEVIATION_BPS)
    reasons.push("spot/TWAP deviation above 1%");
  return {
    marketId: dexMarketId(market),
    symbol: market.symbol,
    pool: market.pool,
    stockToken: market.stockToken,
    feeTier: market.feeTier,
    twapTick,
    spotTick,
    price,
    price18: parseUnits(price.toFixed(18), 18),
    observedAt: Number(block.timestamp),
    expiresAt: Number(block.timestamp) + 15,
    sourceBlockNumber: block.number,
    sourceBlockHash: block.hash,
    liquidity,
    usdgDepth,
    buyImpactBps,
    sellImpactBps,
    spotTwapDeviationBps,
    sampleHistoryAvailable: Boolean(observed),
    safe: reasons.length === 0,
    reasons,
  };
}
