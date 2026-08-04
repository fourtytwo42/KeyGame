import "server-only";
import { hexToString, type Address, zeroAddress } from "viem";
import type { ClaimEvent, RoundState, TickerId } from "@/lib/game/types";
import { database } from "@/lib/server/db";
import { loadServerDeploymentWithKey } from "@/lib/server/deployment";
import { deploymentPublicClient } from "@/lib/server/rpc-client";
import { lastBellAbi, roundManagerAbi } from "./last-bell-abi";
import { getV4LiveSnapshot } from "./v4-live-snapshot";

const phaseName = (phase: number): RoundState["phase"] =>
  (["entry", "live", "rug", "finalizing", "settled", "cancelled"] as const)[
    phase
  ] ?? "cancelled";
const bandName = (band: number) =>
  (["RED", "FLAT", "GREEN"] as const)[band] ?? "FLAT";
const usd = (value: bigint) => Number(value) / 1e6;
const price = (value: bigint) =>
  Number(value) / (value > 1_000_000_000_000_000n ? 1e18 : 1e8);

type EventRow = {
  transaction_hash: `0x${string}`;
  log_index: number;
  block_number: string;
  args: Record<string, string | number | boolean>;
  display_name: string | null;
  handle: string | null;
};

type IndexedClaim = ClaimEvent & { acceptedAt: number };

