import {
  createPublicClient,
  createWalletClient,
  hexToString,
  http,
  type Address,
  type Hash,
} from "viem";
import deploymentJson from "../../../deployments/31337.json";
import type {
  ClaimableBalances,
  ClaimEvent,
  FactionId,
  RoundPhase,
  RoundState,
  SessionBudget,
} from "@/lib/game/types";
import { factions, sessionApproval } from "@/lib/game/constants";
import { devDollarAbi, lastBellAbi } from "./last-bell-abi";
import { localDevnet } from "./chains";

type DevnetDeployment = {
  chainId: number;
  rpcUrl: string;
  deployer: Address;
  devDollar: Address;
  lastBellRound: Address;
  players: Address[];
  sessionPlayer?: Address;
};

const deployment = deploymentJson as DevnetDeployment;
const serverRpc = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
export const roundAddress = (process.env.NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS ||
  deployment.lastBellRound) as Address;
export const devDollarAddress = (process.env.NEXT_PUBLIC_DEV_DOLLAR_ADDRESS ||
  deployment.devDollar) as Address;
const playerAddresses = deployment.players;
export const devnetSessionPlayer =
  deployment.sessionPlayer ||
  ("0xa0ee7a142d267c1f36714e4a8f75612f20a79720" as Address);

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

const unitsToUsd = (value: bigint) => Number(value) / 1e6;

