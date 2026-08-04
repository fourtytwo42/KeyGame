import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  hexToString,
  http,
  maxUint256,
  type Address,
  type Hash,
  zeroAddress,
} from "viem";
import type {
  ClaimableBalances,
  ClaimEvent,
  RoundState,
  SessionBudget,
  StockSwapQuote,
  TickerId,
} from "@/lib/game/types";
import { heatLevel } from "@/lib/game/highlights";
import { tickerSlots } from "@/lib/game/constants";
import {
  localDevnet,
  robinhoodChainMainnet,
  robinhoodChainTestnet,
} from "./chains";
import {
  devDollarAbi,
  lastBellV4Abi,
  lifetimePointsVaultAbi,
  roundManagerV4Abi,
  stockSwapAdapterAbi,
} from "./last-bell-abi";

type DeploymentV4 = {
  deployer: Address;
  devDollar: Address;
  paymentRouter: Address;
  swapAdapter: Address;
  roundManager: Address;
  lifetimePointsVault: Address;
  rewardRouter: Address;
  stockTokens: Address[];
  lastBellRound: Address;
  players: Address[];
  sessionPlayer: Address;
  chainId: number;
};

const deploymentPath =
  process.env.V4_DEVNET_DEPLOYMENT_MANIFEST ||
  process.env.KEYGAME_DEPLOYMENT_MANIFEST ||
  path.join(
    process.cwd(),
    "deployments",
    `${process.env.KEYGAME_CHAIN_ID || "31337"}.json`,
  );
const rawDeployment = JSON.parse(
  readFileSync(deploymentPath, "utf8"),
) as Record<string, unknown>;
const deploymentBlock = BigInt(
  typeof rawDeployment.deploymentBlock === "number"
    ? rawDeployment.deploymentBlock
    : 0,
);

function deployment(): DeploymentV4 {
  if ("contracts" in rawDeployment) {
    const manifest = rawDeployment as {
      chainId: number;
      deployer?: Address;
      players?: Address[];
      sessionPlayer?: Address;
      stockTokens?: Address[];
      contracts: {
        manager: Address;
        paymentRouter: Address;
        paymentToken: Address;
        swapAdapter: Address;
        lifetimePointsVault: Address;
        rewardRouter: Address;
        activeRound?: Address;
        mockStockTokens?: Address[];
      };
      market?: {
        approvedCatalog?: Array<{ stockToken: Address }>;
      };
      rpc: { primary: string };
    };
    return {
      deployer: manifest.deployer ?? zeroAddress,
      devDollar: manifest.contracts.paymentToken,
      paymentRouter: manifest.contracts.paymentRouter,
      swapAdapter: manifest.contracts.swapAdapter,
      roundManager: manifest.contracts.manager,
      lifetimePointsVault: manifest.contracts.lifetimePointsVault,
      rewardRouter: manifest.contracts.rewardRouter,
      stockTokens:
        manifest.contracts.mockStockTokens ??
        manifest.market?.approvedCatalog?.map((asset) => asset.stockToken) ??
        manifest.stockTokens ??
        [],
      lastBellRound: manifest.contracts.activeRound ?? zeroAddress,
      players: manifest.players ?? [],
      sessionPlayer: manifest.sessionPlayer ?? zeroAddress,
      chainId: manifest.chainId,
    };
  }
  return {
    ...(rawDeployment as unknown as Omit<DeploymentV4, "chainId">),
    chainId: Number(process.env.KEYGAME_CHAIN_ID || 31337),
  };
}

const normalizedDeployment = deployment();
const rpcUrl =
  process.env.LOCAL_RPC_URL ||
  process.env.NEXT_PUBLIC_LOCAL_RPC_URL ||
  (rawDeployment.rpc as { primary?: string } | undefined)?.primary ||
  "http://127.0.0.1:8545";
const runtimeChain =
  normalizedDeployment.chainId === 4663
    ? robinhoodChainMainnet
    : normalizedDeployment.chainId === 46630
      ? robinhoodChainTestnet
      : localDevnet;
const client = createPublicClient({
  chain: runtimeChain,
  cacheTime: 0,
  pollingInterval: 100,
  transport: http(rpcUrl),
});

async function activeRoundAddress(d = deployment()): Promise<Address> {
  const active = await client.readContract({
    address: d.roundManager,
    abi: roundManagerV4Abi,
    functionName: "activeRound",
  });
  return active === zeroAddress ? d.lastBellRound : active;
}

