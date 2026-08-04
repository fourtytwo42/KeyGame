import "server-only";

import { hexToString, type Address, zeroAddress } from "viem";
import type { ClaimEvent, RoundState, TickerId } from "@/lib/game/types";
import { loadServerDeployment } from "@/lib/server/deployment";
import { deploymentPublicClient } from "@/lib/server/rpc-client";
import {
  lastBellV4Abi,
  legacyStockPotV4EventAbi,
  roundManagerV4Abi,
} from "./last-bell-abi";

const phaseName = (phase: number): RoundState["phase"] =>
  (["entry", "live", "rug", "finalizing", "settled", "cancelled"] as const)[
    phase
  ] ?? "cancelled";
const usd = (raw: bigint) => Number(raw) / 1e6;
const stock = (raw: bigint) => Number(raw) / 1e18;

/** Production-safe v4 reader used by history, replay, and read-only launch UI. */
export async function getV4LiveSnapshot(
  requestedRoundAddress?: Address,
): Promise<RoundState> {
  const manifest = await loadServerDeployment();
  const isV5 = manifest.contractVersion === "saved-bell-v5-market-pot";
  const client = deploymentPublicClient(manifest);
  const address =
    requestedRoundAddress ??
    (await client.readContract({
      address: manifest.contracts.manager,
      abi: roundManagerV4Abi,
      functionName: "activeRound",
    }));
  if (address === zeroAddress) {
    throw new Error("No v4 round is available for replay.");
  }
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
    isV5
      ? client.readContract({
          address,
          abi: lastBellV4Abi,
          functionName: "totalUsdgConsumed",
        })
      : Promise.resolve(0n),
    isV5
      ? client.readContract({
          address,
          abi: lastBellV4Abi,
          functionName: "accountedUsdg",
        })
      : Promise.resolve(0n),
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
        abi: isV5 ? lastBellV4Abi : legacyStockPotV4EventAbi,
        eventName: "BellClaimed",
        fromBlock: BigInt(manifest.deploymentBlock),
      }),
      client.getContractEvents({
        address,
        abi: isV5 ? lastBellV4Abi : legacyStockPotV4EventAbi,
        eventName: "RoundSettled",
        fromBlock: BigInt(manifest.deploymentBlock),
      }),
    ]);
  const symbols = configs.map(
    (config) =>
      hexToString(config[0], { size: 32 }).replace(/\0/g, "") as TickerId,
  );
  const now = Number(block.timestamp);
  const deadlineNumber = Number(deadline);
  const hardEndNumber = Number(hardEnd);
  const chainPhase = phaseName(Number(phase));
  const displayedPhase =
    (chainPhase === "live" || chainPhase === "rug") &&
    now >= Math.min(deadlineNumber, hardEndNumber)
      ? "finalizing"
      : chainPhase;
  const claims: ClaimEvent[] = logs.map((log) => {
    const args = log.args as typeof log.args & {
      usdgConsumed?: bigint;
      residualUsdg?: bigint;
    };
    const player = args.player as Address;
    const ticker = symbols[Number(args.ticker)] ?? symbols[0];
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      sequence: Number(args.sequence),
      atSeconds: Number(args.acceptedAt) - Number(startedAt),
      claimant: {
        address: player,
        displayName: `caller-${player.slice(2, 7)}`,
        ticker,
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
      contractVersion: isV5
        ? "saved-bell-v5-market-pot"
        : "last-bell-v4-stock-pot",
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
  const stockBasketUsd = basket.reduce((sum, value) => sum + stock(value), 0);
  const residualUsdg = usd(accountedUsdg);
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
            ticker: symbols[holderIndex] ?? symbols[0],
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
    chainId: manifest.chainId,
    contractAddress: address,
    contractVersion: isV5
      ? "saved-bell-v5-market-pot"
      : "last-bell-v4-stock-pot",
    blockNumber: Number(block.number),
    startedAt: Number(startedAt),
    deadline: deadlineNumber,
    hardEnd: hardEndNumber,
    settledAt: Number(settledAt) || undefined,
    settlementTx: settlements.at(-1)?.transactionHash,
    winningTicker: Number(winner) < 4 ? symbols[Number(winner)] : undefined,
    stockPot: [
      ...indexes.map((index) => ({
        ticker: symbols[index],
        tokenAddress: configs[index][2] as Address,
        tokenAmount: stock(basket[index]),
        estimatedUsd: stock(basket[index]),
        assetKind: "STOCK" as const,
      })),
      ...(isV5
        ? [
            {
              ticker: "USDG",
              tokenAddress: manifest.contracts.paymentToken,
              tokenAmount: residualUsdg,
              estimatedUsd: residualUsdg,
              assetKind: "USDG" as const,
            },
          ]
        : []),
    ],
    stockPotValueUsd: stockBasketUsd + residualUsdg,
    largestCallUsd: usd(largestCall),
    totalContributedUsdg: usd(totalContributed),
    totalConsumedUsdg: isV5 ? usd(totalUsdgConsumed) : usd(totalContributed),
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
