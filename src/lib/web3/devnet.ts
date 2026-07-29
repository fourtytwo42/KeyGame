import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  hexToString,
  http,
  type Address,
  type Hash,
  zeroAddress,
} from "viem";
import deploymentJson from "../../../deployments/31337.json";
import type {
  ClaimableBalances,
  ClaimEvent,
  MarketBand,
  RoundPhase,
  RoundState,
  SessionBudget,
  TickerId,
} from "@/lib/game/types";
import { sessionApproval, tickerSlots } from "@/lib/game/constants";
import { devDollarAbi, lastBellAbi } from "./last-bell-abi";
import { localDevnet } from "./chains";

type DevnetDeployment = {
  chainId: number;
  rpcUrl: string;
  deployer: Address;
  devDollar: Address;
  marketVerifier?: Address;
  stockTokens?: Address[];
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

const tickerId = (value: number): TickerId =>
  tickerSlots[value]?.id ?? tickerSlots[0].id;
const marketBand = (value: number): MarketBand =>
  value === 0 ? "RED" : value === 2 ? "GREEN" : "FLAT";
const phaseName = (phase: number): RoundPhase =>
  phase === 0
    ? "entry"
    : phase === 1
      ? "live"
      : phase === 2
        ? "rug"
        : phase === 3
          ? "finalizing"
          : phase === 4
            ? "settled"
            : "cancelled";
const unitsToUsd = (value: bigint) => Number(value) / 1e6;
const reportPrice = (value: bigint) => Number(value) / 1e8;

export async function createMockMarketReport(ticker: TickerId) {
  const index = tickerSlots.findIndex((slot) => slot.id === ticker);
  if (index < 0) throw new Error("Unknown ticker.");
  const [config, opening, block, acceptedClaims, mode] = await Promise.all([
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "tickerConfigs",
      args: [BigInt(index)],
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "openingPrices",
      args: [BigInt(index)],
    }),
    devnetPublicClient.getBlock(),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "acceptedClaims",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "marketMode",
    }),
  ]);
  if (Number(mode) === 0) {
    return {
      ticker,
      tickerIndex: index,
      report: "0x" as const,
      price: reportPrice(opening),
      observedAt: Number(block.timestamp),
      band: "FLAT" as const,
      multiplierBps: 10_000,
    };
  }
  const bandOffset = [6, 0, -6, 0][index];
  const nonce = Number(acceptedClaims % 3n);
  const price =
    (opening * BigInt(10_000 + bandOffset)) / 10_000n + BigInt(nonce);
  const observedAt =
    BigInt(Math.floor(Date.now() / 1000)) > block.timestamp
      ? BigInt(Math.floor(Date.now() / 1000))
      : block.timestamp;
  const report = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint64" },
      { type: "uint64" },
      { type: "uint64" },
    ],
    [config[2], price, observedAt, observedAt, observedAt + 30n],
  );
  const band = bandOffset >= 5 ? "GREEN" : bandOffset <= -5 ? "RED" : "FLAT";
  return {
    ticker,
    tickerIndex: index,
    report,
    price: reportPrice(price),
    observedAt: Number(observedAt),
    band,
    multiplierBps: band === "GREEN" ? 12_500 : band === "RED" ? 7_500 : 10_000,
  };
}

