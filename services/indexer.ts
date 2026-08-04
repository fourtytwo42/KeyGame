import {
  decodeEventLog,
  hexToString,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import type { PoolClient } from "pg";
import {
  lastBellAbi,
  lastBellV4Abi,
  lifetimePointsVaultAbi,
  legacyStockPotV4EventAbi,
  legacyClosingPrintEventAbi,
  legacyDexPayoutEventAbi,
  roundManagerAbi,
  roundManagerV4Abi,
} from "../src/lib/web3/last-bell-abi";
import {
  deploymentKeyFor,
  heartbeat,
  loadManifest,
  pool,
  publicClientFor,
} from "./common";

const manifest = await loadManifest();
const deploymentKey = deploymentKeyFor(manifest);
const client = publicClientFor(manifest);
const confirmations = BigInt(process.env.INDEXER_CONFIRMATIONS || 3);
const batchSize = BigInt(process.env.INDEXER_BATCH_SIZE || 100);
const roundTokenCache = new Map<string, Address[]>();
const stockPotVersion =
  manifest.contractVersion === "saved-bell-v5-market-pot" ||
  manifest.contractVersion === "last-bell-v4-stock-pot";

async function materializeRoundPresentation(
  connection: PoolClient,
  round: Address,
  roundId: string,
  settlement?: { finalHolder?: Address; winningTicker?: string },
) {
  const configs = await Promise.all(
    [0n, 1n, 2n, 3n].map((ticker) =>
      client.readContract({
        address: round,
        abi: lastBellV4Abi,
        functionName: "tickerConfigs",
        args: [ticker],
      }),
    ),
  );
  const symbols = configs.map((config) =>
    hexToString(config[0], { size: 32 }).replace(/\0+$/g, ""),
  );
  const contributions = await connection.query<{
    player_address: Address;
    ticker_index: number;
    usdg_amount: string;
    points: string;
    multiplier_bps: number;
    transaction_hash: Hex;
    log_index: number;
    block_number: string;
    accepted_at: string;
    deadline: string;
    rug_zone: boolean;
  }>(
    `SELECT c.player_address,c.ticker_index,c.usdg_amount,c.points,c.multiplier_bps,
            c.transaction_hash,c.log_index,e.block_number::text,
            coalesce(e.args->>'acceptedAt','0') AS accepted_at,
            coalesce(e.args->>'deadline','0') AS deadline,
            coalesce((e.args->>'rugZone')::boolean,false) AS rug_zone
     FROM stock_pot_contributions c
     JOIN chain_events e ON e.deployment_key=c.deployment_key
       AND e.transaction_hash=c.transaction_hash AND e.log_index=c.log_index
     WHERE c.deployment_key=$1 AND c.round_id=$2 AND c.canonical=true
     ORDER BY e.block_number,e.log_index`,
    [deploymentKey, roundId],
  );
  await connection.query(
    "DELETE FROM round_highlights WHERE deployment_key=$1 AND round_id=$2",
    [deploymentKey, roundId],
  );
  await connection.query(
    "DELETE FROM player_achievements WHERE deployment_key=$1 AND round_id=$2",
    [deploymentKey, roundId],
  );
  const tickerPoints = [0n, 0n, 0n, 0n];
  const playerTickerPoints = new Map<string, bigint>();
  const latestCall = new Map<
    string,
    { row: (typeof contributions.rows)[number]; at: bigint }
  >();
  const flipCounts = new Map<string, number>();
  let pot = 0n;
  let leader = 0;
  let largest: (typeof contributions.rows)[number] | undefined;
  const reached = new Set<bigint>();
  const lockedHeatLevels = ["COLD", "COLD", "COLD", "COLD"];
  const heatName = (multiplierBps: number) =>
    multiplierBps >= 20_000
      ? "NUCLEAR"
      : multiplierBps >= 15_000
        ? "COOKING"
        : multiplierBps >= 12_500
          ? "WARMING"
          : "COLD";
  const milestoneRaw = [1_000n, 10_000n, 25_000n, 50_000n, 100_000n].map(
    (value) => value * 1_000_000n,
  );
  for (const row of contributions.rows) {
    const amount = BigInt(row.usdg_amount);
    const points = BigInt(row.points);
    const priorLeader = leader;
    pot += amount;
    tickerPoints[row.ticker_index] += points;
    leader = tickerPoints.reduce(
      (best, value, index) => (value > tickerPoints[best] ? index : best),
      0,
    );
    const playerKey = `${row.ticker_index}:${row.player_address.toLowerCase()}`;
    playerTickerPoints.set(
      playerKey,
      (playerTickerPoints.get(playerKey) ?? 0n) + points,
    );
    latestCall.set(playerKey, { row, at: BigInt(row.accepted_at) });
    if (!largest || amount > BigInt(largest.usdg_amount)) largest = row;
    const kind =
      amount >= 1_000_000_000n || amount * 10n >= pot ? "WHALE" : "CALL";
    await connection.query(
      `INSERT INTO round_highlights(deployment_key,round_id,highlight_id,kind,headline,player_address,ticker,amount_usdg,at_seconds,block_number,log_index,transaction_hash,contract_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        deploymentKey,
        roundId,
        `call:${row.transaction_hash}:${row.log_index}`,
        kind,
        `${row.player_address.slice(0, 6)} APED $${(Number(amount) / 1e6).toLocaleString()} ON ${symbols[row.ticker_index]}`,
        row.player_address,
        symbols[row.ticker_index],
        amount.toString(),
        row.accepted_at,
        row.block_number,
        row.log_index,
        row.transaction_hash,
        manifest.contractVersion,
      ],
    );
    const nextHeat = heatName(row.multiplier_bps);
    if (nextHeat !== lockedHeatLevels[row.ticker_index]) {
      lockedHeatLevels[row.ticker_index] = nextHeat;
      await connection.query(
        `INSERT INTO round_highlights(deployment_key,round_id,highlight_id,kind,headline,player_address,ticker,at_seconds,block_number,log_index,transaction_hash,contract_version)
         VALUES($1,$2,$3,'HEAT_CHANGE',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          deploymentKey,
          roundId,
          `heat:${row.transaction_hash}:${row.log_index}`,
          `${symbols[row.ticker_index]} IS ${nextHeat}`,
          row.player_address,
          symbols[row.ticker_index],
          row.accepted_at,
          row.block_number,
          row.log_index,
          row.transaction_hash,
          manifest.contractVersion,
        ],
      );
    }
    if (row.rug_zone) {
      await connection.query(
        `INSERT INTO round_highlights(deployment_key,round_id,highlight_id,kind,headline,player_address,ticker,at_seconds,block_number,log_index,transaction_hash,contract_version)
         VALUES($1,$2,$3,'RUG_STEAL',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          deploymentKey,
          roundId,
          `rug:${row.transaction_hash}:${row.log_index}`,
          `${row.player_address.slice(0, 6)} STOLE THE BELL IN RUG ZONE`,
          row.player_address,
          symbols[row.ticker_index],
          row.accepted_at,
          row.block_number,
          row.log_index,
          row.transaction_hash,
          manifest.contractVersion,
        ],
      );
    }
    if (priorLeader !== leader && tickerPoints[priorLeader] > 0n) {
      flipCounts.set(
        row.player_address.toLowerCase(),
        (flipCounts.get(row.player_address.toLowerCase()) ?? 0) + 1,
      );
      await connection.query(
        `INSERT INTO round_highlights(deployment_key,round_id,highlight_id,kind,headline,player_address,ticker,at_seconds,block_number,log_index,transaction_hash,contract_version)
         VALUES($1,$2,$3,'TICKER_FLIP',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          deploymentKey,
          roundId,
          `flip:${row.transaction_hash}:${row.log_index}`,
          `${symbols[leader]} FLIPPED ${symbols[priorLeader]} FOR THE LEAD`,
          row.player_address,
          symbols[leader],
          row.accepted_at,
          row.block_number,
          row.log_index,
          row.transaction_hash,
          manifest.contractVersion,
        ],
      );
    }
    for (const milestone of milestoneRaw)
      if (pot >= milestone && !reached.has(milestone)) {
        reached.add(milestone);
        await connection.query(
          `INSERT INTO round_highlights(deployment_key,round_id,highlight_id,kind,headline,amount_usdg,at_seconds,block_number,log_index,transaction_hash,contract_version)
         VALUES($1,$2,$3,'POT_MILESTONE',$4,$5,$6,$7,$8,$9,$10)`,
          [
            deploymentKey,
            roundId,
            `milestone:${milestone}`,
            `$${(Number(milestone) / 1e6).toLocaleString()} POT UNLOCKED`,
            milestone.toString(),
            row.accepted_at,
            row.block_number,
            row.log_index,
            row.transaction_hash,
            manifest.contractVersion,
          ],
        );
      }
  }
  if (!settlement || !contributions.rows.length) return;
  const final = contributions.rows.at(-1)!;
  await connection.query(
    `INSERT INTO round_highlights(deployment_key,round_id,highlight_id,kind,headline,player_address,ticker,at_seconds,block_number,log_index,transaction_hash,contract_version)
     VALUES($1,$2,$3,'SETTLEMENT',$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      deploymentKey,
      roundId,
      `settled:${roundId}`,
      `${symbols[Number(settlement.winningTicker ?? leader)]} WON · ${final.player_address.slice(0, 6)} SAVED BY THE BELL`,
      final.player_address,
      symbols[final.ticker_index],
      final.accepted_at,
      final.block_number,
      final.log_index,
      final.transaction_hash,
      manifest.contractVersion,
    ],
  );
  const insertAchievement = async (
    kind: string,
    row: (typeof contributions.rows)[number],
    ticker: string,
    detail: string,
  ) =>
    connection.query(
      `INSERT INTO player_achievements(deployment_key,round_id,achievement_id,kind,player_address,ticker,title,detail,block_number,log_index,transaction_hash,contract_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [
        deploymentKey,
        roundId,
        `${kind}:${row.player_address.toLowerCase()}:${ticker}`,
        kind,
        row.player_address,
        ticker,
        kind.replaceAll("_", " "),
        detail,
        row.block_number,
        row.log_index,
        row.transaction_hash,
        manifest.contractVersion,
      ],
    );
  await insertAchievement(
    "FINAL_CALLER",
    final,
    symbols[final.ticker_index],
    "Held the bell when the clock hit zero.",
  );
  if (
    final.rug_zone &&
    BigInt(final.deadline) - BigInt(final.accepted_at) <= 3n
  )
    await insertAchievement(
      "BELL_SNIPER",
      final,
      symbols[final.ticker_index],
      `Stole it with ${BigInt(final.deadline) - BigInt(final.accepted_at)}s left.`,
    );
  if (final.rug_zone)
    await insertAchievement(
      "RUG_SURVIVOR",
      final,
      symbols[final.ticker_index],
      "Won the FCFS Rug Zone.",
    );
  if (largest)
    await insertAchievement(
      "BIGGEST_APE",
      largest,
      symbols[largest.ticker_index],
      `Largest call: $${(Number(largest.usdg_amount) / 1e6).toLocaleString()}.`,
    );
  const firstBoostedIndex = contributions.rows.findIndex(
    (row) => row.multiplier_bps > 10_000,
  );
  const firstBoosted = contributions.rows[firstBoostedIndex];
  const heatStarter = firstBoosted
    ? (contributions.rows
        .slice(0, firstBoostedIndex)
        .reverse()
        .find((row) => row.ticker_index === firstBoosted.ticker_index) ??
      firstBoosted)
    : undefined;
  if (heatStarter)
    await insertAchievement(
      "HEAT_STARTER",
      heatStarter,
      symbols[heatStarter.ticker_index],
      `Pushed ${symbols[heatStarter.ticker_index]} above 1.00x.`,
    );
  for (let tickerIndex = 0; tickerIndex < 4; tickerIndex += 1) {
    const captain = [...playerTickerPoints.entries()]
      .filter(([key]) => key.startsWith(`${tickerIndex}:`))
      .sort((a, b) => {
        if (a[1] !== b[1]) return b[1] > a[1] ? 1 : -1;
        const aLatest = latestCall.get(a[0])!.at;
        const bLatest = latestCall.get(b[0])!.at;
        if (aLatest !== bLatest) return bLatest > aLatest ? 1 : -1;
        return a[0].localeCompare(b[0]);
      })[0];
    if (captain)
      await insertAchievement(
        "STOCK_CAPTAIN",
        latestCall.get(captain[0])!.row,
        symbols[tickerIndex],
        `${captain[1].toString()} points on ${symbols[tickerIndex]}.`,
      );
  }
  const flipWinner = [...flipCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  if (flipWinner) {
    const row = contributions.rows.find(
      (candidate) => candidate.player_address.toLowerCase() === flipWinner[0],
    )!;
    await insertAchievement(
      "FLIP_ARTIST",
      row,
      symbols[row.ticker_index],
      `${flipWinner[1]} lead flips.`,
    );
  }
}

async function roundTokens(round: Address) {
  const key = round.toLowerCase();
  const cached = roundTokenCache.get(key);
  if (cached) return cached;
  const configs = await Promise.all(
    [0n, 1n, 2n, 3n].map((ticker) =>
      client.readContract({
        address: round,
        abi: lastBellV4Abi,
        functionName: "tickerConfigs",
        args: [ticker],
      }),
    ),
  );
  const tokens = configs.map((config) => config[2] as Address);
  roundTokenCache.set(key, tokens);
  return tokens;
}

function rewardCategory(rewardType: Hex) {
  const decoded = hexToString(rewardType, { size: 32 }).replace(/\0/g, "");
  const categories: Record<string, string> = {
    FINAL_HOLDER: "LAST_BELL",
    WINNING_STOCK: "WINNING_STOCK",
    CANCEL_REFUND: "REFUND",
    PROTOCOL: "PROTOCOL",
  };
  return categories[decoded] ?? null;
}

async function registerDeployment() {
  await pool.query(
    `INSERT INTO deployments(
       deployment_key,chain_id,environment,deployment_block,source_commit,manifest)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(deployment_key) DO UPDATE SET
       source_commit=excluded.source_commit,
       manifest=excluded.manifest,
       updated_at=now()`,
    [
      deploymentKey,
      manifest.chainId,
      manifest.environment,
      manifest.deploymentBlock,
      manifest.sourceCommit,
      JSON.stringify(manifest),
    ],
  );
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, jsonSafe(child)]),
    );
  }
  return value;
}