export async function getDevnetSnapshot(): Promise<RoundState> {
  const [
    phase,
    startedAt,
    deadline,
    hardEnd,
    pot,
    holder,
    holderFaction,
    winningFaction,
    acceptedClaims,
  ] = await Promise.all([
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "currentPhase",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "startedAt",
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
      functionName: "winningFaction",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "acceptedClaims",
    }),
  ] as const);
  const [airtime0, airtime1, airtime2, airtime3] = await Promise.all(
    ([0, 1, 2, 3] as const).map((faction) =>
      devnetPublicClient.readContract({
        address: roundAddress,
        abi: lastBellAbi,
        functionName: "factionAirtime",
        args: [faction],
      }),
    ),
  );
  const [
    holderPool,
    factionPool,
    nextRoundPool,
    protocolPool,
    block,
    logs,
    settlements,
    cancellations,
  ] = await Promise.all([
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderPool",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "factionPool",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "nextRoundPool",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "protocolPool",
    }),
    devnetPublicClient.getBlock(),
    devnetPublicClient.getContractEvents({
      address: roundAddress,
      abi: lastBellAbi,
      eventName: "BellClaimed",
      fromBlock: 0n,
    }),
    devnetPublicClient.getContractEvents({
      address: roundAddress,
      abi: lastBellAbi,
      eventName: "RoundSettled",
      fromBlock: 0n,
    }),
    devnetPublicClient.getContractEvents({
      address: roundAddress,
      abi: lastBellAbi,
      eventName: "RoundCancelled",
      fromBlock: 0n,
    }),
  ] as const);

  const now = Number(block.timestamp);
  const deadlineNumber = Number(deadline);
  const hardEndNumber = Number(hardEnd);
  const holderAddress = holder as Address;
  const holderFactionId = factionId(Number(holderFaction));
  const claims: ClaimEvent[] = logs.map((log) => {
    const args = log.args;
    const address = args.player as Address;
    const previousFactionValue = Number(args.previousFaction);
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
      previousHolder: args.previousHolder as Address,
      previousFaction:
        previousFactionValue < factions.length
          ? factionId(previousFactionValue)
          : undefined,
      feeUsd: unitsToUsd(args.fee ?? 0n),
      phase: args.rugZone ? "rug" : "live",
      transactionHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: log.logIndex,
      accepted: true,
      potAfterUsd: unitsToUsd(args.pot ?? 0n),
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

  const cancellation = cancellations.at(-1);
  const settlement = settlements.at(-1);
  return {
    phase: phaseName(Number(phase)),
    timeLeftSeconds: Math.max(0, deadlineNumber - now),
    elapsedSeconds: claims.length ? Math.max(0, now - claims[0].atSeconds) : 0,
    hardTimeLeftSeconds: Math.max(0, hardEndNumber - now),
    potUsd: unitsToUsd(pot),
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
    settlementTx: settlement?.transactionHash,
    chainId: localDevnet.id,
    contractAddress: roundAddress,
    blockNumber: Number(block.number),
    startedAt: Number(startedAt),
    deadline: deadlineNumber,
    hardEnd: hardEndNumber,
    winningFaction:
      Number(winningFaction) < factions.length
        ? factionId(Number(winningFaction))
        : undefined,
    pools: {
      holderUsd: unitsToUsd(holderPool),
      factionUsd: unitsToUsd(factionPool),
      nextRoundUsd: unitsToUsd(nextRoundPool),
      protocolUsd: unitsToUsd(protocolPool),
    },
    cancellationReason: cancellation?.args.reason
      ? hexToString(cancellation.args.reason, { size: 32 })
      : undefined,
  };
}

export async function getDevnetSession(
  player: Address = devnetSessionPlayer,
): Promise<{ session: SessionBudget; claimable: ClaimableBalances }> {
  const snapshot = await getDevnetSnapshot();
  const [
    faction,
    spent,
    allowance,
    holderClaimed,
    factionClaimed,
    refundClaimed,
    control,
  ] = await Promise.all([
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "factionOf",
      args: [player],
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "paid",
      args: [player],
    }),
    devnetPublicClient.readContract({
      address: devDollarAddress,
      abi: devDollarAbi,
      functionName: "allowance",
      args: [player, roundAddress],
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderRewardClaimed",
      args: [player],
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "factionRewardClaimed",
      args: [player],
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "refundClaimed",
      args: [player],
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "controlTime",
      args: [player],
    }),
  ]);

  const joined = Number(faction) < factions.length;
  const spentUsd = unitsToUsd(spent);
  const allowanceUsd = unitsToUsd(allowance);
  const expired =
    snapshot.phase === "settled" || snapshot.phase === "cancelled";
  const revoked = joined && allowance === 0n && !expired;
  const playerFaction = joined ? factionId(Number(faction)) : null;
  const factionEligible =
    snapshot.phase === "settled" &&
    playerFaction === snapshot.winningFaction &&
    control > 0n &&
    !factionClaimed;
  const factionTotal = playerFaction
    ? snapshot.airtime.find((score) => score.faction === playerFaction)
        ?.seconds || 0
    : 0;

  return {
    session: {
      player,
      faction: playerFaction,
      maximumUsd: allowanceUsd,
      spentUsd,
      remainingUsd: allowanceUsd,
      availableActions: Math.max(0, Math.floor(allowanceUsd)),
      allowanceUsd,
      expiresAt: snapshot.deadline ?? null,
      status: !joined
        ? "unjoined"
        : expired
          ? "expired"
          : revoked
            ? "revoked"
            : "active",
      mode: "devnet-guest",
    },
    claimable: {
      holderUsd:
        snapshot.phase === "settled" &&
        snapshot.holder?.address.toLowerCase() === player.toLowerCase() &&
        !holderClaimed
          ? snapshot.pools?.holderUsd || 0
          : 0,
      factionUsd:
        factionEligible && factionTotal > 0
          ? ((snapshot.pools?.factionUsd || 0) * Number(control)) / factionTotal
          : 0,
      refundUsd:
        snapshot.phase === "cancelled" && !refundClaimed ? spentUsd : 0,
    },
  };
}