export async function getDevnetSnapshot(): Promise<RoundState> {
  const [
    phase,
    mode,
    passRequired,
    startedAt,
    deadline,
    hardEnd,
    pot,
    holder,
    holderTicker,
    holderBand,
    holderMultiplier,
    holderPrice,
    holderReportAt,
    holderPass,
    winningTicker,
    acceptedClaims,
    block,
  ] = await Promise.all([
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "currentPhase",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "marketMode",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "producerPassRequired",
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
      functionName: "holderTicker",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderBand",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderMultiplierBps",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderPrice",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderReportAt",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "holderProducerPass",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "winningTicker",
    }),
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "acceptedClaims",
    }),
    devnetPublicClient.getBlock(),
  ] as const);

  const [
    rawValues,
    scoreValues,
    acquiredValues,
    pools,
    logs,
    credits,
    settlements,
    cancellations,
  ] = await Promise.all([
    Promise.all(
      ([0, 1, 2, 3] as const).map((ticker) =>
        devnetPublicClient.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "tickerAirtime",
          args: [ticker],
        }),
      ),
    ),
    Promise.all(
      ([0, 1, 2, 3] as const).map((ticker) =>
        devnetPublicClient.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "tickerScore",
          args: [ticker],
        }),
      ),
    ),
    Promise.all(
      ([0, 1, 2, 3] as const).map((ticker) =>
        devnetPublicClient.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "lastTickerAcquisitionAt",
          args: [BigInt(ticker)],
        }),
      ),
    ),
    Promise.all(
      ["holderPool", "closingPrintPool", "nextRoundPool", "protocolPool"].map(
        (functionName) =>
          devnetPublicClient.readContract({
            address: roundAddress,
            abi: lastBellAbi,
            functionName: functionName as
              | "holderPool"
              | "closingPrintPool"
              | "nextRoundPool"
              | "protocolPool",
          }),
      ),
    ),
    devnetPublicClient.getContractEvents({
      address: roundAddress,
      abi: lastBellAbi,
      eventName: "BellClaimed",
      fromBlock: 0n,
    }),
    devnetPublicClient.getContractEvents({
      address: roundAddress,
      abi: lastBellAbi,
      eventName: "ControlCredited",
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
  ]);

  // Automining Anvil advances its timestamp only when a transaction lands.
  // Wall time keeps the read-only studio clock honest between transactions.
  const now = Math.max(Number(block.timestamp), Math.floor(Date.now() / 1000));
  const deadlineNumber = Number(deadline);
  const hardEndNumber = Number(hardEnd);
  const holderAddress = holder as Address;
  const raw = rawValues.map(Number);
  const scores = scoreValues.map((value) => Number(value) / 10_000);
  const latestClaim = logs.at(-1);
  if (latestClaim && Number(phase) < 4 && holderAddress !== zeroAddress) {
    const duration =
      Math.min(now, deadlineNumber, hardEndNumber) -
      Number(latestClaim.args.acceptedAt);
    if (duration > 0) {
      raw[Number(holderTicker)] += duration;
      scores[Number(holderTicker)] +=
        (duration * Number(holderMultiplier)) / 10_000;
    }
  }

  const claims: ClaimEvent[] = logs.map((log) => {
    const args = log.args;
    const address = args.player as Address;
    const credit = credits.find(
      (item) =>
        item.args.player?.toLowerCase() ===
          (args.previousHolder as Address).toLowerCase() &&
        Number(item.args.intervalEnd) === Number(args.acceptedAt),
    );
    const band = marketBand(Number(args.marketBand));
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      sequence: Number(args.sequence),
      atSeconds: Number(args.acceptedAt) - Number(startedAt),
      claimant: {
        address,
        displayName: `caller-${address.slice(2, 7)}`,
        ticker: tickerId(Number(args.ticker)),
        claimNumber: Number(args.sequence),
        band,
        multiplierBps: Number(args.multiplierBps),
        verifiedPrice: reportPrice(args.verifiedPrice ?? 0n),
        reportTimestamp: Number(args.reportTimestamp),
        producerPass: Boolean(args.producerPass),
      },
      previousHolder: args.previousHolder as Address,
      previousTicker:
        Number(args.previousTicker) < 4
          ? tickerId(Number(args.previousTicker))
          : undefined,
      feeUsd: unitsToUsd(args.fee ?? 0n),
      phase: args.rugZone ? "rug" : "live",
      transactionHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: log.logIndex,
      contractVersion: "closing-print-v1",
      accepted: true,
      potAfterUsd: unitsToUsd(args.pot ?? 0n),
      timeAfterSeconds: Math.max(
        0,
        Number(args.deadline) - Number(args.acceptedAt),
      ),
      verifiedPrice: reportPrice(args.verifiedPrice ?? 0n),
      reportTimestamp: Number(args.reportTimestamp),
      marketBand: band,
      multiplierBps: Number(args.multiplierBps),
      intervalSeconds: credit ? Number(credit.args.duration) : undefined,
      weightedPoints: credit
        ? Number(credit.args.weightedScore) / 10_000
        : undefined,
      producerPass: Boolean(args.producerPass),
    };
  });

  const cancellation = cancellations.at(-1);
  const settlement = settlements.at(-1);
  const chainPhase = phaseName(Number(phase));
  const displayedPhase =
    chainPhase === "live" || chainPhase === "rug"
      ? now >= Math.min(deadlineNumber, hardEndNumber)
        ? "finalizing"
        : deadlineNumber - now <= 10
          ? "rug"
          : "live"
      : chainPhase;
  return {
    phase: displayedPhase,
    marketMode: Number(mode) === 1 ? "VERIFIED" : "FLAT",
    broadcastLabel: Number(mode) === 1 ? "HEAT CHECK" : "VOLUME CHECK",
    producerPassRequired: passRequired,
    timeLeftSeconds: Math.max(0, deadlineNumber - now),
    elapsedSeconds: Math.max(0, now - Number(startedAt)),
    hardTimeLeftSeconds: Math.max(0, hardEndNumber - now),
    potUsd: unitsToUsd(pot),
    holder:
      holderAddress === zeroAddress
        ? null
        : {
            address: holderAddress,
            displayName: `caller-${holderAddress.slice(2, 7)}`,
            ticker: tickerId(Number(holderTicker)),
            claimNumber: Number(acceptedClaims),
            band: marketBand(Number(holderBand)),
            multiplierBps: Number(holderMultiplier),
            verifiedPrice: reportPrice(holderPrice),
            reportTimestamp: Number(holderReportAt),
            producerPass: holderPass,
          },
    tickerScores: tickerSlots.map((ticker, index) => ({
      ticker: ticker.id,
      rawSeconds: raw[index],
      weightedScore: scores[index],
      lastAcquisitionAt: Number(acquiredValues[index]),
      currentBand:
        Number(holderTicker) === index
          ? marketBand(Number(holderBand))
          : ticker.currentBand,
      multiplierBps:
        Number(holderTicker) === index
          ? Number(holderMultiplier)
          : ticker.multiplierBps,
    })),
    claims,
    freshness: "live",
    updatedAt: new Date(now * 1000).toISOString(),
    settlementTx: settlement?.transactionHash,
    chainId: localDevnet.id,
    contractAddress: roundAddress,
    contractVersion: "closing-print-v1",
    blockNumber: Number(block.number),
    startedAt: Number(startedAt),
    deadline: deadlineNumber,
    hardEnd: hardEndNumber,
    winningTicker:
      Number(winningTicker) < 4 ? tickerId(Number(winningTicker)) : undefined,
    pools: {
      holderUsd: unitsToUsd(pools[0]),
      closingPrintUsd: unitsToUsd(pools[1]),
      nextRoundUsd: unitsToUsd(pools[2]),
      protocolUsd: unitsToUsd(pools[3]),
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
  const [spent, allowance, holderClaimed, printClaimed, refundClaimed] =
    await Promise.all([
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
        functionName: "closingPrintRewardClaimed",
        args: [player],
      }),
      devnetPublicClient.readContract({
        address: roundAddress,
        abi: lastBellAbi,
        functionName: "refundClaimed",
        args: [player],
      }),
    ]);
  const winnerIndex = snapshot.winningTicker
    ? tickerSlots.findIndex((ticker) => ticker.id === snapshot.winningTicker)
    : 0;
  const [playerScore, tokenConfigs] = await Promise.all([
    devnetPublicClient.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "playerTickerScore",
      args: [player, winnerIndex],
    }),
    Promise.all(
      [0n, 1n, 2n, 3n].map((index) =>
        devnetPublicClient.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "tickerConfigs",
          args: [index],
        }),
      ),
    ),
  ]);
  const tokenBalances = await Promise.all(
    tokenConfigs.map((config) =>
      devnetPublicClient.readContract({
        address: config[1],
        abi: devDollarAbi,
        functionName: "balanceOf",
        args: [player],
      }),
    ),
  );
  const spentUsd = unitsToUsd(spent);
  const allowanceUsd = unitsToUsd(allowance);
  const expired =
    snapshot.phase === "settled" || snapshot.phase === "cancelled";
  const firstClaim = snapshot.claims.find(
    (claim) => claim.claimant.address.toLowerCase() === player.toLowerCase(),
  );
  const winningTotal =
    snapshot.tickerScores.find(
      (score) => score.ticker === snapshot.winningTicker,
    )?.weightedScore ?? 0;
  return {
    session: {
      player,
      starterTicker: firstClaim?.claimant.ticker ?? null,
      maximumUsd: allowanceUsd,
      spentUsd,
      remainingUsd: allowanceUsd,
      availableActions: Math.max(0, Math.floor(allowanceUsd)),
      allowanceUsd,
      expiresAt: snapshot.deadline ?? null,
      status:
        spent === 0n
          ? "new"
          : expired
            ? "expired"
            : allowance === 0n
              ? "revoked"
              : "active",
      mode: "devnet-guest",
      producerPass: tokenBalances.some((balance) => balance > 0n),
    },
    claimable: {
      holderUsd:
        snapshot.phase === "settled" &&
        snapshot.holder?.address.toLowerCase() === player.toLowerCase() &&
        !holderClaimed
          ? snapshot.pools?.holderUsd || 0
          : 0,
      closingPrintUsd:
        snapshot.phase === "settled" &&
        playerScore > 0n &&
        winningTotal > 0 &&
        !printClaimed
          ? ((snapshot.pools?.closingPrintUsd || 0) *
              (Number(playerScore) / 10_000)) /
            winningTotal
          : 0,
      refundUsd:
        snapshot.phase === "cancelled" && !refundClaimed ? spentUsd : 0,
    },
  };
}

