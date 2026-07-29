import {
  createTestClient,
  createWalletClient,
  http,
  publicActions,
} from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { tickerSlots } from "@/lib/game/constants";
import deployment from "../../deployments/31337.json";
import { devDollarAbi, lastBellAbi } from "@/lib/web3/last-bell-abi";
import {
  devDollarAddress,
  devnetPublicClient,
  devnetSessionPlayer,
  getDevnetSnapshot,
  getDevnetSession,
  paymentRouterAddress,
  sendDevnetAction,
} from "@/lib/web3/devnet";
import { localDevnet } from "@/lib/web3/chains";

const testClient = createTestClient({
  chain: localDevnet,
  mode: "anvil",
  transport: http(process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545"),
}).extend(publicActions);

describe("deployed local devnet", () => {
  beforeAll(async () => {
    expect(await devnetPublicClient.getChainId()).toBe(31337);
  });

  it("reads the deployed round and accepts a real contract claim", async () => {
    const beforeEntry = await getDevnetSnapshot();
    expect(beforeEntry.phase).toBe("entry");
    expect(beforeEntry.timeLeftSeconds).toBe(0);
    const startedBefore = await devnetPublicClient.readContract({
      address: deployment.lastBellRound as `0x${string}`,
      abi: lastBellAbi,
      functionName: "startedAt",
    });
    expect(startedBefore).toBe(0n);

    const entered = await sendDevnetAction("enter", "AAPL");
    expect(entered.session?.starterTicker).toBe("AAPL");
    expect(entered.session?.allowanceUsd).toBe(99);
    expect(entered.state.phase).toBe("live");
    expect(entered.state.timeLeftSeconds).toBeGreaterThanOrEqual(44);
    expect(entered.state.timeLeftSeconds).toBeLessThanOrEqual(45);
    const startedAfter = await devnetPublicClient.readContract({
      address: deployment.lastBellRound as `0x${string}`,
      abi: lastBellAbi,
      functionName: "startedAt",
    });
    expect(startedAfter).toBeGreaterThan(0n);
    await sendDevnetAction("demo-claim", "NVDA");
    const before = await getDevnetSnapshot();
    const deadlineBefore = await devnetPublicClient.readContract({
      address: deployment.lastBellRound as `0x${string}`,
      abi: lastBellAbi,
      functionName: "deadline",
    });
    const target = tickerSlots.find(
      (ticker) => ticker.id !== before.holder?.ticker && ticker.id !== "AAPL",
    )!;
    const result = await sendDevnetAction("claim", target.id);
    const deadlineAfter = await devnetPublicClient.readContract({
      address: deployment.lastBellRound as `0x${string}`,
      abi: lastBellAbi,
      functionName: "deadline",
    });

    expect(result.state.holder?.ticker).toBe(target.id);
    expect(result.state.potUsd).toBe(before.potUsd + 1);
    expect(result.state.claims.length).toBe(before.claims.length + 1);
    expect(deadlineAfter).toBe(deadlineBefore + 2n);
    const { session } = await getDevnetSession();
    expect(session.spentUsd).toBe(2);
    expect(session.remainingUsd).toBe(98);
    expect(session.availableActions).toBe(98);
  });

  it("refreshes a low allowance before the next claim", async () => {
    const wallet = createWalletClient({
      account: devnetSessionPlayer,
      chain: localDevnet,
      transport: http(process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545"),
    });
    await wallet.writeContract({
      address: devDollarAddress,
      abi: devDollarAbi,
      functionName: "approve",
      args: [paymentRouterAddress, 5_000_000n],
    });
    await sendDevnetAction("demo-claim", "TSLA");
    await sendDevnetAction("claim", "AAPL");

    const allowance = await devnetPublicClient.readContract({
      address: devDollarAddress,
      abi: devDollarAbi,
      functionName: "allowance",
      args: [devnetSessionPlayer, paymentRouterAddress],
    });
    expect(allowance).toBe(99_000_000n);
  });

  it("keeps the deadline fixed for a real Rug Zone claim", async () => {
    const beforeWarp = await getDevnetSnapshot();
    await testClient.increaseTime({
      seconds: Math.max(1, beforeWarp.timeLeftSeconds - 8),
    });
    await testClient.mine({ blocks: 1 });
    const inRug = await getDevnetSnapshot();
    expect(inRug.phase).toBe("rug");

    const target = tickerSlots.find(
      (ticker) => ticker.id !== inRug.holder?.ticker,
    )!;
    const result = await sendDevnetAction("demo-claim", target.id);
    expect(result.state.timeLeftSeconds).toBeLessThanOrEqual(
      inRug.timeLeftSeconds,
    );
  });

  it("finalizes onchain after zero without declaring early", async () => {
    const beforeWarp = await getDevnetSnapshot();
    await testClient.increaseTime({
      seconds: beforeWarp.timeLeftSeconds + 1,
    });
    await testClient.mine({ blocks: 1 });
    expect((await getDevnetSnapshot()).phase).toBe("finalizing");

    const result = await sendDevnetAction("finalize");
    expect(result.state.phase).toBe("settled");
    expect(result.state.holder).not.toBeNull();
  });
});