async function sendContract(
  account: Address,
  functionName:
    | "joinFaction"
    | "claimBell"
    | "finalize"
    | "claimHolderReward"
    | "claimFactionReward"
    | "claimCancellationRefund",
  args?: readonly [number],
): Promise<Hash> {
  const walletClient = createWalletClient({
    account,
    chain: localDevnet,
    transport: http(serverRpc),
  });
  const common = {
    account,
    chain: localDevnet,
    address: roundAddress,
    abi: lastBellAbi,
    gas: 450_000n,
  } as const;
  const hash =
    functionName === "joinFaction"
      ? await walletClient.writeContract({
          ...common,
          functionName,
          args: args!,
        })
      : functionName === "claimBell"
        ? await walletClient.writeContract({ ...common, functionName })
        : functionName === "finalize"
          ? await walletClient.writeContract({ ...common, functionName })
          : functionName === "claimHolderReward"
            ? await walletClient.writeContract({ ...common, functionName })
            : functionName === "claimFactionReward"
              ? await walletClient.writeContract({ ...common, functionName })
              : await walletClient.writeContract({ ...common, functionName });
  const receipt = await devnetPublicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Devnet transaction ${hash} reverted`);
  }
  return hash;
}

async function approveSession(account: Address, amount: bigint): Promise<Hash> {
  const walletClient = createWalletClient({
    account,
    chain: localDevnet,
    transport: http(serverRpc),
  });
  const { request } = await devnetPublicClient.simulateContract({
    account,
    address: devDollarAddress,
    abi: devDollarAbi,
    functionName: "approve",
    args: [roundAddress, amount],
  });
  const hash = await walletClient.writeContract({ ...request, gas: 150_000n });
  await devnetPublicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export type DevnetAction =
  | "enter"
  | "claim"
  | "demo-claim"
  | "finalize"
  | "revoke"
  | "claim-holder"
  | "claim-faction"
  | "claim-refund";

export async function fundDevnetWallet(player: Address, amountUsd = 25) {
  const account = deployment.deployer;
  const walletClient = createWalletClient({
    account,
    chain: localDevnet,
    transport: http(serverRpc),
  });
  const { request } = await devnetPublicClient.simulateContract({
    account,
    address: devDollarAddress,
    abi: devDollarAbi,
    functionName: "mint",
    args: [player, BigInt(amountUsd * 1e6)],
  });
  const hash = await walletClient.writeContract({ ...request, gas: 150_000n });
  const receipt = await devnetPublicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Devnet faucet transaction ${hash} reverted`);
  }
  return hash;
}

export async function sendDevnetAction(
  action: DevnetAction,
  faction?: FactionId,
) {
  let hash: Hash;
  if (action === "enter") {
    const factionIndex = factions.findIndex((item) => item.id === faction);
    if (factionIndex < 0) throw new Error("Select one of the four bags.");
    await approveSession(
      devnetSessionPlayer,
      BigInt(sessionApproval.amountUsd * 1e6),
    );
    hash = await sendContract(devnetSessionPlayer, "joinFaction", [
      factionIndex,
    ]);
  } else if (action === "revoke") {
    hash = await approveSession(devnetSessionPlayer, 0n);
  } else if (action === "claim") {
    const allowance = await devnetPublicClient.readContract({
      address: devDollarAddress,
      abi: devDollarAbi,
      functionName: "allowance",
      args: [devnetSessionPlayer, roundAddress],
    });
    if (allowance < BigInt(sessionApproval.refreshBelowUsd * 1e6)) {
      await approveSession(
        devnetSessionPlayer,
        BigInt(sessionApproval.amountUsd * 1e6),
      );
    }
    hash = await sendContract(devnetSessionPlayer, "claimBell");
  } else if (action === "demo-claim") {
    const snapshot = await getDevnetSnapshot();
    const index = Math.max(
      0,
      factions.findIndex((item) => item.id === faction),
    );
    const candidates = [playerAddresses[index], playerAddresses[index + 4]];
    const account =
      candidates.find(
        (candidate) =>
          candidate.toLowerCase() !== snapshot.holder?.address.toLowerCase(),
      ) ?? candidates[0];
    hash = await sendContract(account, "claimBell");
  } else {
    const functionName = {
      finalize: "finalize",
      "claim-holder": "claimHolderReward",
      "claim-faction": "claimFactionReward",
      "claim-refund": "claimCancellationRefund",
    }[action] as
      | "finalize"
      | "claimHolderReward"
      | "claimFactionReward"
      | "claimCancellationRefund";
    const account =
      action === "finalize" ? playerAddresses[0] : devnetSessionPlayer;
    hash = await sendContract(account, functionName);
  }

  return {
    hash,
    state: await getDevnetSnapshot(),
    ...(await getDevnetSession()),
  };
}
