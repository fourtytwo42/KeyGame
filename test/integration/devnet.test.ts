import { createTestClient, http, publicActions } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { factions } from "@/lib/game/constants";
import deployment from "../../deployments/31337.json";
import { lastBellAbi } from "@/lib/web3/last-bell-abi";
import {
  devnetPublicClient,
  getDevnetSnapshot,
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
    const before = await getDevnetSnapshot();
    const deadlineBefore = await devnetPublicClient.readContract({
      address: deployment.lastBellRound as `0x${string}`,
      abi: lastBellAbi,
      functionName: "deadline",
    });
    const target = factions.find(
      (faction) => faction.id !== before.holder?.faction,
    )!;
    const result = await sendDevnetAction("claim", target.id);
    const deadlineAfter = await devnetPublicClient.readContract({
      address: deployment.lastBellRound as `0x${string}`,
      abi: lastBellAbi,
      functionName: "deadline",
    });

    expect(result.state.holder?.faction).toBe(target.id);
    expect(result.state.potUsd).toBe(before.potUsd + 1);
    expect(result.state.claims.length).toBe(before.claims.length + 1);
    expect(deadlineAfter).toBe(deadlineBefore + 2n);
  });

  it("keeps the deadline fixed for a real Rug Zone claim", async () => {
    const beforeWarp = await getDevnetSnapshot();
    await testClient.increaseTime({
      seconds: Math.max(1, beforeWarp.timeLeftSeconds - 8),
    });
    await testClient.mine({ blocks: 1 });
    const inRug = await getDevnetSnapshot();
    expect(inRug.phase).toBe("rug");

    const target = factions.find(
      (faction) => faction.id !== inRug.holder?.faction,
    )!;
    const result = await sendDevnetAction("claim", target.id);
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