const phaseName = (phase: number): RoundState["phase"] =>
  (["entry", "live", "rug", "finalizing", "settled", "cancelled"] as const)[
    phase
  ] ?? "cancelled";
const tickerId = (index: number): TickerId =>
  tickerSlots[index]?.id ?? tickerSlots[0].id;
const usd = (raw: bigint) => Number(raw) / 1e6;
const stock = (raw: bigint) => Number(raw) / 1e18;

export async function getV4DevnetSnapshot(
  roundAddress?: Address,
): Promise<RoundState> {
  const d = deployment();
  const address = roundAddress ?? (await activeRoundAddress(d));
  const [
    roundId,
    phase,
    passRequired,
    startedAt,
    deadline,
    hardEnd,
    settledAt,
    holder,
    holderTicker,
    winner,
    acceptedClaims,
    totalContributed,
    totalUsdgConsumed,
    accountedUsdg,
    largestCall,
    heatTarget,
    block,
  ] = await Promise.all([
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "roundId",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "currentPhase",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "producerPassRequired",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "startedAt",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "deadline",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "hardEnd",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "settledAt",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "holder",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "holderTicker",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "winningTicker",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "acceptedClaims",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "totalContributed",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "totalUsdgConsumed",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "accountedUsdg",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "largestCall",
    }),
    client.readContract({
      address,
      abi: lastBellV4Abi,
      functionName: "heatTarget",
    }),
    client.getBlock(),
  ]);
  const indexes = [0, 1, 2, 3] as const;
  const configs = await Promise.all(
    indexes.map((index) =>
      client.readContract({
        address,
        abi: lastBellV4Abi,
        functionName: "tickerConfigs",
        args: [BigInt(index)],
      }),
    ),
  );
  const [points, volumes, multipliers, acquired, basket, logs, settlements] =
    await Promise.all([
      Promise.all(
        indexes.map((index) =>
          client.readContract({
            address,
            abi: lastBellV4Abi,
            functionName: "tickerPoints",
            args: [BigInt(index)],
          }),
        ),
      ),
      Promise.all(
        indexes.map((index) =>
          client.readContract({
            address,
            abi: lastBellV4Abi,
            functionName: "recentVolume",
            args: [index],
          }),
        ),
      ),
      Promise.all(
        indexes.map((index) =>
          client.readContract({
            address,
            abi: lastBellV4Abi,
            functionName: "currentMultiplierBps",
            args: [index],
          }),
        ),
      ),
      Promise.all(
        indexes.map((index) =>
          client.readContract({
            address,
            abi: lastBellV4Abi,
            functionName: "lastTickerContributionAt",
            args: [BigInt(index)],
          }),
        ),
      ),
      Promise.all(
        indexes.map((index) =>
          client.readContract({
            address,
            abi: lastBellV4Abi,
            functionName: "accountedStock",
            args: [BigInt(index)],
          }),
        ),
      ),
      client.getContractEvents({
        address,
        abi: lastBellV4Abi,
        eventName: "BellClaimed",
        fromBlock: deploymentBlock,
      }),
      client.getContractEvents({
        address,
        abi: lastBellV4Abi,
        eventName: "RoundSettled",
        fromBlock: deploymentBlock,
      }),
    ]);
  const symbols = configs.map((config) =>
    hexToString(config[0], { size: 32 }).replace(/\0/g, ""),
  );
  const now = Math.max(Number(block.timestamp), Math.floor(Date.now() / 1_000));
  const deadlineNumber = Number(deadline);
  const hardEndNumber = Number(hardEnd);
  const chainPhase = phaseName(Number(phase));
  const displayedPhase =
    (chainPhase === "live" || chainPhase === "rug") &&
    now >= Math.min(deadlineNumber, hardEndNumber)
      ? "finalizing"
      : chainPhase;
  const claims: ClaimEvent[] = logs.map((log) => {
    const args = log.args;
    const player = args.player as Address;
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      sequence: Number(args.sequence),
      atSeconds: Number(args.acceptedAt) - Number(startedAt),
      claimant: {
        address: player,
        displayName: `caller-${player.slice(2, 7)}`,
        ticker: symbols[Number(args.ticker)] ?? tickerId(Number(args.ticker)),
        claimNumber: Number(args.sequence),
        band: "FLAT",
        multiplierBps: Number(args.multiplierBps),
        verifiedPrice: 0,
        reportTimestamp: Number(args.acceptedAt),
        producerPass: false,
      },
      previousHolder: args.previousHolder as Address,
      feeUsd: usd(args.usdgAmount ?? 0n),
      usdgAmount: usd(args.usdgAmount ?? 0n),
      usdgConsumed: usd(args.usdgConsumed ?? args.usdgAmount ?? 0n),
      residualUsdg: usd(args.residualUsdg ?? 0n),
      stockReceived: stock(args.stockReceived ?? 0n),
      recentVolumeUsd: usd(args.recentVolume ?? 0n),
      pointsAwarded: usd(args.points ?? 0n),
      phase: args.rugZone ? "rug" : "live",
      transactionHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: log.logIndex,
      contractVersion: "saved-bell-v5-market-pot",
      accepted: true,
      potAfterUsd: 0,
      timeAfterSeconds: Math.max(
        0,
        Number(args.deadline) - Number(args.acceptedAt),
      ),
      verifiedPrice: 0,
      reportTimestamp: Number(args.acceptedAt),
      marketBand: "FLAT",
      multiplierBps: Number(args.multiplierBps),
      weightedPoints: usd(args.points ?? 0n),
      producerPass: false,
    };
  });
  let runningPot = 0;
  for (const claim of claims) {
    runningPot += claim.usdgAmount ?? 0;
    claim.potAfterUsd = runningPot;
  }
  const holderAddress = holder as Address;
  const holderIndex = Number(holderTicker);
  const contributedByTicker = indexes.map((index) =>
    claims
      .filter((claim) => claim.claimant.ticker === symbols[index])
      .reduce((sum, claim) => sum + (claim.usdgAmount ?? 0), 0),
  );
  const consumedByTicker = indexes.map((index) =>
    claims
      .filter((claim) => claim.claimant.ticker === symbols[index])
      .reduce((sum, claim) => sum + (claim.usdgConsumed ?? 0), 0),
  );
  const residualByTicker = indexes.map(
    (index) => contributedByTicker[index] - consumedByTicker[index],
  );
  const residualUsdg = usd(accountedUsdg);
  const stockBasketUsd = basket.reduce((sum, value) => sum + stock(value), 0);
  return {
    roundId: roundId.toString(),
    phase: displayedPhase,
    marketMode: "FLAT",
    broadcastLabel: "VOLUME CHECK",
    marketExplanation:
      "Calls heat a stock for the next players. Points pick the winning stock; DEX prices do not affect scoring.",
    producerPassRequired: passRequired,
    timeLeftSeconds:
      Number(startedAt) === 0 ? 300 : Math.max(0, deadlineNumber - now),
    elapsedSeconds: Number(startedAt)
      ? Math.max(0, now - Number(startedAt))
      : 0,
    hardTimeLeftSeconds: Number(hardEnd)
      ? Math.max(0, hardEndNumber - now)
      : 600,
    potUsd: stockBasketUsd + residualUsdg,
    holder:
      holderAddress === zeroAddress
        ? null
        : {
            address: holderAddress,
            displayName: `caller-${holderAddress.slice(2, 7)}`,
            ticker: symbols[holderIndex] ?? tickerId(holderIndex),
            claimNumber: Number(acceptedClaims),
            band: "FLAT",
            multiplierBps: Number(multipliers[holderIndex] ?? 10_000),
            verifiedPrice: 0,
            reportTimestamp: claims.at(-1)?.reportTimestamp ?? now,
            producerPass: false,
          },
    tickerScores: indexes.map((index) => ({
      ticker: symbols[index],
      rawSeconds: 0,
      weightedScore: usd(points[index]),
      lastAcquisitionAt: Number(acquired[index]),
      currentBand: "FLAT",
      multiplierBps: Number(multipliers[index]),
      recentVolumeUsd: usd(volumes[index]),
      potTokenQuantity: stock(basket[index]),
      potValueUsd: stock(basket[index]),
      contributedUsdg: contributedByTicker[index],
      consumedUsdg: consumedByTicker[index],
      residualUsdg: residualByTicker[index],
    })),
    claims,
    freshness: "live",
    updatedAt: new Date(now * 1_000).toISOString(),
    chainId: normalizedDeployment.chainId,
    contractAddress: address,
    contractVersion: "saved-bell-v5-market-pot",
    blockNumber: Number(block.number),
    startedAt: Number(startedAt),
    deadline: deadlineNumber,
    hardEnd: hardEndNumber,
    settledAt: Number(settledAt) || undefined,
    winningTicker: Number(winner) < 4 ? symbols[Number(winner)] : undefined,
    stockPot: [
      ...indexes.map((index) => ({
        ticker: symbols[index],
        tokenAddress: configs[index][2] as Address,
        tokenAmount: stock(basket[index]),
        estimatedUsd: stock(basket[index]),
        assetKind: "STOCK" as const,
      })),
      {
        ticker: "USDG",
        tokenAddress: d.devDollar,
        tokenAmount: residualUsdg,
        estimatedUsd: residualUsdg,
        assetKind: "USDG" as const,
      },
    ],
    stockPotValueUsd: stockBasketUsd + residualUsdg,
    largestCallUsd: usd(largestCall),
    totalContributedUsdg: usd(totalContributed),
    totalConsumedUsdg: usd(totalUsdgConsumed),
    residualUsdg,
    heatTargetUsd: usd(heatTarget),
    pools: {
      holderUsd: settlements.length ? (stockBasketUsd + residualUsdg) * 0.5 : 0,
      airtimeUsd: settlements.length
        ? (stockBasketUsd + residualUsdg) * 0.3
        : 0,
      nextRoundUsd: settlements.length
        ? (stockBasketUsd + residualUsdg) * 0.05
        : 0,
      protocolUsd: settlements.length
        ? (stockBasketUsd + residualUsdg) * 0.05
        : 0,
    },
  };
}

