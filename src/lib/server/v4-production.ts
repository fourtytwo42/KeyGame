import "server-only";

import {
  encodePacked,
  hexToString,
  keccak256,
  parseAbi,
  type Address,
  zeroAddress,
} from "viem";
import type { StockSwapQuote, TickerId } from "@/lib/game/types";
import { heatLevel } from "@/lib/game/highlights";
import { leaderboardRewardQueryScope } from "@/lib/server/leaderboard-query";
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
const ROBINHOOD_V3_QUOTER =
  "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7" as Address;
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

export async function quoteV4Production(
  ticker: TickerId,
  amountUsd: number,
  player?: Address,
): Promise<StockSwapQuote> {
  if (!Number.isFinite(amountUsd) || amountUsd < 1) {
    throw new Error("The minimum contribution is $1.");
  }
  const { manifest } = await loadServerDeploymentWithKey();
  if (
    manifest.contractVersion !== "saved-bell-v5-market-pot" ||
    !manifest.contracts.swapAdapter
  ) {
    throw new Error("The active deployment is not a v5 Open-Market Pot.");
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
  const metadata = await database
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
    .catch(() => undefined);
  const outputPromise =
    manifest.chainId === 4663 && metadata?.pool_address && metadata.fee_tier
      ? client
          .simulateContract({
            address: ROBINHOOD_V3_QUOTER,
            abi: quoterAbi,
            functionName: "quoteExactInputSingle",
            args: [
              {
                tokenIn: manifest.contracts.paymentToken,
                tokenOut: token,
                amountIn: amount,
                fee: metadata.fee_tier,
                sqrtPriceLimitX96: 0n,
              },
            ],
          })
          .then((simulation) => simulation.result[0])
      : client.readContract({
          address: manifest.contracts.swapAdapter,
          abi: stockSwapAdapterAbi,
          functionName: "quoteUsdgForStock",
          args: [token, amount],
        });
  const [output, multiplier, standings, block, playerPoints] = await Promise.all([
    outputPromise,
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
    player
      ? client.readContract({
          address: active,
          abi: lastBellV4Abi,
          functionName: "playerTickerPoints",
          args: [player, tickerIndex],
        })
      : Promise.resolve(0n),
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
  const rank = (values: readonly bigint[], index: number) =>
    1 + values.filter((value) => value > values[index]).length;
  const projectedPlayerPoints = playerPoints + projected;
  const projectedShareBps = resulting[tickerIndex] > 0n
    ? Number((projectedPlayerPoints * 10_000n) / resulting[tickerIndex])
    : 0;
  return {
    ticker: symbols[tickerIndex],
    tickerIndex,
    usdgAmount: amountUsd,
    estimatedStockOut: stock(output),
    minimumStockOut: "1",
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
    maximumExecutionDeviationBps: undefined,
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
    basePoints: amountUsd,
    projectedPoints: usd(projected),
    currentTickerPoints: usd(standings[tickerIndex]),
    projectedTickerPoints: usd(resulting[tickerIndex]),
    projectedLeader: symbols[leader],
    pointsToLead: Math.max(
      0,
      usd(currentLead - standings[tickerIndex]) + 0.000001,
    ),
    pointsToLeadAfter: Math.max(
      0,
      usd(currentLead - resulting[tickerIndex]) + 0.000001,
    ),
    currentRank: rank(standings, tickerIndex),
    projectedRank: rank(resulting, tickerIndex),
    pointsToFlip: Math.max(
      0,
      usd(currentLead - standings[tickerIndex]) + 0.000001,
    ),
    currentPlayerTickerPoints: usd(playerPoints),
    projectedPlayerTickerPoints: usd(projectedPlayerPoints),
    projectedPlayerShareBps: projectedShareBps,
    pendingLifetimePoints: usd(projected),
    heatLevel: heatLevel(Number(multiplier)),
    approvalRequired: true,
  };
}

export async function getV4ProductionRewards(player: Address) {
  const { manifest, deploymentKey } = await loadServerDeploymentWithKey();
  const vault = manifest.contracts.lifetimePointsVault;
  const rewardRouter = manifest.contracts.rewardRouter;
  if (
    manifest.contractVersion !== "saved-bell-v5-market-pot" ||
    !vault ||
    !rewardRouter
  ) {
    throw new Error("The active deployment is not a v5 Open-Market Pot.");
  }
  const client = deploymentPublicClient(manifest);
  const stockCatalog = await database
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
  const catalog = [
    ...stockCatalog.map((asset) => ({
      ...asset,
      decimals: 18,
      price: asset.price,
    })),
    {
      symbol: "USDG",
      token: manifest.contracts.paymentToken,
      canonical_address: manifest.contracts.paymentToken,
      price: "1",
      decimals: 6,
    },
  ];
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
    stockCatalog.map(async (asset) => ({
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
      const units = asset.decimals === 6 ? usd : stock;
      return {
        ticker: asset.symbol,
        tokenAddress: asset.token,
        claimable: units(claimable),
        claimed: units(claimed),
        totalEarned: units(claimable + claimed),
        estimatedUsd: units(claimable) * price,
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
    contractVersion: "saved-bell-v5-market-pot" as const,
  };
}

export async function getV4ProductionRewardHistory(player: Address) {
  const { deploymentKey } = await loadServerDeploymentWithKey();
  const [contributions, claims] = await Promise.all([
    database.query(
      `SELECT round_id::text,transaction_hash,log_index,ticker_index,
              stock_token,usdg_amount::text,usdg_consumed::text,
              residual_usdg::text,stock_received::text,
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
    contractVersion: "saved-bell-v5-market-pot" as const,
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
    const baseRows = await database
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
    const achievementCondition =
      scope === "round"
        ? "AND pa.round_id=$2"
        : scope === "season"
          ? "AND r.settled_at >= date_trunc('month',now() AT TIME ZONE 'UTC')"
          : "";
    const achievementRows = await database.query<{
      player_address: Address;
      captain_wins: string;
      stock_flips: string;
      final_bells: string;
    }>(
      `SELECT pa.player_address,
              count(*) FILTER (WHERE pa.kind='STOCK_CAPTAIN')::text AS captain_wins,
              count(*) FILTER (WHERE pa.kind='FLIP_ARTIST')::text AS stock_flips,
              count(*) FILTER (WHERE pa.kind='FINAL_CALLER')::text AS final_bells
       FROM player_achievements pa
       LEFT JOIN rounds r ON r.deployment_key=pa.deployment_key
                         AND r.round_id=pa.round_id
       WHERE pa.deployment_key=$1 AND pa.canonical ${achievementCondition}
       GROUP BY pa.player_address`,
      params,
    );
    const achievementMap = new Map(
      achievementRows.rows.map((row) => [
        row.player_address.toLowerCase(),
        row,
      ]),
    );
    const rewardScope = leaderboardRewardQueryScope(
      scope,
      deploymentKey,
      currentRound,
      manifest.mockOnly,
    );
    const rewardRows = await database.query<{
      beneficiary: Address;
      claimed_rewards: string;
    }>(
      `SELECT rc.beneficiary,
              coalesce(sum(
                CASE WHEN lower(rc.stock_token)=lower('${manifest.contracts.paymentToken}')
                     THEN rc.amount / 1e6
                     ELSE (rc.amount / 1e18) * coalesce(price.adjusted_mid,0)
                END
              ),0)::text
                AS claimed_rewards
       FROM stock_reward_claims rc
       LEFT JOIN rounds r ON r.deployment_key=rc.deployment_key
                         AND r.round_id=rc.round_id
       LEFT JOIN market_assets a
         ON lower(rc.stock_token)=lower(
           CASE WHEN ${rewardScope.mockParameter}::boolean
                THEN a.testnet_mock_address ELSE a.canonical_address END
         )
       LEFT JOIN LATERAL (
         SELECT adjusted_mid FROM market_samples
         WHERE symbol=a.symbol AND source='uniswap-v3-twap'
         ORDER BY sampled_at DESC LIMIT 1
       ) price ON true
       WHERE rc.deployment_key=$1 AND rc.canonical ${rewardScope.condition}
       GROUP BY rc.beneficiary`,
      rewardScope.params,
    );
    const rewardMap = new Map(
      rewardRows.rows.map((row) => [row.beneficiary.toLowerCase(), row]),
    );
    return baseRows.map((row) => {
      const derived = achievementMap.get(row.address.toLowerCase());
      const rewards = rewardMap.get(row.address.toLowerCase());
      return {
        ...row,
        captainWins: Number(derived?.captain_wins ?? 0),
        stockFlips: Number(derived?.stock_flips ?? 0),
        finalBells: Number(derived?.final_bells ?? 0),
        claimedRewards: Number(rewards?.claimed_rewards ?? 0),
      };
    });
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
    contractVersion: "saved-bell-v5-market-pot" as const,
  };
}
