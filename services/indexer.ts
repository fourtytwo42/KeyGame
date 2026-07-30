import { decodeEventLog, type Address, zeroAddress } from "viem";
import { lastBellAbi, roundManagerAbi } from "../src/lib/web3/last-bell-abi";
import { heartbeat, loadManifest, pool, publicClientFor } from "./common";

const manifest = await loadManifest();
const client = publicClientFor(manifest);
const confirmations = BigInt(process.env.INDEXER_CONFIRMATIONS || 3);
const batchSize = BigInt(process.env.INDEXER_BATCH_SIZE || 100);

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
    "SELECT block_number,block_hash FROM indexer_checkpoints WHERE chain_id=$1 AND service='chain-indexer'",
    [manifest.chainId],
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
          "DELETE FROM chain_events WHERE chain_id=$1 AND block_number>$2",
          [manifest.chainId, number.toString()],
        );
        await pool.query(
          "DELETE FROM canonical_blocks WHERE chain_id=$1 AND number>$2",
          [manifest.chainId, number.toString()],
        );
        await pool.query(
          `UPDATE indexer_checkpoints SET block_number=$2,block_hash=$3,updated_at=now()
           WHERE chain_id=$1 AND service='chain-indexer'`,
          [manifest.chainId, number.toString(), canonical.hash],
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
    "SELECT contract_address FROM rounds WHERE chain_id=$1",
    [manifest.chainId],
  );
  return [
    manifest.contracts.manager,
    ...rounds.rows.map((row) => row.contract_address),
  ].filter((address) => address !== zeroAddress);
}

async function indexBatch(fromBlock: bigint, toBlock: bigint) {
  const addresses = await indexedAddresses();
  const logs = addresses.length
    ? await client.getLogs({ address: addresses, fromBlock, toBlock })
    : [];
  const blocks = [];
  for (let number = fromBlock; number <= toBlock; number += 1n) {
    blocks.push(await client.getBlock({ blockNumber: number }));
  }

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
          abi: [...roundManagerAbi, ...lastBellAbi],
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
           chain_id,transaction_hash,log_index,block_number,block_hash,
           contract_address,event_name,args,topics,data)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(chain_id,transaction_hash,log_index) DO NOTHING`,
        [
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
            `INSERT INTO rounds(chain_id,round_id,contract_address,state,deployment_block)
             VALUES($1,$2,$3,'prepared',$4)
             ON CONFLICT(chain_id,round_id) DO UPDATE SET
               contract_address=excluded.contract_address`,
            [
              manifest.chainId,
              prepared.roundId,
              prepared.round,
              log.blockNumber.toString(),
            ],
          );
        }
      }
      if (eventName === "RoundActivated" && args && typeof args === "object") {
        const activated = args as { roundId?: string };
        if (activated.roundId) {
          await connection.query(
            `UPDATE rounds SET state='active',activated_at=now()
             WHERE chain_id=$1 AND round_id=$2`,
            [manifest.chainId, activated.roundId],
          );
        }
      }
    }
    const tip = blocks.at(-1);
    if (!tip?.hash) throw new Error("Batch has no canonical tip");
    await connection.query(
      `INSERT INTO indexer_checkpoints(chain_id,service,block_number,block_hash)
       VALUES($1,'chain-indexer',$2,$3)
       ON CONFLICT(chain_id,service) DO UPDATE SET
         block_number=excluded.block_number,block_hash=excluded.block_hash,
         updated_at=now()`,
      [manifest.chainId, tip.number.toString(), tip.hash],
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
  await rollbackIfReorged();
  for (;;) {
    try {
      const head = await client.getBlockNumber();
      const safeHead = head > confirmations ? head - confirmations : 0n;
      const checkpoint = await pool.query<{ block_number: string }>(
        "SELECT block_number FROM indexer_checkpoints WHERE chain_id=$1 AND service='chain-indexer'",
        [manifest.chainId],
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