export async function getV4DevnetSession(
  player?: Address,
): Promise<{ session: SessionBudget; claimable: ClaimableBalances }> {
  const d = deployment();
  const address = player ?? d.sessionPlayer;
  const snapshot = await getV4DevnetSnapshot();
  const round = await activeRoundAddress(d);
  const [spent, allowance] = await Promise.all([
    client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "paid",
      args: [address],
    }),
    client.readContract({
      address: d.devDollar,
      abi: devDollarAbi,
      functionName: "allowance",
      args: [address, d.paymentRouter],
    }),
  ]);
  return {
    session: {
      player: address,
      starterTicker:
        snapshot.claims.find(
          (claim) =>
            claim.claimant.address.toLowerCase() === address.toLowerCase(),
        )?.claimant.ticker ?? null,
      maximumUsd:
        allowance === maxUint256 ? Number.MAX_SAFE_INTEGER : usd(allowance),
      spentUsd: usd(spent),
      remainingUsd:
        allowance === maxUint256 ? Number.MAX_SAFE_INTEGER : usd(allowance),
      availableActions:
        allowance === maxUint256
          ? Number.MAX_SAFE_INTEGER
          : Math.floor(usd(allowance)),
      allowanceUsd:
        allowance === maxUint256 ? Number.MAX_SAFE_INTEGER : usd(allowance),
      expiresAt: snapshot.deadline ?? null,
      status: spent === 0n ? "new" : "active",
      mode: "devnet-guest",
      producerPass: false,
    },
    claimable: { holderUsd: 0, airtimeUsd: 0, refundUsd: 0 },
  };
}

