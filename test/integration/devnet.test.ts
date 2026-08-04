import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  maxUint256,
  publicActions,
  type Address,
} from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { localDevnet } from "@/lib/web3/chains";
import { devDollarAbi, lastBellV4Abi } from "@/lib/web3/last-bell-abi";
import {
  ensureV4DevnetRoundProgression,
  getV4DevnetSession,
  getV4DevnetSnapshot,
  quoteV4Devnet,
  sendV4DevnetAction,
} from "@/lib/web3/v4-devnet";

const rpc = process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
const deploymentPath =
  process.env.V4_DEVNET_DEPLOYMENT_MANIFEST ||
  path.join(process.cwd(), "deployments", "31337.json");
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as Record<
  string,
  unknown
>;
const d = deployment as {
  lastBellRound: Address;
  devDollar: Address;
  paymentRouter: Address;
  sessionPlayer: Address;
};
const publicClient = createPublicClient({
  chain: localDevnet,
  cacheTime: 0,
  transport: http(rpc),
});
const testClient = createTestClient({
  chain: localDevnet,
  mode: "anvil",
  transport: http(rpc),
}).extend(publicActions);

describe("deployed v4 local devnet", () => {
  beforeAll(async () => {
    expect(await publicClient.getChainId()).toBe(31337);
    expect((await getV4DevnetSnapshot()).contractVersion).toBe(
      "saved-bell-v5-market-pot",
    );
  });

  it("quotes and accepts an uncapped custom Stock Token contribution", async () => {
    const before = await getV4DevnetSnapshot();
    expect(before.phase).toBe("entry");
    const quote = await quoteV4Devnet("AAPL", 5_000);
    expect(quote.usdgAmount).toBe(5_000);
    expect(quote.projectedPoints).toBe(5_000);
    expect(quote.minimumStockOut).toBe("1");

    const result = await sendV4DevnetAction("enter", "AAPL", 5_000);
    expect(result.state.phase).toBe("live");
    expect(result.state.holder?.ticker).toBe("AAPL");
    expect(result.state.potUsd).toBeCloseTo(before.potUsd + 5_000, 6);
    expect(result.state.tickerScores[1].weightedScore).toBe(5_000);
    expect(result.state.tickerScores[1].potTokenQuantity).toBeGreaterThan(0);
    const startedAt = await publicClient.readContract({
      address: d.lastBellRound,
      abi: lastBellV4Abi,
      functionName: "startedAt",
    });
    expect(startedAt).toBeGreaterThan(0n);
  });

  it("refreshes any insufficient allowance to one reusable max approval", async () => {
    const wallet = createWalletClient({
      account: d.sessionPlayer,
      chain: localDevnet,
      transport: http(rpc),
    });
    await wallet.writeContract({
      account: d.sessionPlayer,
      address: d.devDollar,
      abi: devDollarAbi,
      functionName: "approve",
      args: [d.paymentRouter, 5_000_000n],
    });
    await sendV4DevnetAction("demo-claim", "TSLA", 10);
    await sendV4DevnetAction("claim", "NVDA", 100);
    const allowance = await publicClient.readContract({
      address: d.devDollar,
      abi: devDollarAbi,
      functionName: "allowance",
      args: [d.sessionPlayer, d.paymentRouter],
    });
    expect(allowance).toBe(maxUint256);
  });

  it("locks the follower multiplier before the incoming call and keeps Rug Zone FCFS", async () => {
    await sendV4DevnetAction("demo-claim", "SPY", 1_000);
    const heated = await quoteV4Devnet("SPY", 250);
    expect(heated.multiplierBps).toBe(15_000);
    const beforeWarp = await getV4DevnetSnapshot();
    await testClient.increaseTime({
      seconds: Math.max(1, beforeWarp.timeLeftSeconds - 8),
    });
    await testClient.mine({ blocks: 1 });
    const inRug = await getV4DevnetSnapshot();
    expect(inRug.phase).toBe("rug");
    const deadline = inRug.deadline;
    const result = await sendV4DevnetAction("demo-claim", "NVDA", 250);
    expect(result.state.deadline).toBe(deadline);
  });

  it("settles the basket and promotes points for the following round", async () => {
    const beforeWarp = await getV4DevnetSnapshot();
    await testClient.increaseTime({
      seconds: beforeWarp.timeLeftSeconds + 1,
    });
    await testClient.mine({ blocks: 1 });
    expect((await getV4DevnetSnapshot()).phase).toBe("finalizing");
    const result = await sendV4DevnetAction("finalize");
    expect(result.state.phase).toBe("settled");
    expect(result.state.holder).not.toBeNull();
    const activeBefore = await publicClient.readContract({
      address: deployment.roundManager as Address,
      abi: [
        {
          type: "function",
          name: "activeRound",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "address" }],
        },
      ],
      functionName: "activeRound",
    });
    await ensureV4DevnetRoundProgression(result.state);
    const activeAfter = await publicClient.readContract({
      address: deployment.roundManager as Address,
      abi: [
        {
          type: "function",
          name: "activeRound",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "address" }],
        },
      ],
      functionName: "activeRound",
    });
    expect(activeAfter).toBe(activeBefore);
    const { session } = await getV4DevnetSession();
    expect(session.spentUsd).toBeGreaterThan(0);
  });
});
