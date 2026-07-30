import "server-only";
import { hexToString, type Address, zeroAddress } from "viem";
import type { ClaimEvent, RoundState, TickerId } from "@/lib/game/types";
import { database } from "@/lib/server/db";
import {
  loadServerDeployment,
} from "@/lib/server/deployment";
import { deploymentPublicClient } from "@/lib/server/rpc-client";
import { lastBellAbi, roundManagerAbi } from "./last-bell-abi";

const phaseName = (phase: number): RoundState["phase"] =>
  (["entry", "live", "rug", "finalizing", "settled", "cancelled"] as const)[
    phase
  ] ?? "cancelled";
const bandName = (band: number) =>
  (["RED", "FLAT", "GREEN"] as const)[band] ?? "FLAT";
const usd = (value: bigint) => Number(value) / 1e6;
const price = (value: bigint) => Number(value) / 1e8;

type EventRow = {
  transaction_hash: `0x${string}`;
  log_index: number;
  block_number: string;
  args: Record<string, string | number | boolean>;
};

type IndexedClaim = ClaimEvent & { acceptedAt: number };

export async function getLiveSnapshot(): Promise<RoundState> {
  const manifest = await loadServerDeployment();
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
  const roundAddress = prepared !== zeroAddress ? prepared : active;
  if (roundAddress === zeroAddress) {
    throw new Error("No active or prepared broadcast is deployed.");
  }

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
    raw,
    scores,
    acquired,
    pools,
  ] = await Promise.all([
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "roundId" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "currentPhase" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "marketMode" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "producerPassRequired" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "startedAt" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "deadline" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "hardEnd" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "settledAt" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "pot" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "holder" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "holderTicker" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "holderBand" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "holderMultiplierBps" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "holderPrice" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "holderReportAt" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "holderProducerPass" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "winningTicker" }),
    client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "acceptedClaims" }),
    Promise.all([0n, 1n, 2n, 3n].map((index) =>
      client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "tickerConfigs", args: [index] }),
    )),
    Promise.all([0, 1, 2, 3].map((index) =>
      client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "tickerAirtime", args: [index] }),
    )),
    Promise.all([0, 1, 2, 3].map((index) =>
      client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "tickerScore", args: [index] }),
    )),
    Promise.all([0n, 1n, 2n, 3n].map((index) =>
      client.readContract({ address: roundAddress, abi: lastBellAbi, functionName: "lastTickerAcquisitionAt", args: [index] }),
    )),
    Promise.all((["holderPool", "closingPrintPool", "nextRoundPool", "protocolPool"] as const).map((functionName) =>
      client.readContract({ address: roundAddress, abi: lastBellAbi, functionName }),
    )),
  ]);

  const tickers = configs.map((config) =>
    hexToString(config[0], { size: 32 }).replace(/\0/g, ""),
  );
  const eventResult = await database
    .query<EventRow>(
      `SELECT transaction_hash,log_index,block_number,args
       FROM chain_events
       WHERE chain_id=$1 AND lower(contract_address)=lower($2)
         AND event_name='BellClaimed'
       ORDER BY block_number,log_index`,
      [manifest.chainId, roundAddress],
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
        displayName: `caller-${claimant.slice(2, 7)}`,
        ticker: tickers[tickerIndex],
        claimNumber: Number(args.sequence),
        band: bandName(Number(args.marketBand)),
        multiplierBps: Number(args.multiplierBps),
        verifiedPrice: Number(args.verifiedPrice) / 1e8,
        reportTimestamp: Number(args.reportTimestamp),
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
      contractVersion: "closing-print-v1",
      accepted: true,
      potAfterUsd: Number(args.pot) / 1e6,
      timeAfterSeconds:
        Number(args.deadline) - Number(args.acceptedAt),
      verifiedPrice: Number(args.verifiedPrice) / 1e8,
      reportTimestamp: Number(args.reportTimestamp),
      sourceReportHash: args.sourceReportHash as `0x${string}`,
      marketBand: bandName(Number(args.marketBand)),
      multiplierBps: Number(args.multiplierBps),
      producerPass: Boolean(args.producerPass),
      acceptedAt: Number(args.acceptedAt),
    };
  });
  const claims: ClaimEvent[] = indexedClaims.map((claim) => ({
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
    marketBand: claim.marketBand,
    multiplierBps: claim.multiplierBps,
    producerPass: claim.producerPass,
  }));

  const now = Number(block.timestamp);
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
      Math.min(now, deadlineNumber, hardEndNumber) -
      latest.acceptedAt;
    if (duration > 0) {
      rawNow[Number(holderTicker)] += duration;
      scoreNow[Number(holderTicker)] +=
        (duration * Number(holderMultiplier)) / 10_000;
    }
  }

  return {
    roundId: roundId.toString(),
    phase: displayedPhase,
    marketMode: Number(mode) === 1 ? "VERIFIED" : "FLAT",
    broadcastLabel: Number(mode) === 1 ? "HEAT CHECK" : "VOLUME CHECK",
    producerPassRequired: passRequired,
    timeLeftSeconds: Math.max(0, deadlineNumber - now),
    elapsedSeconds: Number(startedAt) ? Math.max(0, now - Number(startedAt)) : 0,
    hardTimeLeftSeconds: Math.max(0, hardEndNumber - now),
    potUsd: usd(pot),
    holder:
      holderAddress === zeroAddress
        ? null
        : {
            address: holderAddress,
            displayName: `caller-${holderAddress.slice(2, 7)}`,
            ticker: tickers[Number(holderTicker)],
            claimNumber: Number(acceptedClaims),
            band: bandName(Number(holderBand)),
            multiplierBps: Number(holderMultiplier),
            verifiedPrice: price(holderPrice),
            reportTimestamp: Number(holderReportAt),
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
    })),
    claims,
    freshness: "live",
    updatedAt: new Date(now * 1000).toISOString(),
    chainId: manifest.chainId,
    contractAddress: roundAddress,
    contractVersion: "closing-print-v1",
    blockNumber: Number(block.number),
    startedAt: Number(startedAt),
    deadline: deadlineNumber,
    hardEnd: hardEndNumber,
    settledAt: Number(settledAt) || undefined,
    winningTicker:
      Number(winner) < 4 ? tickers[Number(winner)] : undefined,
    pools: {
      holderUsd: usd(pools[0]),
      closingPrintUsd: usd(pools[1]),
      nextRoundUsd: usd(pools[2]),
      protocolUsd: usd(pools[3]),
    },
  };
}
