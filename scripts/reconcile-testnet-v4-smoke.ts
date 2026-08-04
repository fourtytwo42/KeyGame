import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSmokeReconciliationScope } from "../src/lib/release/testnet-v4";
import { lastBellV4Abi } from "../src/lib/web3/last-bell-abi";
import {
  deploymentKeyFor,
  loadManifest,
  pool,
  publicClientFor,
} from "../services/common";

const manifest = await loadManifest();
if (
  manifest.chainId !== 46630 ||
  !manifest.mockOnly ||
  manifest.contractVersion !== "saved-bell-v5-market-pot"
) {
  throw new Error(
    "The v4 smoke reconciler requires a mock-only chain-46630 manifest.",
  );
}
const client = publicClientFor(manifest);
if ((await client.getChainId()) !== 46630) {
  throw new Error("Connected RPC is not Robinhood testnet.");
}
const deploymentKey = deploymentKeyFor(manifest);
const manifestPath = process.env.KEYGAME_DEPLOYMENT_MANIFEST;
if (!manifestPath) {
  throw new Error("KEYGAME_DEPLOYMENT_MANIFEST is required.");
}
const manifestHash = createHash("sha256")
  .update(await readFile(manifestPath))
  .digest("hex");
const rounds = await pool.query<{
  round_id: string;
  contract_address: string;
  state: string;
}>(
  `SELECT round_id::text,contract_address,state FROM rounds
   WHERE deployment_key=$1 ORDER BY round_id`,
  [deploymentKey],
);
const settled = rounds.rows.filter((round) => round.state === "settled");
const successorRounds = rounds.rows.filter(
  (round) => round.state !== "settled" && round.state !== "cancelled",
);
let unstartedSuccessorRounds = 0;
for (const round of successorRounds) {
  const [startedAt, acceptedClaims] = await Promise.all([
    client.readContract({
      address: round.contract_address as `0x${string}`,
      abi: lastBellV4Abi,
      functionName: "startedAt",
    }),
    client.readContract({
      address: round.contract_address as `0x${string}`,
      abi: lastBellV4Abi,
      functionName: "acceptedClaims",
    }),
  ]);
  if (startedAt === 0n && acceptedClaims === 0n) unstartedSuccessorRounds += 1;
}
assertSmokeReconciliationScope({
  totalRounds: rounds.rows.length,
  settledRounds: settled.length,
  cancelledRounds: rounds.rows.filter((round) => round.state === "cancelled")
    .length,
  unstartedSuccessorRounds,
});