export async function quoteV4Devnet(
  ticker: TickerId,
  amountUsd: number,
  slippageBps = 10_000,
): Promise<StockSwapQuote> {
  if (!Number.isFinite(amountUsd) || amountUsd < 1) {
    throw new Error("The minimum contribution is $1.");
  }
  if (
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps > 10_000
  ) {
    throw new Error("Execution slippage must be between 0 and 100%.");
  }
  const d = deployment();
  const round = await activeRoundAddress(d);
  const index = tickerSlots.findIndex((item) => item.id === ticker);
  if (index < 0) throw new Error("Unknown ticker.");
  const amount = BigInt(Math.floor(amountUsd * 1e6));
  const [output, multiplier, standings, block] = await Promise.all([
    client.readContract({
      address: d.swapAdapter,
      abi: stockSwapAdapterAbi,
      functionName: "quoteUsdgForStock",
      args: [d.stockTokens[index], amount],
    }),
    client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "currentMultiplierBps",
      args: [index],
    }),
    Promise.all(
      [0n, 1n, 2n, 3n].map((item) =>
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "tickerPoints",
          args: [item],
        }),
      ),
    ),
    client.getBlock({ blockTag: "pending" }),
  ]);
  const projected = (amount * BigInt(multiplier)) / 10_000n;
  const resulting = standings.map((value, item) =>
    item === index ? value + projected : value,
  );
  const leader = resulting.reduce(
    (best, value, item) => (value > resulting[best] ? item : best),
    0,
  );
  const currentLead = standings.reduce(
    (best, value) => (value > best ? value : best),
    0n,
  );
  const rank = (values: readonly bigint[], tickerIndex: number) =>
    1 + values.filter((value) => value > values[tickerIndex]).length;
  return {
    ticker,
    tickerIndex: index,
    usdgAmount: amountUsd,
    estimatedStockOut: stock(output),
    minimumStockOut: (() => {
      const protectedOutput = (output * BigInt(10_000 - slippageBps)) / 10_000n;
      return (protectedOutput > 0n ? protectedOutput : 1n).toString();
    })(),
    quoteBlock: Number(block.number),
    expiresAt: Number(block.timestamp) + 30,
    multiplierBps: Number(multiplier),
    projectedPoints: usd(projected),
    projectedLeader: tickerId(leader),
    pointsToLead: Math.max(0, usd(currentLead - standings[index]) + 0.000001),
    currentRank: rank(standings, index),
    projectedRank: rank(resulting, index),
    pointsToFlip: Math.max(0, usd(currentLead - standings[index]) + 0.000001),
    heatLevel: heatLevel(Number(multiplier)),
    approvalRequired: true,
  };
}