export async function getLiveSnapshot(
  requestedRoundAddress?: Address,
): Promise<RoundState> {
  const { manifest, deploymentKey } = await loadServerDeploymentWithKey();
  const client = deploymentPublicClient(manifest);
  const [active, prepared, block] = await Promise.all([
    client.readContract({
      address: manifest.contracts.manager,
      abi: roundManagerAbi,
      functionName: "activeRound",
    }),
    client.readContract({
      address: manifest.contracts.manager,
      abi: roundManagerAbi,
      functionName: "preparedRound",
    }),
    client.getBlock(),
  ]);
  const roundAddress =
    requestedRoundAddress ?? (prepared !== zeroAddress ? prepared : active);
  if (roundAddress === zeroAddress) {
    throw new Error("No active or prepared broadcast is deployed.");
  }
  const reportedVersion = await client
    .readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "CONTRACT_VERSION",
    })
    .then((value) => hexToString(value, { size: 32 }).replace(/\0/g, ""))
    .catch(async () => {
      const evidence = await database.query<{ dex: boolean }>(
        `SELECT coalesce((args ? 'sourcePool'),false) AS dex
         FROM chain_events
         WHERE deployment_key=$1 AND lower(contract_address)=lower($2)
           AND event_name='BellClaimed'
         ORDER BY block_number DESC,log_index DESC LIMIT 1`,
        [deploymentKey, roundAddress],
      );
      return evidence.rows[0]?.dex
        ? "closing-print-v2-dex"
        : "closing-print-v1";
    });
  if (
    reportedVersion === "saved-bell-v5-market-pot" ||
    reportedVersion === "last-bell-v4-stock-pot"
  ) {
    return getV4LiveSnapshot(roundAddress);
  }
  const contractVersion =
    reportedVersion === "closing-print-v3-airtime"
      ? ("closing-print-v3-airtime" as const)
      : reportedVersion === "closing-print-v1"
        ? ("closing-print-v1" as const)
        : ("closing-print-v2-dex" as const);

  const [
    roundId,
    phase,
    mode,
    passRequired,
    startedAt,
    deadline,
    hardEnd,
    settledAt,
    pot,
    holder,
    holderTicker,
    holderBand,
    holderMultiplier,
    holderPrice,
    holderReportAt,
    holderPass,
    winner,
    acceptedClaims,
    configs,
    openingPrices,
    raw,
    scores,
    acquired,
    pools,
  ] = await Promise.all([
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "roundId",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "currentPhase",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "marketMode",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "producerPassRequired",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "startedAt",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "deadline",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "hardEnd",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "settledAt",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "pot",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holder",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderTicker",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderBand",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderMultiplierBps",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderPrice",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderReportAt",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderProducerPass",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "winningTicker",
    }),
    client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "acceptedClaims",
    }),
    Promise.all(
      [0n, 1n, 2n, 3n].map((index) =>
        client.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "tickerConfigs",
          args: [index],
        }),
      ),
    ),
    Promise.all(
      [0n, 1n, 2n, 3n].map((index) =>
        client.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "openingPrices",
          args: [index],
        }),
      ),
    ),
    Promise.all(
      [0, 1, 2, 3].map((index) =>
        client.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "tickerAirtime",
          args: [index],
        }),
      ),
    ),
    Promise.all(
      [0, 1, 2, 3].map((index) =>
        client.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "tickerScore",
          args: [index],
        }),
      ),
    ),
    Promise.all(
      [0n, 1n, 2n, 3n].map((index) =>
        client.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "lastTickerAcquisitionAt",
          args: [index],
        }),
      ),
    ),
    Promise.all(
      (
        [
          "holderPool",
          contractVersion === "closing-print-v3-airtime"
            ? "airtimePool"
            : "closingPrintPool",
          "nextRoundPool",
          "protocolPool",
        ] as const
      ).map((functionName) =>
        client.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName,
        }),
      ),
    ),
  ]);

  const tickers = configs.map((config) =>
    hexToString(config[0], { size: 32 }).replace(/\0/g, ""),
  );
  const eventResult = await database
    .query<EventRow>(
      `SELECT e.transaction_hash,e.log_index,e.block_number,e.args,
              p.display_name,p.handle
       FROM chain_events e
       LEFT JOIN player_profiles p
         ON lower(p.address)=lower(e.args->>'player')
       WHERE e.deployment_key=$1 AND lower(e.contract_address)=lower($2)
         AND e.event_name='BellClaimed'
       ORDER BY e.block_number,e.log_index`,
      [deploymentKey, roundAddress],
    )
    .catch(() => ({ rows: [] as EventRow[] }));
  const indexedClaims: IndexedClaim[] = eventResult.rows.map((event) => {
    const args = event.args;
    const tickerIndex = Number(args.ticker);
    const claimant = args.player as Address;
    return {
      id: `${event.transaction_hash}-${event.log_index}`,
      sequence: Number(args.sequence),
      atSeconds: Number(args.acceptedAt) - Number(startedAt),
      claimant: {
        address: claimant,
        displayName: event.display_name ?? `caller-${claimant.slice(2, 7)}`,
        profileHandle: event.handle ?? undefined,
        ticker: tickers[tickerIndex],
        claimNumber: Number(args.sequence),
        band: bandName(Number(args.marketBand)),
        multiplierBps: Number(args.multiplierBps),
        verifiedPrice: price(BigInt(args.verifiedPrice as string)),
        reportTimestamp: Number(args.reportTimestamp),
        sourcePool: args.sourcePool as `0x${string}`,
        sourceChainId: Number(args.sourceChainId),
        sourceBlockNumber: Number(args.sourceBlockNumber),
        sourceBlockHash: args.sourceBlockHash as `0x${string}`,
        producerPass: Boolean(args.producerPass),
      },
      previousHolder: args.previousHolder as Address,
      previousTicker:
        Number(args.previousTicker) < 4
          ? tickers[Number(args.previousTicker)]
          : undefined,
      feeUsd: Number(args.fee) / 1e6,
      phase: args.rugZone ? "rug" : "live",
      transactionHash: event.transaction_hash,
      blockNumber: Number(event.block_number),
      logIndex: event.log_index,
      contractVersion,
      accepted: true,
      potAfterUsd: Number(args.pot) / 1e6,
      timeAfterSeconds: Number(args.deadline) - Number(args.acceptedAt),
      verifiedPrice: price(BigInt(args.verifiedPrice as string)),
      reportTimestamp: Number(args.reportTimestamp),
      sourceReportHash: args.sourceReportHash as `0x${string}`,
      sourcePool: args.sourcePool as `0x${string}`,
      sourceChainId: Number(args.sourceChainId),
      sourceBlockNumber: Number(args.sourceBlockNumber),
      sourceBlockHash: args.sourceBlockHash as `0x${string}`,
      marketBand: bandName(Number(args.marketBand)),
      multiplierBps: Number(args.multiplierBps),
      producerPass: Boolean(args.producerPass),
      acceptedAt: Number(args.acceptedAt),
    };
  });
  const now = Number(block.timestamp);
  const scoringEnd = Math.min(Number(deadline), Number(hardEnd));
  const claims: ClaimEvent[] = indexedClaims.map((claim, index) => {
    const intervalEnd =
      indexedClaims[index + 1]?.acceptedAt ??
      (Number(phase) >= 4 ? scoringEnd : Math.min(now, scoringEnd));
    const intervalSeconds = Math.max(0, intervalEnd - claim.acceptedAt);
    return {
      id: claim.id,
      sequence: claim.sequence,
      atSeconds: claim.atSeconds,
      claimant: claim.claimant,
      previousHolder: claim.previousHolder,
      previousTicker: claim.previousTicker,
      feeUsd: claim.feeUsd,
      phase: claim.phase,
      transactionHash: claim.transactionHash,
      blockNumber: claim.blockNumber,
      logIndex: claim.logIndex,
      contractVersion: claim.contractVersion,
      accepted: claim.accepted,
      potAfterUsd: claim.potAfterUsd,
      timeAfterSeconds: claim.timeAfterSeconds,
      verifiedPrice: claim.verifiedPrice,
      reportTimestamp: claim.reportTimestamp,
      sourceReportHash: claim.sourceReportHash,
      sourcePool: claim.sourcePool,
      sourceChainId: claim.sourceChainId,
      sourceBlockNumber: claim.sourceBlockNumber,
      sourceBlockHash: claim.sourceBlockHash,
      marketBand: claim.marketBand,
      multiplierBps: claim.multiplierBps,
      intervalSeconds,
      weightedPoints: (intervalSeconds * claim.multiplierBps) / 10_000,
      producerPass: claim.producerPass,
    };
  });

  const deadlineNumber = Number(deadline);
  const hardEndNumber = Number(hardEnd);
  const chainPhase = phaseName(Number(phase));
  const displayedPhase =
    chainPhase === "live" || chainPhase === "rug"
      ? now >= Math.min(deadlineNumber, hardEndNumber)
        ? "finalizing"
        : deadlineNumber - now <= 10
          ? "rug"
          : "live"
      : chainPhase;
  const holderAddress = holder as Address;
  const rawNow = raw.map(Number);
  const scoreNow = scores.map((value) => Number(value) / 10_000);
  const latest = indexedClaims.at(-1);
  if (
    latest &&
    Number(phase) < 4 &&
    holderAddress !== zeroAddress &&
    deadlineNumber > 0
  ) {
    const duration =
      Math.min(now, deadlineNumber, hardEndNumber) - latest.acceptedAt;
    if (duration > 0) {
      rawNow[Number(holderTicker)] += duration;
      scoreNow[Number(holderTicker)] +=
        (duration * Number(holderMultiplier)) / 10_000;
    }
  }

  return {
    roundId: roundId.toString(),
    phase: displayedPhase,
    marketMode: Number(mode) === 1 ? "DEX" : "FLAT",
    broadcastLabel: Number(mode) === 1 ? "HEAT CHECK" : "VOLUME CHECK",
    producerPassRequired: passRequired,
    timeLeftSeconds: Math.max(0, deadlineNumber - now),
    elapsedSeconds: Number(startedAt)
      ? Math.max(0, now - Number(startedAt))
      : 0,
    hardTimeLeftSeconds: Math.max(0, hardEndNumber - now),
    potUsd: usd(pot),
    holder:
      holderAddress === zeroAddress
        ? null
        : {
            address: holderAddress,
            displayName:
              latest?.claimant.displayName ??
              `caller-${holderAddress.slice(2, 7)}`,
            profileHandle: latest?.claimant.profileHandle,
            ticker: tickers[Number(holderTicker)],
            claimNumber: Number(acceptedClaims),
            band: bandName(Number(holderBand)),
            multiplierBps: Number(holderMultiplier),
            verifiedPrice: price(holderPrice),
            reportTimestamp: Number(holderReportAt),
            sourcePool: latest?.sourcePool,
            sourceChainId: latest?.sourceChainId,
            sourceBlockNumber: latest?.sourceBlockNumber,
            sourceBlockHash: latest?.sourceBlockHash,
            producerPass: holderPass,
          },
    tickerScores: tickers.map((ticker: TickerId, index) => ({
      ticker,
      rawSeconds: rawNow[index],
      weightedScore: scoreNow[index],
      lastAcquisitionAt: Number(acquired[index]),
      currentBand:
        Number(holderTicker) === index ? bandName(Number(holderBand)) : "FLAT",
      multiplierBps:
        Number(holderTicker) === index ? Number(holderMultiplier) : 10_000,
      openingPrice: price(openingPrices[index]),
    })),
    claims,
    freshness: "live",
    updatedAt: new Date(now * 1000).toISOString(),
    chainId: manifest.chainId,
    contractAddress: roundAddress,
    contractVersion,
    blockNumber: Number(block.number),
    startedAt: Number(startedAt),
    deadline: deadlineNumber,
    hardEnd: hardEndNumber,
    settledAt: Number(settledAt) || undefined,
    winningTicker: Number(winner) < 4 ? tickers[Number(winner)] : undefined,
    pools: {
      holderUsd: usd(pools[0]),
      airtimeUsd:
        contractVersion === "closing-print-v3-airtime" ? usd(pools[1]) : 0,
      historicalClosingPrintPoolUsd:
        contractVersion !== "closing-print-v3-airtime"
          ? usd(pools[1])
          : undefined,
      nextRoundUsd: usd(pools[2]),
      protocolUsd: usd(pools[3]),
    },
  };
}
