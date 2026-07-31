import "server-only";

import {
  encodePacked,
  hexToString,
  keccak256,
  type Address,
  zeroAddress,
} from "viem";
import type { StockSwapQuote, TickerId } from "@/lib/game/types";
import { database } from "./db";
import { loadServerDeploymentWithKey } from "./deployment";
import { deploymentPublicClient } from "./rpc-client";
import {
  lastBellV4Abi,
  lifetimePointsVaultAbi,
  roundManagerV4Abi,
  stockSwapAdapterAbi,
} from "@/lib/web3/last-bell-abi";

const usd = (raw: bigint) => Number(raw) / 1e6;
const stock = (raw: bigint) => Number(raw) / 1e18;

export async function quoteV4Production(
  ticker: TickerId,
  amountUsd: number,
  slippageBps = 100,
): Promise<StockSwapQuote> {
  if (!Number.isFinite(amountUsd) || amountUsd < 1) {
    throw new Error("The minimum contribution is $1.");
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 100) {
    throw new Error("Execution slippage must be between 0 and 1%.");
  }
  const { manifest } = await loadServerDeploymentWithKey();
  if (
    manifest.contractVersion !== "last-bell-v4-stock-pot" ||
    !manifest.contracts.swapAdapter
  ) {
    throw new Error("The active deployment is not a v4 Stock Pot.");
  }
  const client = deploymentPublicClient(manifest);
  const active = await client.readContract({
    address: manifest.contracts.manager,
    abi: roundManagerV4Abi,
    functionName: "activeRound",
  });
  if (active === zeroAddress) throw new Error("No active round is prepared.");
  const indexes = [0n, 1n, 2n, 3n] as const;
  const configs = await Promise.all(
    indexes.map((index) =>
      client.readContract({
        address: active,
        abi: lastBellV4Abi,
        functionName: "tickerConfigs",
        args: [index],
      }),
    ),
  );
  const symbols = configs.map((config) =>
    hexToString(config[0], { size: 32 }).replace(/\0+$/g, ""),
  );
  const tickerIndex = symbols.findIndex(
    (symbol) => symbol.toUpperCase() === ticker.toUpperCase(),
  );
  if (tickerIndex < 0) throw new Error("Ticker is not in the active roster.");
  const amount = BigInt(Math.floor(amountUsd * 1e6));
  const token = configs[tickerIndex][2] as Address;
  const [output, multiplier, standings, block, metadata] = await Promise.all([
    client.readContract({
      address: manifest.contracts.swapAdapter,
      abi: stockSwapAdapterAbi,
      functionName: "quoteUsdgForStock",
      args: [token, amount],
    }),
    client.readContract({
      address: active,
      abi: lastBellV4Abi,
      functionName: "currentMultiplierBps",
      args: [tickerIndex],
    }),
    Promise.all(
      indexes.map((index) =>
        client.readContract({
          address: active,
          abi: lastBellV4Abi,
          functionName: "tickerPoints",
          args: [index],
        }),
      ),
    ),
    client.getBlock({ blockTag: "pending" }),
    database
      .query<{
        canonical_address: Address | null;
        market_id: `0x${string}` | null;
        pool_address: Address | null;
        fee_tier: number | null;
        twap_window_seconds: number | null;
        spot_twap_deviation_bps: string | null;
        pool_usdg_depth: string | null;
        buy_impact_bps: string | null;
        sell_impact_bps: string | null;
        dex_observed_at: Date | null;
        price: string | null;
        source_chain_id: number | null;
      }>(
        `SELECT a.canonical_address,a.market_id,a.pool_address,a.fee_tier,
                a.twap_window_seconds,a.spot_twap_deviation_bps,
                a.pool_usdg_depth,a.buy_impact_bps,a.sell_impact_bps,
                a.dex_observed_at,s.adjusted_mid AS price,a.source_chain_id
         FROM market_assets a
         LEFT JOIN LATERAL (
           SELECT adjusted_mid FROM market_samples
           WHERE symbol=a.symbol AND source='uniswap-v3-twap'
           ORDER BY sampled_at DESC LIMIT 1
         ) s ON true
         WHERE a.symbol=$1 LIMIT 1`,
        [symbols[tickerIndex]],
      )
      .then((result) => result.rows[0])
      .catch(() => undefined),
  ]);
  const projected = (amount * BigInt(multiplier)) / 10_000n;
  const resulting = standings.map((value, index) =>
    index === tickerIndex ? value + projected : value,
  );
  const leader = resulting.reduce(
    (best, value, index) => (value > resulting[best] ? index : best),
    0,
  );
  const currentLead = standings.reduce(
    (best, value) => (value > best ? value : best),
    0n,
  );
  return {
    ticker: symbols[tickerIndex],
    tickerIndex,
    usdgAmount: amountUsd,
    estimatedStockOut: stock(output),
    minimumStockOut: (
      (output * BigInt(10_000 - slippageBps)) /
      10_000n
    ).toString(),
    quoteBlock: Number(block.number),
    expiresAt: Number(block.timestamp) + 30,
    canonicalToken: metadata?.canonical_address ?? token,
    poolAddress: metadata?.pool_address ?? undefined,
    marketId: metadata?.market_id ?? undefined,
    feeTier: metadata?.fee_tier ?? undefined,
    twapWindowSeconds: metadata?.twap_window_seconds ?? 600,
    twapPriceUsd: metadata?.price ? Number(metadata.price) : undefined,
    executionDeviationBps: metadata?.spot_twap_deviation_bps
      ? Number(metadata.spot_twap_deviation_bps)
      : undefined,
    maximumExecutionDeviationBps: 100,
    usdgDepth: metadata?.pool_usdg_depth
      ? Number(metadata.pool_usdg_depth)
      : undefined,
    buyImpactBps: metadata?.buy_impact_bps
      ? Number(metadata.buy_impact_bps)
      : undefined,
    sellImpactBps: metadata?.sell_impact_bps
      ? Number(metadata.sell_impact_bps)
      : undefined,
    safetyObservedAt: metadata?.dex_observed_at
      ? Math.floor(metadata.dex_observed_at.getTime() / 1000)
      : undefined,
    priceSourceChainId: metadata?.source_chain_id ?? 4663,
    mockOnly: manifest.mockOnly,
    multiplierBps: Number(multiplier),
    projectedPoints: usd(projected),
    projectedLeader: symbols[leader],
    pointsToLead: Math.max(
      0,
      usd(currentLead - standings[tickerIndex]) + 0.000001,
    ),
  };
}