export async function getV4DevnetRewards(player: Address) {
  const d = deployment();
  const round = await activeRoundAddress(d);
  const [activePoints, pendingPoints, totalEligiblePoints, tickerConfigs] =
    await Promise.all([
      client.readContract({
        address: d.lifetimePointsVault,
        abi: lifetimePointsVaultAbi,
        functionName: "activePoints",
        args: [player],
      }),
      client.readContract({
        address: d.lifetimePointsVault,
        abi: lifetimePointsVaultAbi,
        functionName: "pendingPoints",
        args: [player],
      }),
      client.readContract({
        address: d.lifetimePointsVault,
        abi: lifetimePointsVaultAbi,
        functionName: "totalActivePoints",
      }),
      Promise.all(
        tickerSlots.map((_, index) =>
          client.readContract({
            address: round,
            abi: lastBellV4Abi,
            functionName: "tickerConfigs",
            args: [BigInt(index)],
          }),
        ),
      ),
    ]);
  const perTicker = await Promise.all(
    tickerConfigs.map(async (config, index) => ({
      ticker: tickerId(index),
      points: usd(
        await client.readContract({
          address: d.lifetimePointsVault,
          abi: lifetimePointsVaultAbi,
          functionName: "tickerPointsOf",
          args: [player, config[1]],
        }),
      ),
    })),
  );
  const rewardTokens = [...d.stockTokens, d.devDollar];
  const tokens = await Promise.all(
    rewardTokens.map(async (tokenAddress, index) => {
      const [claimable, claimed] = await Promise.all([
        client.readContract({
          address: d.lifetimePointsVault,
          abi: lifetimePointsVaultAbi,
          functionName: "claimable",
          args: [player, tokenAddress],
        }),
        client.readContract({
          address: d.lifetimePointsVault,
          abi: lifetimePointsVaultAbi,
          functionName: "totalClaimed",
          args: [player, tokenAddress],
        }),
      ]);
      const isUsdg = index === d.stockTokens.length;
      const units = isUsdg ? usd : stock;
      return {
        ticker: isUsdg ? "USDG" : tickerId(index),
        tokenAddress,
        claimable: units(claimable),
        claimed: units(claimed),
        totalEarned: units(claimable + claimed),
        estimatedUsd: units(claimable),
      };
    }),
  );
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
      claimableUsd: tokens.reduce((sum, token) => sum + token.claimable, 0),
      claimedUsd: tokens.reduce((sum, token) => sum + token.claimed, 0),
      totalEarnedUsd: tokens.reduce((sum, token) => sum + token.totalEarned, 0),
    },
    batchClaimPlan: {
      rewardRouter: d.rewardRouter,
      lifetimeVault: d.lifetimePointsVault,
      tokens: rewardTokens,
      holderRounds: [],
      winningRounds: [],
      cancelledRounds: [],
      hasMoreRoundClaims: false,
    },
    contractVersion: "saved-bell-v5-market-pot" as const,
  };
}

async function send(
  account: Address,
  functionName:
    | "claimBell"
    | "claimHolderRewardFor"
    | "claimWinningStockRewardFor"
    | "claimCancellationRefundFor",
  args: readonly unknown[],
): Promise<Hash> {
  const d = deployment();
  const round = await activeRoundAddress(d);
  const wallet = createWalletClient({
    account,
    chain: localDevnet,
    transport: http(rpcUrl),
  });
  const request = {
    account,
    address: round,
    abi: lastBellV4Abi,
    functionName,
    args,
  };
  const estimatedGas = await client.estimateContractGas(request as never);
  const hash = await wallet.writeContract({
    chain: localDevnet,
    ...request,
    gas: (estimatedGas * 120n) / 100n,
  } as never);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error("Devnet transaction reverted.");
  return hash;
}

