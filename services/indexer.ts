import { decodeEventLog, type Address, zeroAddress } from "viem";
import {
  lastBellAbi,
  lastBellV4Abi,
  lifetimePointsVaultAbi,
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
  let number = BigInt(checkpoint.rows[0].block_number);
  const current = await client.getBlock({ blockNumber: number });
  if (
    current.hash?.toLowerCase() === checkpoint.rows[0].block_hash.toLowerCase()
  ) {
    return;
  }

  for (
    let depth = 0;
    depth < 200 && number >= BigInt(manifest.deploymentBlock);
    depth++
  ) {
    const [stored, canonical] = await Promise.all([
      pool.query<{ hash: string }>(
        "SELECT hash FROM canonical_blocks WHERE chain_id=$1 AND number=$2",
        [manifest.chainId, number.toString()],
      ),
      client.getBlock({ blockNumber: number }),
    ]);
    if (
      stored.rowCount &&
      canonical.hash?.toLowerCase() === stored.rows[0].hash.toLowerCase()
    ) {
      await pool.query("BEGIN");
      try {
        await pool.query(
          "DELETE FROM chain_events WHERE deployment_key=$1 AND block_number>$2",
          [deploymentKey, number.toString()],
        );
        await pool.query(
          "DELETE FROM canonical_blocks WHERE chain_id=$1 AND number>$2",
          [manifest.chainId, number.toString()],
        );
        await pool.query(
          `UPDATE indexer_checkpoints SET block_number=$2,block_hash=$3,updated_at=now()
           WHERE deployment_key=$1 AND service='chain-indexer'`,
          [deploymentKey, number.toString(), canonical.hash],
        );
        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
      return;
    }
    number -= 1n;
  }
  throw new Error("Reorg exceeds the 200-block rollback safety window");
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
        }
      }
      if (
        eventName === "BellClaimed" &&
        manifest.contractVersion === "last-bell-v4-stock-pot" &&
        args &&
        typeof args === "object"
      ) {
        const claim = args as {
          roundId?: string;
          player?: Address;
          ticker?: string;
          usdgAmount?: string;
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
            blockNumber: log.blockNumber,
          });
          await connection.query(
            `INSERT INTO stock_pot_contributions(
               deployment_key,round_id,transaction_hash,log_index,player_address,
               ticker_index,stock_token,usdg_amount,stock_received,multiplier_bps,
               points,recent_volume)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
              claim.stockReceived,
              Number(claim.multiplierBps),
              claim.points,
              claim.recentVolume,
            ],
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
            [
              deploymentKey,
              rewindNumber.toString(),
              rewind.hash,
            ],
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
