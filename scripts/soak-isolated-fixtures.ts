import { randomUUID } from "node:crypto";
import { pool } from "../services/common";

const fixture = process.argv[2];
if (!["isolated-reorg-fixture", "duplicate-round-fixture"].includes(fixture)) {
  throw new Error(
    "Usage: soak-isolated-fixtures.ts isolated-reorg-fixture|duplicate-round-fixture",
  );
}

const schema = `soak_fixture_${randomUUID().replace(/-/g, "")}`;
const client = await pool.connect();
try {
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  if (fixture === "duplicate-round-fixture") {
    await client.query(`
      CREATE TABLE rounds (
        deployment_key text NOT NULL,
        round_id bigint NOT NULL,
        contract_address text NOT NULL UNIQUE,
        PRIMARY KEY(deployment_key, round_id)
      )`);
    await client.query(
      "INSERT INTO rounds VALUES('deployment-a',7,'0x01'),('deployment-b',7,'0x02')",
    );
    let rejected = false;
    try {
      await client.query("INSERT INTO rounds VALUES('deployment-a',7,'0x03')");
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Duplicate round identity was accepted.");
    const rows = await client.query(
      "SELECT count(*)::int AS count FROM rounds",
    );
    if (rows.rows[0].count !== 2) {
      throw new Error("Cross-deployment round identities were not preserved.");
    }
  } else {
    await client.query(`
      CREATE TABLE canonical_blocks (
        block_number bigint PRIMARY KEY,
        block_hash text NOT NULL
      );
      CREATE TABLE raw_logs (
        block_number bigint NOT NULL,
        block_hash text NOT NULL,
        log_index integer NOT NULL,
        canonical boolean NOT NULL,
        PRIMARY KEY(block_hash, log_index)
      );
      CREATE TABLE derived_claims (
        block_number bigint NOT NULL,
        block_hash text NOT NULL,
        log_index integer NOT NULL,
        PRIMARY KEY(block_hash, log_index)
      )`);
    await client.query(
      "INSERT INTO canonical_blocks VALUES(100,'0xold'); INSERT INTO raw_logs VALUES(100,'0xold',0,true); INSERT INTO derived_claims VALUES(100,'0xold',0)",
    );
    await client.query("BEGIN");
    await client.query(
      "UPDATE raw_logs SET canonical=false WHERE block_number>=100; DELETE FROM derived_claims WHERE block_number>=100; DELETE FROM canonical_blocks WHERE block_number>=100",
    );
    await client.query(
      "INSERT INTO canonical_blocks VALUES(100,'0xnew'); INSERT INTO raw_logs VALUES(100,'0xnew',0,true); INSERT INTO derived_claims VALUES(100,'0xnew',0)",
    );
    await client.query("COMMIT");
    const result = await client.query(
      "SELECT block_hash FROM derived_claims WHERE block_number=100",
    );
    if (result.rows.length !== 1 || result.rows[0].block_hash !== "0xnew") {
      throw new Error("Canonical reorg rebuild did not replace derived state.");
    }
  }
  process.stdout.write(`${fixture}: passed\n`);
} finally {
  await client.query("RESET search_path").catch(() => undefined);
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  client.release();
  await pool.end();
}