async function rollbackIfReorged() {
  const checkpoint = await pool.query<{
    block_number: string;
    block_hash: string;
  }>(
    "SELECT block_number,block_hash FROM indexer_checkpoints WHERE deployment_key=$1 AND service='chain-indexer'",
    [deploymentKey],
  );
  if (!checkpoint.rowCount) return;
  const number = BigInt(checkpoint.rows[0].block_number);
  const current = await client.getBlock({ blockNumber: number });
  if (
    current.hash?.toLowerCase() === checkpoint.rows[0].block_hash.toLowerCase()
  ) {
    return;
  }

  // Derived rows can depend on earlier point epochs and settlement allocations.
  // A deployment-scoped rebuild is slower than an ancestor-only rewind, but it
  // guarantees that rewards, leaderboards, and lifetime points cannot retain
  // orphaned state after a reorganization.
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    for (const table of [
      "player_achievements",
      "round_highlights",
      "stock_reward_claims",
      "stock_pot_allocations",
      "lifetime_point_epochs",
      "stock_pot_contributions",
      "leaderboard_materializations",
      "rounds",
      "chain_events",
    ]) {
      await connection.query(`DELETE FROM ${table} WHERE deployment_key=$1`, [
        deploymentKey,
      ]);
    }
    await connection.query(
      "DELETE FROM canonical_blocks WHERE chain_id=$1 AND number>=$2",
      [manifest.chainId, manifest.deploymentBlock],
    );
    const deploymentBlock = BigInt(manifest.deploymentBlock);
    const rewindNumber = deploymentBlock > 0n ? deploymentBlock - 1n : 0n;
    const rewind = await client.getBlock({ blockNumber: rewindNumber });
    await connection.query(
      `UPDATE indexer_checkpoints SET block_number=$2,block_hash=$3,updated_at=now()
       WHERE deployment_key=$1 AND service='chain-indexer'`,
      [deploymentKey, rewindNumber.toString(), rewind.hash],
    );
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

async function indexedAddresses() {
  const rounds = await pool.query<{ contract_address: Address }>(
    "SELECT contract_address FROM rounds WHERE deployment_key=$1",
    [deploymentKey],
  );
  return [
    manifest.contracts.manager,
    manifest.contracts.lifetimePointsVault,
    manifest.contracts.rewardRouter,
    ...rounds.rows.map((row) => row.contract_address),
  ].filter(
    (address): address is Address =>
      Boolean(address) && address !== zeroAddress,
  );
}

async function indexBatch(fromBlock: bigint, toBlock: bigint) {
  const addresses = await indexedAddresses();
  const discoveredRounds: Address[] = [];
  const managerLogs = await client.getLogs({
    address: manifest.contracts.manager,
    fromBlock,
    toBlock,
  });
  for (const log of managerLogs) {
    try {
      const decoded = decodeEventLog({
        abi: [...roundManagerAbi, ...roundManagerV4Abi],
        data: log.data,
        topics: log.topics,
        strict: false,
      });
      if (
        decoded.eventName === "RoundPrepared" &&
        decoded.args &&
        typeof decoded.args === "object" &&
        "round" in decoded.args
      ) {
        const round = decoded.args.round;
        if (
          typeof round === "string" &&
          round !== zeroAddress &&
          !addresses.some(
            (address) => address.toLowerCase() === round.toLowerCase(),
          )
        ) {
          addresses.push(round as Address);
          discoveredRounds.push(round as Address);
        }
      }
    } catch {
      // Manager events from archived versions are decoded in the main pass.
    }
  }
  const bulkLogs = addresses.length
    ? await client.getLogs({ address: addresses, fromBlock, toBlock })
    : [];
  const discoveredLogs = (
    await Promise.all(
      discoveredRounds.map((address) =>
        client.getLogs({ address, fromBlock, toBlock }),
      ),
    )
  ).flat();
  const uniqueLogs = new Map(
    [...bulkLogs, ...discoveredLogs].map((log) => [
      `${log.transactionHash}:${log.logIndex}`,
      log,
    ]),
  );
  const logs = [...uniqueLogs.values()].sort(
    (left, right) =>
      Number(left.blockNumber - right.blockNumber) ||
      Number(left.logIndex - right.logIndex),
  );
  const blocks = [];
  for (let number = fromBlock; number <= toBlock; number += 1n) {
    blocks.push(await client.getBlock({ blockNumber: number }));
  }
  const rewindBlock =
    discoveredRounds.length > 0
      ? await client.getBlock({ blockNumber: fromBlock - 1n })
      : null;

  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    for (const block of blocks) {
      await connection.query(
        `INSERT INTO canonical_blocks(chain_id,number,hash,parent_hash,block_time)
         VALUES($1,$2,$3,$4,to_timestamp($5))
         ON CONFLICT(chain_id,number) DO UPDATE SET
           hash=excluded.hash,parent_hash=excluded.parent_hash,
           block_time=excluded.block_time`,
        [
          manifest.chainId,
          block.number.toString(),
          block.hash,
          block.parentHash,
          block.timestamp.toString(),
        ],
      );
    }
    for (const log of logs) {
      let eventName: string | null = null;
      let args: unknown = null;
      try {
        const decoded = decodeEventLog({
          abi: [
            ...roundManagerAbi,
            ...roundManagerV4Abi,
            ...lastBellAbi,
            ...lastBellV4Abi,
            ...legacyStockPotV4EventAbi,
            ...lifetimePointsVaultAbi,
            ...legacyClosingPrintEventAbi,
            ...legacyDexPayoutEventAbi,
          ],
          data: log.data,
          topics: log.topics,
          strict: false,
        });
        eventName = decoded.eventName;
        args = jsonSafe(decoded.args);
      } catch {
        // Unknown events are retained raw and can be decoded after an ABI update.
      }
      await connection.query(
        `INSERT INTO chain_events(
           deployment_key,chain_id,transaction_hash,log_index,block_number,block_hash,
           contract_address,event_name,args,topics,data)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(deployment_key,transaction_hash,log_index) DO NOTHING`,
        [
          deploymentKey,
          manifest.chainId,
          log.transactionHash,
          log.logIndex,
          log.blockNumber.toString(),
          log.blockHash,
          log.address,
          eventName,
          args ? JSON.stringify(args) : null,
          JSON.stringify(log.topics),
          log.data,
        ],
      );
      if (eventName === "RoundPrepared" && args && typeof args === "object") {
        const prepared = args as { roundId?: string; round?: string };
        if (prepared.roundId && prepared.round) {
          await connection.query(
            `INSERT INTO rounds(deployment_key,chain_id,round_id,contract_address,state,deployment_block)
             VALUES($1,$2,$3,$4,'prepared',$5)
             ON CONFLICT(deployment_key,round_id) DO UPDATE SET
               contract_address=excluded.contract_address`,
            [
              deploymentKey,
              manifest.chainId,
              prepared.roundId,
              prepared.round,
              log.blockNumber.toString(),
            ],
          );
          await connection.query(
            `UPDATE round_roster_evidence SET round_address=$3
             WHERE deployment_key=$1 AND round_id=$2`,
            [deploymentKey, prepared.roundId, prepared.round],
          );
        }
      }
      if (
        eventName === "BellClaimed" &&
        stockPotVersion &&
        args &&
        typeof args === "object"
      ) {
        const claim = args as {
          roundId?: string;
          player?: Address;
          ticker?: string;
          usdgAmount?: string;
          usdgConsumed?: string;
          residualUsdg?: string;
          stockReceived?: string;
          multiplierBps?: string;
          points?: string;
          recentVolume?: string;
        };
        if (
          claim.roundId &&
          claim.player &&
          claim.ticker !== undefined &&
          claim.usdgAmount &&
          claim.stockReceived &&
          claim.multiplierBps !== undefined &&
          claim.points &&
          claim.recentVolume
        ) {
          const ticker = await client.readContract({
            address: log.address,
            abi: lastBellV4Abi,
            functionName: "tickerConfigs",
            args: [BigInt(claim.ticker)],
          });
          await connection.query(
            `INSERT INTO stock_pot_contributions(
               deployment_key,round_id,transaction_hash,log_index,player_address,
               ticker_index,stock_token,usdg_amount,usdg_consumed,residual_usdg,
               stock_received,multiplier_bps,points,recent_volume)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             ON CONFLICT(deployment_key,transaction_hash,log_index) DO NOTHING`,
            [
              deploymentKey,
              claim.roundId,
              log.transactionHash,
              log.logIndex,
              claim.player,
              Number(claim.ticker),
              ticker[2],
              claim.usdgAmount,
              claim.usdgConsumed ?? claim.usdgAmount,
              claim.residualUsdg ?? "0",
              claim.stockReceived,
              Number(claim.multiplierBps),
              claim.points,
              claim.recentVolume,
            ],
          );
          await materializeRoundPresentation(
            connection,
            log.address,
            claim.roundId,
          );
        }
      }
      if (
        eventName === "PendingPointsRecorded" &&
        args &&
        typeof args === "object"
      ) {
        const points = args as {
          roundId?: string;
          player?: Address;
          assetId?: string;
          points?: string;
        };
        if (
          points.roundId &&
          points.player &&
          points.assetId &&
          points.points
        ) {
          await connection.query(
            `INSERT INTO lifetime_point_epochs(
               deployment_key,round_id,player_address,ticker_asset_id,pending_points)
             VALUES($1,$2,$3,$4,$5)
             ON CONFLICT(deployment_key,round_id,player_address,ticker_asset_id)
             DO UPDATE SET pending_points=
               lifetime_point_epochs.pending_points + excluded.pending_points`,
            [
              deploymentKey,
              points.roundId,
              points.player,
              points.assetId,
              points.points,
            ],
          );
        }
      }
      if (
        (eventName === "RoundPointsSettled" ||
          eventName === "RoundPointsCancelled") &&
        args &&
        typeof args === "object"
      ) {
        const epoch = args as { roundId?: string };
        if (epoch.roundId) {
          await connection.query(
            eventName === "RoundPointsSettled"
              ? `UPDATE lifetime_point_epochs
                 SET activated_points=pending_points,pending_points=0
                 WHERE deployment_key=$1 AND round_id=$2`
              : `UPDATE lifetime_point_epochs
                 SET pending_points=0,cancelled=true
                 WHERE deployment_key=$1 AND round_id=$2`,
            [deploymentKey, epoch.roundId],
          );
        }
      }
      if (
        eventName === "RoundSettled" &&
        stockPotVersion &&
        args &&
        typeof args === "object"
      ) {
        const settlement = args as {
          roundId?: string;
          accountedStock?: string[];
          accountedUsdg?: string;
        };
        if (settlement.roundId && settlement.accountedStock?.length === 4) {
          await materializeRoundPresentation(
            connection,
            log.address,
            settlement.roundId,
            args as { finalHolder?: Address; winningTicker?: string },
          );
          const tokens = await roundTokens(log.address);
          for (let index = 0; index < 4; index += 1) {
            const accounted = BigInt(settlement.accountedStock[index]);
            const holder = (accounted * 5_000n) / 10_000n;
            const winning = (accounted * 3_000n) / 10_000n;
            const lifetime = (accounted * 1_000n) / 10_000n;
            const seed = (accounted * 500n) / 10_000n;
            const protocol = accounted - holder - winning - lifetime - seed;
            await connection.query(
              `INSERT INTO stock_pot_allocations(
                 deployment_key,round_id,stock_token,accounted_amount,
                 holder_amount,winning_stock_amount,lifetime_amount,
                 seed_amount,protocol_amount)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT(deployment_key,round_id,stock_token) DO UPDATE SET
                 accounted_amount=excluded.accounted_amount,
                 holder_amount=excluded.holder_amount,
                 winning_stock_amount=excluded.winning_stock_amount,
                 lifetime_amount=excluded.lifetime_amount,
                 seed_amount=excluded.seed_amount,
                 protocol_amount=excluded.protocol_amount`,
              [
                deploymentKey,
                settlement.roundId,
                tokens[index],
                accounted.toString(),
                holder.toString(),
                winning.toString(),
                lifetime.toString(),
                seed.toString(),
                protocol.toString(),
              ],
            );
          }
          const accountedUsdg = BigInt(settlement.accountedUsdg ?? "0");
          const holder = (accountedUsdg * 5_000n) / 10_000n;
          const winning = (accountedUsdg * 3_000n) / 10_000n;
          const lifetime = (accountedUsdg * 1_000n) / 10_000n;
          const seed = (accountedUsdg * 500n) / 10_000n;
          const protocol = accountedUsdg - holder - winning - lifetime - seed;
          await connection.query(
            `INSERT INTO stock_pot_allocations(
                 deployment_key,round_id,stock_token,accounted_amount,
                 holder_amount,winning_stock_amount,lifetime_amount,
                 seed_amount,protocol_amount,asset_kind)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'USDG')
               ON CONFLICT(deployment_key,round_id,stock_token) DO UPDATE SET
                 accounted_amount=excluded.accounted_amount,
                 holder_amount=excluded.holder_amount,
                 winning_stock_amount=excluded.winning_stock_amount,
                 lifetime_amount=excluded.lifetime_amount,
                 seed_amount=excluded.seed_amount,
                 protocol_amount=excluded.protocol_amount,
                 asset_kind='USDG'`,
            [
              deploymentKey,
              settlement.roundId,
              manifest.contracts.paymentToken,
              accountedUsdg.toString(),
              holder.toString(),
              winning.toString(),
              lifetime.toString(),
              seed.toString(),
              protocol.toString(),
            ],
          );
        }
      }
      if (
        eventName === "BasketRewardClaimed" &&
        stockPotVersion &&
        args &&
        typeof args === "object"
      ) {
        const reward = args as {
          roundId?: string;
          player?: Address;
          rewardType?: Hex;
          amounts?: string[];
          stockAmounts?: string[];
          usdgAmount?: string;
        };
        const category = reward.rewardType
          ? rewardCategory(reward.rewardType)
          : null;
        if (
          reward.roundId &&
          reward.player &&
          category &&
          (reward.stockAmounts ?? reward.amounts)?.length === 4
        ) {
          const tokens = await roundTokens(log.address);
          const stockAmounts = reward.stockAmounts ?? reward.amounts ?? [];
          for (let index = 0; index < 4; index += 1) {
            const amount = BigInt(stockAmounts[index]);
            if (amount === 0n) continue;
            await connection.query(
              `INSERT INTO stock_reward_claims(
                 deployment_key,round_id,transaction_hash,log_index,
                 beneficiary,category,stock_token,amount)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT(deployment_key,transaction_hash,log_index,stock_token)
               DO UPDATE SET amount=excluded.amount,canonical=true`,
              [
                deploymentKey,
                reward.roundId,
                log.transactionHash,
                log.logIndex,
                reward.player,
                category,
                tokens[index],
                amount.toString(),
              ],
            );
          }
          const usdgAmount = BigInt(reward.usdgAmount ?? "0");
          if (usdgAmount > 0n) {
            await connection.query(
              `INSERT INTO stock_reward_claims(
                 deployment_key,round_id,transaction_hash,log_index,
                 beneficiary,category,stock_token,amount)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT(deployment_key,transaction_hash,log_index,stock_token)
               DO UPDATE SET amount=excluded.amount,canonical=true`,
              [
                deploymentKey,
                reward.roundId,
                log.transactionHash,
                log.logIndex,
                reward.player,
                category,
                manifest.contracts.paymentToken,
                usdgAmount.toString(),
              ],
            );
          }
          await connection.query(
            `INSERT INTO round_highlights(deployment_key,round_id,highlight_id,kind,headline,player_address,at_seconds,block_number,log_index,transaction_hash,contract_version)
             VALUES($1,$2,$3,'CLAIM',$4,$5,0,$6,$7,$8,$9)
             ON CONFLICT(deployment_key,round_id,highlight_id) DO NOTHING`,
            [
              deploymentKey,
              reward.roundId,
              `claim:${log.transactionHash}:${log.logIndex}`,
              `${reward.player.slice(0, 6)} CLAIMED ${category.replaceAll("_", " ")}`,
              reward.player,
              log.blockNumber.toString(),
              log.logIndex,
              log.transactionHash,
              manifest.contractVersion,
            ],
          );
        }
      }
      if (
        eventName === "LifetimeRewardClaimed" &&
        stockPotVersion &&
        args &&
        typeof args === "object"
      ) {
        const reward = args as {
          player?: Address;
          token?: Address;
          amount?: string;
        };
        if (
          reward.player &&
          reward.token &&
          reward.amount &&
          BigInt(reward.amount) > 0n
        ) {
          await connection.query(
            `INSERT INTO stock_reward_claims(
               deployment_key,round_id,transaction_hash,log_index,
               beneficiary,category,stock_token,amount)
             VALUES($1,NULL,$2,$3,$4,'LIFETIME',$5,$6)
             ON CONFLICT(deployment_key,transaction_hash,log_index,stock_token)
             DO UPDATE SET amount=excluded.amount,canonical=true`,
            [
              deploymentKey,
              log.transactionHash,
              log.logIndex,
              reward.player,
              reward.token,
              reward.amount,
            ],
          );
        }
      }
      if (eventName === "RoundActivated" && args && typeof args === "object") {
        const activated = args as { roundId?: string };
        if (activated.roundId) {
          await connection.query(
            `UPDATE rounds SET state='active',activated_at=now()
             WHERE deployment_key=$1 AND round_id=$2`,
            [deploymentKey, activated.roundId],
          );
        }
      }
      if (
        (eventName === "RoundSettled" || eventName === "RoundCancelled") &&
        args &&
        typeof args === "object"
      ) {
        const completed = args as { roundId?: string };
        if (completed.roundId) {
          await connection.query(
            `UPDATE rounds SET state=$3,
               settled_at=(SELECT block_time FROM canonical_blocks
                           WHERE chain_id=$5 AND number=$4)
             WHERE deployment_key=$1 AND round_id=$2`,
            [
              deploymentKey,
              completed.roundId,
              eventName === "RoundSettled" ? "settled" : "cancelled",
              log.blockNumber.toString(),
              manifest.chainId,
            ],
          );
        }
      }
    }
    const tip = rewindBlock ?? blocks.at(-1);
    if (!tip?.hash) throw new Error("Batch has no canonical tip");
    await connection.query(
      `INSERT INTO indexer_checkpoints(deployment_key,chain_id,service,block_number,block_hash)
       VALUES($1,$2,'chain-indexer',$3,$4)
       ON CONFLICT(deployment_key,service) DO UPDATE SET
         block_number=excluded.block_number,block_hash=excluded.block_hash,
         updated_at=now()`,
      [deploymentKey, manifest.chainId, tip.number.toString(), tip.hash],
    );
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

async function run() {
  await registerDeployment();
  await rollbackIfReorged();
  let reconciledRoundCount = 0;
  for (;;) {
    try {
      const head = await client.getBlockNumber();
      const safeHead = head > confirmations ? head - confirmations : 0n;
      const checkpoint = await pool.query<{ block_number: string }>(
        "SELECT block_number FROM indexer_checkpoints WHERE deployment_key=$1 AND service='chain-indexer'",
        [deploymentKey],
      );
      const current = checkpoint.rowCount
        ? BigInt(checkpoint.rows[0].block_number)
        : BigInt(manifest.deploymentBlock) - 1n;
      if (current < safeHead) {
        const toBlock =
          current + batchSize < safeHead ? current + batchSize : safeHead;
        await indexBatch(current + 1n, toBlock);
        await heartbeat("chain-indexer", manifest.chainId, "ok", {
          indexedBlock: toBlock.toString(),
          safeHead: safeHead.toString(),
          head: head.toString(),
        });
        continue;
      }
      const knownRounds = await pool.query<{
        deployment_block: string;
      }>(
        `SELECT deployment_block::text FROM rounds
         WHERE deployment_key=$1 ORDER BY round_id`,
        [deploymentKey],
      );
      const knownRoundCount = knownRounds.rows.length;
      if (knownRoundCount > reconciledRoundCount) {
        const firstNew =
          knownRounds.rows[reconciledRoundCount]?.deployment_block;
        if (firstNew) {
          const rewindNumber = BigInt(firstNew) - 1n;
          const rewind = await client.getBlock({ blockNumber: rewindNumber });
          await pool.query(
            `UPDATE indexer_checkpoints
             SET block_number=$2,block_hash=$3,updated_at=now()
             WHERE deployment_key=$1 AND service='chain-indexer'`,
            [deploymentKey, rewindNumber.toString(), rewind.hash],
          );
          reconciledRoundCount = knownRoundCount;
          continue;
        }
      }
      await heartbeat("chain-indexer", manifest.chainId, "ok", {
        indexedBlock: current.toString(),
        safeHead: safeHead.toString(),
        head: head.toString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await heartbeat("chain-indexer", manifest.chainId, "error", {
        message,
      }).catch(() => undefined);
      process.stderr.write(`${new Date().toISOString()} ${message}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

await run();