async function sendRound(
  account: Address,
  action:
    | "claimBell"
    | "finalize"
    | "claimHolderReward"
    | "claimClosingPrintReward"
    | "claimCancellationRefund",
  ticker?: TickerId,
): Promise<Hash> {
  const walletClient = createWalletClient({
    account,
    chain: localDevnet,
    transport: http(serverRpc),
  });
  let hash: Hash;
  if (action === "claimBell") {
    const market = await createMockMarketReport(ticker ?? "NVDA");
    hash = await walletClient.writeContract({
      account,
      chain: localDevnet,
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "claimBell",
      args: [market.tickerIndex, market.report, market.tickerIndex],
      gas: 650_000n,
    });
  } else {
    hash = await walletClient.writeContract({
      account,
      chain: localDevnet,
      address: roundAddress,
      abi: lastBellAbi,
      functionName: action,
      gas: 650_000n,
    });
  }
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
  const hash = await walletClient.writeContract({
    account,
    chain: localDevnet,
    address: devDollarAddress,
    abi: devDollarAbi,
    functionName: "approve",
    args: [roundAddress, amount],
    gas: 150_000n,
  });
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
  | "claim-print"
  | "claim-refund";

export async function fundDevnetWallet(player: Address, amountUsd = 25) {
  const account = deployment.deployer;
  const walletClient = createWalletClient({
    account,
    chain: localDevnet,
    transport: http(serverRpc),
  });
  const hash = await walletClient.writeContract({
    account,
    chain: localDevnet,
    address: devDollarAddress,
    abi: devDollarAbi,
    functionName: "mint",
    args: [player, BigInt(amountUsd * 1e6)],
    gas: 150_000n,
  });
  const receipt = await devnetPublicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Devnet faucet transaction ${hash} reverted`);
  }
  return hash;
}

export async function sendDevnetAction(
  action: DevnetAction,
  ticker?: TickerId,
) {
  let hash: Hash;
  if (action === "enter" || action === "claim") {
    if (!tickerSlots.some((item) => item.id === ticker)) {
      throw new Error("Select one of the four tickers.");
    }
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
    hash = await sendRound(devnetSessionPlayer, "claimBell", ticker);
  } else if (action === "revoke") {
    hash = await approveSession(devnetSessionPlayer, 0n);
  } else if (action === "demo-claim") {
    const snapshot = await getDevnetSnapshot();
    const index = Math.max(
      0,
      tickerSlots.findIndex((item) => item.id === ticker),
    );
    const candidates = [playerAddresses[index], playerAddresses[index + 4]];
    const account =
      candidates.find(
        (candidate) =>
          candidate.toLowerCase() !== snapshot.holder?.address.toLowerCase(),
      ) ?? candidates[0];
    hash = await sendRound(account, "claimBell", ticker);
  } else {
    const functionName = {
      finalize: "finalize",
      "claim-holder": "claimHolderReward",
      "claim-print": "claimClosingPrintReward",
      "claim-refund": "claimCancellationRefund",
    }[action] as
      | "finalize"
      | "claimHolderReward"
      | "claimClosingPrintReward"
      | "claimCancellationRefund";
    hash = await sendRound(
      action === "finalize" ? playerAddresses[0] : devnetSessionPlayer,
      functionName,
    );
  }
  return {
    hash,
    state: await getDevnetSnapshot(),
    ...(await getDevnetSession()),
  };
}
