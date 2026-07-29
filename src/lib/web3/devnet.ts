import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import deployment from "../../../deployments/31337.json";
import type {
  ClaimEvent,
  FactionId,
  RoundPhase,
  RoundState,
} from "@/lib/game/types";
import { factions } from "@/lib/game/constants";
import { lastBellAbi } from "./last-bell-abi";
import { localDevnet } from "./chains";

const serverRpc = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
const roundAddress = (process.env.NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS ||
  deployment.lastBellRound) as Address;
const playerAddresses = deployment.players as Address[];

export const devnetPublicClient = createPublicClient({
  chain: localDevnet,
  cacheTime: 0,
  transport: http(serverRpc),
});

const factionId = (value: number): FactionId =>
  factions[value]?.id ?? factions[0].id;

const phaseName = (phase: number): RoundPhase => {
  if (phase === 0) return "entry";
  if (phase === 1) return "live";
  if (phase === 2) return "rug";
  if (phase === 3) return "finalizing";
  if (phase === 4) return "settled";
  return "cancelled";
};

export async function getDevnetSnapshot(): Promise<RoundState> {
  const [
    phase,
    deadline,
    hardEnd,
    pot,
    holder,
    holderFaction,
    acceptedClaims,
    airtime0,
    airtime1,
    airtime2,
    airtime3,
    block,
    logs,
  ] = await Promise.all([
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "currentPhase",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "deadline",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "hardEnd",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "pot",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holder",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderFaction",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "acceptedClaims",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "factionAirtime",
      args: [0],
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "factionAirtime",
      args: [1],
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "factionAirtime",
      args: [2],
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "factionAirtime",
      args: [3],
    }),
    devnetPublicClient.getBlock(),
    devnetPublicClient.getContractEvents({
      address: roundAddress,
      abi: lastBellAbi,
      eventName: "BellClaimed",
      fromBlock: BigInt(0),
    }),
  ]);

  const now = Number(block.timestamp);
  const deadlineNumber = Number(deadline);
  const hardEndNumber = Number(hardEnd);
  const holderAddress = holder as Address;
  const holderFactionId = factionId(Number(holderFaction));
  const claims: ClaimEvent[] = logs.map((log) => {
    const args = log.args;
    const address = args.player as Address;
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      sequence: Number(args.sequence),
      atSeconds: Number(args.acceptedAt),
      claimant: {
        address,
        displayName: `caller-${address.slice(2, 7)}`,
        faction: factionId(Number(args.faction)),
        claimNumber: Number(args.sequence),
      },
      accepted: true,
      potAfterUsd: Number(args.pot) / 1e6,
      timeAfterSeconds: Math.max(
        0,
        Number(args.deadline) - Number(args.acceptedAt),
      ),
    };
  });

  const airtimeValues = [airtime0, airtime1, airtime2, airtime3].map(Number);
  const latestClaim = logs.at(-1);
  if (
    latestClaim &&
    Number(phase) !== 4 &&
    Number(phase) !== 5 &&
    holderAddress !== "0x0000000000000000000000000000000000000000"
  ) {
    const accruedUntil = Math.min(now, deadlineNumber, hardEndNumber);
    airtimeValues[Number(holderFaction)] += Math.max(
      0,
      accruedUntil - Number(latestClaim.args.acceptedAt),
    );
  }

  return {
    phase: phaseName(Number(phase)),
    timeLeftSeconds: Math.max(0, deadlineNumber - now),
    elapsedSeconds: claims.length ? Math.max(0, now - claims[0].atSeconds) : 0,
    hardTimeLeftSeconds: Math.max(0, hardEndNumber - now),
    potUsd: Number(pot) / 1e6,
    holder:
      holderAddress === "0x0000000000000000000000000000000000000000"
        ? null
        : {
            address: holderAddress,
            displayName: `caller-${holderAddress.slice(2, 7)}`,
            faction: holderFactionId,
            claimNumber: Number(acceptedClaims),
          },
    airtime: factions.map((faction, index) => ({
      faction: faction.id,
      seconds: airtimeValues[index],
    })),
    claims,
    freshness: "live",
    updatedAt: new Date(now * 1000).toISOString(),
  };
}

export async function sendDevnetAction(
  action: "claim" | "finalize",
  faction?: FactionId,
) {
  const snapshot = await getDevnetSnapshot();
  let account = playerAddresses[0];

  if (action === "claim") {
    const index = Math.max(
      0,
      factions.findIndex((item) => item.id === faction),
    );
    const candidates = [playerAddresses[index], playerAddresses[index + 4]];
    account =
      candidates.find(
        (candidate) =>
          candidate.toLowerCase() !== snapshot.holder?.address.toLowerCase(),
      ) ?? candidates[0];
  }

  const walletClient = createWalletClient({
    account,
    chain: localDevnet,
    transport: http(serverRpc),
  });
  const { request } = await devnetPublicClient.simulateContract({
    account,
    address: roundAddress,
    abi: lastBellAbi,
    functionName: action === "claim" ? "claimBell" : "finalize",
  });
  const hash = await walletClient.writeContract({
    ...request,
    gas: BigInt(350_000),
  });
  const receipt = await devnetPublicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Devnet transaction ${hash} reverted`);
  }
  return { hash, state: await getDevnetSnapshot() };
}