const roundIds = settled.map((round) => round.round_id);
const [contributions, allocations, claims, epochs, failures, events] =
  await Promise.all([
    pool.query<{
      round_id: string;
      calls: string;
      players: string;
      deposited: string;
      consumed: string;
      residual: string;
    }>(
      `SELECT round_id::text,count(*)::text AS calls,
              count(DISTINCT lower(player_address))::text AS players,
              sum(usdg_amount)::text AS deposited,
              sum(usdg_consumed)::text AS consumed,
              sum(residual_usdg)::text AS residual
       FROM stock_pot_contributions
       WHERE deployment_key=$1 AND round_id=ANY($2::numeric[]) AND canonical
       GROUP BY round_id ORDER BY round_id`,
      [deploymentKey, roundIds],
    ),
    pool.query<{
      round_id: string;
      stock_token: string;
      accounted_amount: string;
      holder_amount: string;
      winning_stock_amount: string;
      lifetime_amount: string;
      seed_amount: string;
      protocol_amount: string;
    }>(
      `SELECT round_id::text,stock_token,accounted_amount::text,
              holder_amount::text,winning_stock_amount::text,
              lifetime_amount::text,seed_amount::text,protocol_amount::text
       FROM stock_pot_allocations
       WHERE deployment_key=$1 AND round_id=ANY($2::numeric[])
       ORDER BY round_id,stock_token`,
      [deploymentKey, roundIds],
    ),
    pool.query<{ category: string; count: string; amount: string }>(
      `SELECT category,count(*)::text,sum(amount)::text AS amount
       FROM stock_reward_claims
       WHERE deployment_key=$1
         AND (round_id=ANY($2::numeric[]) OR category='LIFETIME')
         AND canonical
       GROUP BY category ORDER BY category`,
      [deploymentKey, roundIds],
    ),
    pool.query<{ round_id: string; activated: string; pending: string }>(
      `SELECT round_id::text,sum(activated_points)::text AS activated,
              sum(pending_points)::text AS pending
       FROM lifetime_point_epochs
       WHERE deployment_key=$1 AND round_id=ANY($2::numeric[])
       GROUP BY round_id ORDER BY round_id`,
      [deploymentKey, roundIds],
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text FROM keeper_jobs
       WHERE deployment_key=$1 AND state='failed'`,
      [deploymentKey],
    ),
    pool.query<{ event_name: string; count: string }>(
      `SELECT event_name,count(*)::text FROM chain_events
       WHERE deployment_key=$1
         AND event_name IN ('BellClaimed','RoundSettled','BasketRewardClaimed','LifetimeRewardClaimed')
       GROUP BY event_name ORDER BY event_name`,
      [deploymentKey],
    ),
  ]);

if (
  contributions.rows.length !== 2 ||
  contributions.rows.some((round) => Number(round.players) < 2)
) {
  throw new Error(
    "Each smoke round requires two distinct contributing wallets.",
  );
}
if (allocations.rows.length !== 10) {
  throw new Error(
    `Expected five asset allocations per round; found ${allocations.rows.length}.`,
  );
}
for (const summary of contributions.rows) {
  if (
    BigInt(summary.deposited) !==
    BigInt(summary.consumed) + BigInt(summary.residual)
  ) {
    throw new Error(`USDG conservation failed for round ${summary.round_id}.`);
  }
}
for (const allocation of allocations.rows) {
  const accounted = BigInt(allocation.accounted_amount);
  const parts =
    BigInt(allocation.holder_amount) +
    BigInt(allocation.winning_stock_amount) +
    BigInt(allocation.lifetime_amount) +
    BigInt(allocation.seed_amount) +
    BigInt(allocation.protocol_amount);
  if (accounted !== parts) {
    throw new Error(
      `Basket mismatch for round ${allocation.round_id}, token ${allocation.stock_token}.`,
    );
  }
}
const categories = new Set(claims.rows.map((claim) => claim.category));
for (const required of ["LAST_BELL", "WINNING_STOCK", "LIFETIME"]) {
  if (!categories.has(required)) {
    throw new Error(`Missing required ${required} withdrawal evidence.`);
  }
}
if (
  !epochs.rows.some(
    (epoch) => epoch.round_id === roundIds[0] && BigInt(epoch.activated) > 0n,
  )
) {
  throw new Error(
    "Round-one lifetime points were not activated for the following round.",
  );
}
if (Number(failures.rows[0]?.count ?? 0) !== 0) {
  throw new Error("The smoke run contains failed keeper jobs.");
}

const head = await client.getBlock();
const report = {
  ok: true,
  checkedAt: new Date().toISOString(),
  deploymentKey,
  sourceCommit: manifest.sourceCommit,
  authorizationScope: { maxDeployments: 1, maxSettledRounds: 2 },
  manifestHash,
  chainId: manifest.chainId,
  head: head.number.toString(),
  headHash: head.hash,
  scope: {
    totalRounds: rounds.rows.length,
    settledRounds: settled.length,
    cancelledRounds: rounds.rows.filter((round) => round.state === "cancelled")
      .length,
    unstartedSuccessorRounds,
  },
  rounds: settled,
  contributionSummaries: contributions.rows,
  allocations: allocations.rows,
  rewardClaims: claims.rows,
  lifetimeEpochs: epochs.rows,
  indexedEventCounts: events.rows,
  failedKeeperJobs: failures.rows[0]?.count ?? "0",
};
const output =
  process.env.KEYGAME_TESTNET_SMOKE_REPORT ??
  path.join("artifacts", "testnet-v4-smoke", "reconciliation.json");
await mkdir(path.dirname(output), { recursive: true });
const reportJson = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(output, reportJson, "utf8");
await writeFile(
  `${output}.sha256`,
  `${createHash("sha256").update(reportJson).digest("hex")}  ${path.basename(output)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
await pool.end();