export type V4DevnetAction =
  | "enter"
  | "claim"
  | "demo-claim"
  | "finalize"
  | "revoke"
  | "claim-holder"
  | "claim-print"
  | "claim-lifetime"
  | "claim-refund";

export async function sendV4DevnetAction(
  action: V4DevnetAction,
  ticker: TickerId = "NVDA",
  amountUsd = 1,
) {
  const d = deployment();
  const player = d.sessionPlayer;
  let hash: Hash;
  if (action === "enter" || action === "claim" || action === "demo-claim") {
    const tickerIndex = Math.max(
      0,
      tickerSlots.findIndex((item) => item.id === ticker),
    );
    const snapshot =
      action === "demo-claim" ? await getV4DevnetSnapshot() : undefined;
    const selected =
      action === "demo-claim"
        ? ([d.players[tickerIndex], d.players[tickerIndex + 4]].find(
            (candidate) =>
              candidate?.toLowerCase() !==
              snapshot?.holder?.address.toLowerCase(),
          ) ?? d.players[tickerIndex])
        : player;
    const quote = await quoteV4Devnet(ticker, amountUsd);
    const allowance = await client.readContract({
      address: d.devDollar,
      abi: devDollarAbi,
      functionName: "allowance",
      args: [selected, d.paymentRouter],
    });
    if (allowance < BigInt(Math.floor(amountUsd * 1e6))) {
      const wallet = createWalletClient({
        account: selected,
        chain: localDevnet,
        transport: http(rpcUrl),
      });
      const approval = await wallet.writeContract({
        account: selected,
        chain: localDevnet,
        address: d.devDollar,
        abi: devDollarAbi,
        functionName: "approve",
        args: [d.paymentRouter, maxUint256],
      });
      await client.waitForTransactionReceipt({ hash: approval });
    }
    const index = tickerSlots.findIndex((item) => item.id === ticker);
    hash = await send(selected, "claimBell", [
      index,
      BigInt(Math.floor(amountUsd * 1e6)),
      BigInt(quote.minimumStockOut),
      BigInt(quote.expiresAt),
      255,
    ]);
  } else if (action === "finalize") {
    const wallet = createWalletClient({
      account: d.deployer,
      chain: localDevnet,
      transport: http(rpcUrl),
    });
    hash = await wallet.writeContract({
      account: d.deployer,
      chain: localDevnet,
      address: d.roundManager,
      abi: roundManagerV4Abi,
      functionName: "finalizeActive",
    });
    await client.waitForTransactionReceipt({ hash });
  } else if (action === "revoke") {
    const wallet = createWalletClient({
      account: d.sessionPlayer,
      chain: localDevnet,
      transport: http(rpcUrl),
    });
    hash = await wallet.writeContract({
      account: d.sessionPlayer,
      chain: localDevnet,
      address: d.devDollar,
      abi: devDollarAbi,
      functionName: "approve",
      args: [d.paymentRouter, 0n],
    });
    await client.waitForTransactionReceipt({ hash });
  } else if (action === "claim-lifetime") {
    const wallet = createWalletClient({
      account: d.sessionPlayer,
      chain: localDevnet,
      transport: http(rpcUrl),
    });
    hash = await wallet.writeContract({
      account: d.sessionPlayer,
      chain: localDevnet,
      address: d.lifetimePointsVault,
      abi: lifetimePointsVaultAbi,
      functionName: "claimFor",
      args: [d.sessionPlayer, d.stockTokens],
      gas: 1_200_000n,
    });
    await client.waitForTransactionReceipt({ hash });
  } else {
    const functionName =
      action === "claim-holder"
        ? "claimHolderRewardFor"
        : action === "claim-print"
          ? "claimWinningStockRewardFor"
          : "claimCancellationRefundFor";
    hash = await send(d.sessionPlayer, functionName, [d.sessionPlayer]);
  }
  return {
    hash,
    state: await getV4DevnetSnapshot(),
    ...(await getV4DevnetSession()),
  };
}

export async function ensureV4DevnetRoundProgression(
  state: RoundState,
): Promise<RoundState> {
  return state;
}