export async function getV4ProductionRewards(player: Address) {
  const { manifest, deploymentKey } = await loadServerDeploymentWithKey();
  const vault = manifest.contracts.lifetimePointsVault;
  const rewardRouter = manifest.contracts.rewardRouter;
  if (
    manifest.contractVersion !== "last-bell-v4-stock-pot" ||
    !vault ||
    !rewardRouter
  ) {
    throw new Error("The active deployment is not a v4 Stock Pot.");
  }
  const client = deploymentPublicClient(manifest);
  const catalog = await database
    .query<{
      symbol: string;
      token: Address;
      canonical_address: Address;
      price: string | null;
    }>(
      `SELECT a.symbol,
              CASE WHEN $1 THEN a.testnet_mock_address
                   ELSE a.canonical_address END AS token,
              a.canonical_address,
              s.adjusted_mid AS price
       FROM market_assets a
       LEFT JOIN LATERAL (
         SELECT adjusted_mid FROM market_samples
         WHERE symbol=a.symbol AND source='uniswap-v3-twap'
         ORDER BY sampled_at DESC LIMIT 1
       ) s ON true
       WHERE a.canonical_address IS NOT NULL
         AND (NOT $1 OR a.testnet_mock_address IS NOT NULL)
       ORDER BY a.symbol LIMIT 16`,
      [manifest.mockOnly],
    )
    .then((result) => result.rows);
  const [activePoints, pendingPoints, totalEligiblePoints] = await Promise.all([
    client.readContract({
      address: vault,
      abi: lifetimePointsVaultAbi,
      functionName: "activePoints",
      args: [player],
    }),
    client.readContract({
      address: vault,
      abi: lifetimePointsVaultAbi,
      functionName: "pendingPoints",
      args: [player],
    }),
    client.readContract({
      address: vault,
      abi: lifetimePointsVaultAbi,
      functionName: "totalActivePoints",
    }),
  ]);
  const perTicker = await Promise.all(
    catalog.map(async (asset) => ({
      ticker: asset.symbol,
      points: usd(
        await client.readContract({
          address: vault,
          abi: lifetimePointsVaultAbi,
          functionName: "tickerPointsOf",
          args: [
            player,
            keccak256(
              encodePacked(
                ["string", "address"],
                ["ROBINHOOD_CANONICAL", asset.canonical_address],
              ),
            ),
          ],
        }),
      ),
    })),
  );
  const tokens = await Promise.all(
    catalog.map(async (asset) => {
      const [claimable, claimed] = await Promise.all([
        client.readContract({
          address: vault,
          abi: lifetimePointsVaultAbi,
          functionName: "claimable",
          args: [player, asset.token],
        }),
        client.readContract({
          address: vault,
          abi: lifetimePointsVaultAbi,
          functionName: "totalClaimed",
          args: [player, asset.token],
        }),
      ]);
      const price = Number(asset.price ?? 0);
      return {
        ticker: asset.symbol,
        tokenAddress: asset.token,
        claimable: stock(claimable),
        claimed: stock(claimed),
        totalEarned: stock(claimable + claimed),
        estimatedUsd: stock(claimable) * price,
      };
    }),
  );
  const candidateRounds = await database
    .query<{ contract_address: Address }>(
      `SELECT r.contract_address
       FROM rounds r
       WHERE r.deployment_key=$1 AND r.state IN ('settled','cancelled')
         AND EXISTS (
           SELECT 1 FROM stock_pot_contributions c
           WHERE c.deployment_key=r.deployment_key AND c.round_id=r.round_id
             AND lower(c.player_address)=lower($2) AND c.canonical
         )
       ORDER BY r.round_id DESC LIMIT 100`,
      [deploymentKey, player],
    )
    .then((result) => result.rows.map((row) => row.contract_address));
  const claimableRounds = await Promise.all(
    candidateRounds.map(async (round) => {
      const [
        phase,
        holder,
        winningTicker,
        paid,
        holderClaimed,
        winningClaimed,
        refundClaimed,
      ] = await Promise.all([
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "currentPhase",
        }),
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "holder",
        }),
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "winningTicker",
        }),
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "paid",
          args: [player],
        }),
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "holderRewardClaimed",
          args: [player],
        }),
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "winningRewardClaimed",
          args: [player],
        }),
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "refundClaimed",
          args: [player],
        }),
      ]);
      const winningPoints =
        Number(winningTicker) < 4
          ? await client.readContract({
              address: round,
              abi: lastBellV4Abi,
              functionName: "playerTickerPoints",
              args: [player, winningTicker],
            })
          : 0n;
      return {
        round,
        holder:
          Number(phase) === 4 &&
          holder.toLowerCase() === player.toLowerCase() &&
          !holderClaimed,
        winning: Number(phase) === 4 && winningPoints > 0n && !winningClaimed,
        refund: Number(phase) === 5 && paid > 0n && !refundClaimed,
      };
    }),
  );
  const allHolderRounds = claimableRounds
    .filter((round) => round.holder)
    .map((round) => round.round);
  const allWinningRounds = claimableRounds
    .filter((round) => round.winning)
    .map((round) => round.round);
  const allCancelledRounds = claimableRounds
    .filter((round) => round.refund)
    .map((round) => round.round);
  const holderRounds = allHolderRounds.slice(0, 20);
  const winningRounds = allWinningRounds.slice(0, 20);
  const cancelledRounds = allCancelledRounds.slice(0, 20);
  return {
    address: player,
    points: {
      activePoints: usd(activePoints),
      pendingPoints: usd(pendingPoints),
      totalEligiblePoints: usd(totalEligiblePoints),
      shareBps:
        totalEligiblePoints === 0n
          ? 0
          : Number((activePoints * 10_000n) / totalEligiblePoints),
      perTicker,
    },
    tokens,
    totals: {
      claimableUsd: tokens.reduce((sum, token) => sum + token.estimatedUsd, 0),
      claimedUsd: tokens.reduce(
        (sum, token, index) =>
          sum + token.claimed * Number(catalog[index].price ?? 0),
        0,
      ),
      totalEarnedUsd: tokens.reduce(
        (sum, token, index) =>
          sum + token.totalEarned * Number(catalog[index].price ?? 0),
        0,
      ),
    },
    batchClaimPlan: {
      rewardRouter,
      lifetimeVault: vault,
      tokens: catalog.map((asset) => asset.token),
      holderRounds,
      winningRounds,
      cancelledRounds,
      hasMoreRoundClaims:
        allHolderRounds.length > holderRounds.length ||
        allWinningRounds.length > winningRounds.length ||
        allCancelledRounds.length > cancelledRounds.length,
    },
    contractVersion: "last-bell-v4-stock-pot" as const,
  };
}

export async function getV4ProductionRewardHistory(player: Address) {
  const { deploymentKey } = await loadServerDeploymentWithKey();
  const [contributions, claims] = await Promise.all([
    database.query(
      `SELECT round_id::text,transaction_hash,log_index,ticker_index,
              stock_token,usdg_amount::text,stock_received::text,
              multiplier_bps,points::text,recent_volume::text
       FROM stock_pot_contributions
       WHERE deployment_key=$1 AND lower(player_address)=lower($2)
         AND canonical
       ORDER BY round_id DESC,log_index DESC`,
      [deploymentKey, player],
    ),
    database.query(
      `SELECT round_id::text,transaction_hash,log_index,category,stock_token,
              amount::text
       FROM stock_reward_claims
       WHERE deployment_key=$1 AND lower(beneficiary)=lower($2)
         AND canonical
       ORDER BY round_id DESC NULLS LAST,log_index DESC`,
      [deploymentKey, player],
    ),
  ]);
  return {
    address: player,
    contributions: contributions.rows,
    claims: claims.rows,
    contractVersion: "last-bell-v4-stock-pot" as const,
  };
}

export async function getV4ProductionLeaderboards() {
  const { deploymentKey, manifest } = await loadServerDeploymentWithKey();
  const currentRound = await database
    .query<{ round_id: string }>(
      `SELECT round_id::text FROM rounds
       WHERE deployment_key=$1 ORDER BY round_id DESC LIMIT 1`,
      [deploymentKey],
    )
    .then((result) => result.rows[0]?.round_id);
  const query = async (scope: "round" | "season" | "lifetime") => {
    const condition =
      scope === "round"
        ? "AND c.round_id=$2"
        : scope === "season"
          ? "AND r.settled_at >= date_trunc('month',now())"
          : "";
    const params =
      scope === "round"
        ? [deploymentKey, currentRound ?? "-1"]
        : [deploymentKey];
    return database
      .query<{
        player_address: Address;
        total_points: string;
        settled_usdg: string;
        largest_call: string;
      }>(
        `SELECT c.player_address,
                sum(c.points)::text AS total_points,
                sum(c.usdg_amount)::text AS settled_usdg,
                max(c.usdg_amount)::text AS largest_call
         FROM stock_pot_contributions c
         JOIN rounds r ON r.deployment_key=c.deployment_key
                      AND r.round_id=c.round_id
         WHERE c.deployment_key=$1 AND c.canonical AND r.state='settled'
           ${condition}
         GROUP BY c.player_address
         ORDER BY sum(c.points) DESC,max(c.usdg_amount) DESC,
                  lower(c.player_address)
         LIMIT 100`,
        params,
      )
      .then((result) =>
        result.rows.map((row, index) => ({
          rank: index + 1,
          address: row.player_address,
          displayName: `caller-${row.player_address.slice(2, 7)}`,
          metric: "points",
          value: usd(BigInt(row.total_points)),
          settledUsdgContributed: usd(BigInt(row.settled_usdg)),
          largestCall: usd(BigInt(row.largest_call)),
        })),
      );
  };
  const [round, season, lifetime] = await Promise.all([
    query("round"),
    query("season"),
    query("lifetime"),
  ]);
  return {
    round,
    season,
    lifetime,
    chainId: manifest.chainId,
    deploymentKey,
    contractVersion: "last-bell-v4-stock-pot" as const,
  };
}
