import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Wallet } from "ethers";
import {
  createWalletClient,
  getAddress,
  hexToString,
  http,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { lastBellAbi, roundManagerAbi } from "../src/lib/web3/last-bell-abi";
import {
  deploymentKeyFor,
  loadManifest,
  pool,
  publicClientFor,
  chainFor,
} from "../services/common";

const command = process.argv[2] ?? "status";
const targetHours = Number(process.env.SOAK_TARGET_HOURS || 24);
const targetRounds = Number(process.env.SOAK_TARGET_ROUNDS || 100);
const gasReserveWei = BigInt(
  process.env.SOAK_GAS_RESERVE_WEI || "2000000000000000",
);
const appUrl = process.env.SOAK_APP_URL || "http://127.0.0.1:3001";
const manifest = await loadManifest();
if (manifest.chainId !== 46630 || !manifest.mockOnly) {
  throw new Error(
    "The soak controller is testnet-only and requires mockOnly=true.",
  );
}
const deploymentKey = deploymentKeyFor(manifest);
const client = publicClientFor(manifest);

async function soakAccount(label: "A" | "B") {
  const keystorePath = process.env[`KEYGAME_SOAK_PLAYER_${label}_KEYSTORE`];
  const passwordPath =
    process.env[`KEYGAME_SOAK_PLAYER_${label}_PASSWORD_FILE`];
  if (!keystorePath || !passwordPath) {
    throw new Error(`Encrypted soak player ${label} is not configured.`);
  }
  const [keystore, password] = await Promise.all([
    readFile(keystorePath, "utf8"),
    readFile(passwordPath, "utf8"),
  ]);
  const decrypted = await Wallet.fromEncryptedJson(keystore, password.trim());
  const account = privateKeyToAccount(decrypted.privateKey as Hex);
  return {
    account,
    wallet: createWalletClient({
      account,
      chain: chainFor(manifest.chainId),
      transport: http(manifest.rpc.primary, { timeout: 3_000 }),
    }),
  };
}

async function transaction(
  runId: string,
  actionId: string,
  key: string,
  signer: Awaited<ReturnType<typeof soakAccount>>,
  send: () => Promise<Hex>,
) {
  const existing = await pool.query<{
    transaction_hash: Hex | null;
    state: string;
  }>(
    "SELECT transaction_hash,state FROM soak_transactions WHERE run_id=$1 AND idempotency_key=$2",
    [runId, key],
  );
  if (existing.rows[0]?.transaction_hash) {
    const receipt = await client
      .getTransactionReceipt({ hash: existing.rows[0].transaction_hash })
      .catch(() => null);
    if (!receipt) return existing.rows[0].transaction_hash;
    await pool.query(
      `UPDATE soak_transactions SET state=$3,receipt=$4,updated_at=now()
       WHERE run_id=$1 AND idempotency_key=$2`,
      [
        runId,
        key,
        receipt.status === "success" ? "confirmed" : "reverted",
        JSON.stringify(receipt, (_, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      ],
    );
    if (receipt.status !== "success") throw new Error(`${key} reverted`);
    return existing.rows[0].transaction_hash;
  }
  const nonce = await client.getTransactionCount({
    address: signer.account.address,
    blockTag: "pending",
  });
  await pool.query(
    `INSERT INTO soak_transactions(
       run_id,action_id,idempotency_key,signer_address,nonce,state)
     VALUES($1,$2,$3,$4,$5,'planned')
     ON CONFLICT(run_id,idempotency_key) DO NOTHING`,
    [runId, actionId, key, signer.account.address, nonce],
  );
  const hash = await send();
  await pool.query(
    `UPDATE soak_transactions SET transaction_hash=$3,state='broadcast',
       updated_at=now() WHERE run_id=$1 AND idempotency_key=$2`,
    [runId, key, hash],
  );
  const receipt = await client.waitForTransactionReceipt({ hash });
  await pool.query(
    `UPDATE soak_transactions SET state=$3,receipt=$4,updated_at=now()
     WHERE run_id=$1 AND idempotency_key=$2`,
    [
      runId,
      key,
      receipt.status === "success" ? "confirmed" : "reverted",
      JSON.stringify(receipt, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ],
  );
  if (receipt.status !== "success") throw new Error(`${key} reverted`);
  return hash;
}

async function ensureAllowance(
  runId: string,
  actionId: string,
  signer: Awaited<ReturnType<typeof soakAccount>>,
) {
  const allowance = await client.readContract({
    address: manifest.contracts.paymentToken,
    abi: [
      {
        type: "function",
        name: "allowance",
        stateMutability: "view",
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
        ],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "allowance",
    args: [signer.account.address, manifest.contracts.paymentRouter],
  });
  if (allowance >= 10_000_000n) return;
  await transaction(
    runId,
    actionId,
    `approve:${signer.account.address.toLowerCase()}`,
    signer,
    () =>
      signer.wallet.writeContract({
        address: manifest.contracts.paymentToken,
        abi: [
          {
            type: "function",
            name: "approve",
            stateMutability: "nonpayable",
            inputs: [
              { name: "spender", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [{ type: "bool" }],
          },
        ],
        functionName: "approve",
        args: [manifest.contracts.paymentRouter, 100_000_000n],
      }),
  );
}

async function report(ticker: string) {
  const response = await fetch(
    `${appUrl}/api/market/report?ticker=${encodeURIComponent(ticker)}`,
    { cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  const body = (await response.json()) as {
    ok?: boolean;
    tickerIndex?: number;
    report?: Hex;
    error?: string;
  };
  if (
    !response.ok ||
    !body.ok ||
    body.tickerIndex === undefined ||
    !body.report
  ) {
    throw new Error(body.error || "Market report unavailable.");
  }
  return { tickerIndex: body.tickerIndex, proof: body.report };
}

async function activeRound() {
  const [active, prepared] = await Promise.all([
    client.readContract({
      address: manifest.contracts.manager,
      abi: roundManagerAbi,
      functionName: "activeRound",
    }),
    client.readContract({
      address: manifest.contracts.manager,
      abi: roundManagerAbi,
      functionName: "preparedRound",
    }),
  ]);
  return prepared !== zeroAddress ? prepared : active;
}

async function tickerSymbols(round: Address) {
  const configs = await Promise.all(
    [0n, 1n, 2n, 3n].map((index) =>
      client.readContract({
        address: round,
        abi: lastBellAbi,
        functionName: "tickerConfigs",
        args: [index],
      }),
    ),
  );
  return configs.map((config) =>
    hexToString(config[0], { size: 32 }).replace(/\0/g, ""),
  );
}

async function executeRoundAction(
  runId: string,
  action: { id: string; idempotency_key: string },
  runGasReserveWei: bigint,
) {
  const [a, b] = await Promise.all([soakAccount("A"), soakAccount("B")]);
  const balances = await Promise.all([
    client.getBalance({ address: a.account.address }),
    client.getBalance({ address: b.account.address }),
  ]);
  if (balances.some((balance) => balance < runGasReserveWei)) {
    await pool.query(
      "UPDATE soak_runs SET state='monitoring',spend_stopped_at=now(),updated_at=now() WHERE id=$1",
      [runId],
    );
    throw new Error("Gas reserve reached; new spend stopped.");
  }
  await pool.query(
    `UPDATE soak_runs SET state='running',spend_stopped_at=null,updated_at=now()
     WHERE id=$1 AND state='monitoring'`,
    [runId],
  );
  const round = getAddress(await activeRound());
  if (round === zeroAddress) throw new Error("No prepared or active round.");
  const symbols = await tickerSymbols(round);
  await ensureAllowance(runId, action.id, a);
  await ensureAllowance(runId, action.id, b);
  const first = await report(symbols[0]);
  await transaction(
    runId,
    action.id,
    `${action.idempotency_key}:call:a`,
    a,
    () =>
      a.wallet.writeContract({
        address: round,
        abi: lastBellAbi,
        functionName: "claimBell",
        args: [first.tickerIndex, first.proof, 4],
      }),
  );
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  const second = await report(symbols[1]);
  await transaction(
    runId,
    action.id,
    `${action.idempotency_key}:call:b`,
    b,
    () =>
      b.wallet.writeContract({
        address: round,
        abi: lastBellAbi,
        functionName: "claimBell",
        args: [second.tickerIndex, second.proof, 4],
      }),
  );
}

async function createRun() {
  if (targetHours < 24 || targetRounds < 100) {
    throw new Error("Audit soak requires at least 24 hours and 100 rounds.");
  }
  const tokenPath = process.env.SOAK_CONTROL_TOKEN_FILE;
  if (!tokenPath) throw new Error("SOAK_CONTROL_TOKEN_FILE is required.");
  const authDigest = createHash("sha256")
    .update((await readFile(tokenPath, "utf8")).trim())
    .digest("hex");
  await Promise.all([soakAccount("A"), soakAccount("B")]);
  const existingRun = await pool.query(
    `SELECT id FROM soak_runs WHERE deployment_key=$1
       AND state IN ('scheduled','running','monitoring') LIMIT 1`,
    [deploymentKey],
  );
  if (existingRun.rowCount) {
    throw new Error(
      `Active soak run already exists: ${existingRun.rows[0].id}`,
    );
  }
  const runId = `soak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const intervalMs = (targetHours * 60 * 60 * 1_000) / targetRounds;
  await pool.query(
    `INSERT INTO soak_runs(
       id,deployment_key,chain_id,state,target_hours,target_rounds,
       gas_reserve_wei,config,started_at)
     VALUES($1,$2,46630,'running',$3,$4,$5,$6,now())`,
    [
      runId,
      deploymentKey,
      targetHours,
      targetRounds,
      gasReserveWei.toString(),
      JSON.stringify({ appUrl, intervalMs }),
    ],
  );
  for (let index = 0; index < targetRounds; index += 1) {
    await pool.query(
      `INSERT INTO soak_actions(
         run_id,idempotency_key,action_type,scheduled_at,payload)
       VALUES($1,$2,'sample-round',$3,$4)`,
      [
        runId,
        `round:${index + 1}`,
        new Date(Date.now() + index * intervalMs),
        JSON.stringify({ ordinal: index + 1, minimumCalls: 2 }),
      ],
    );
  }
  const faults = [
    ["rpc-primary-failure", 0.08, 90],
    ["dex-stale", 0.16, 25],
    ["unsafe-market", 0.24, 30],
    ["keeper-restart", 0.35, 0],
    ["indexer-restart", 0.45, 0],
    ["web-restart", 0.55, 0],
    ["stale-attestation", 0.65, 0],
    ["replayed-attestation", 0.72, 0],
    ["isolated-reorg-fixture", 0.82, 0],
    ["duplicate-round-fixture", 0.9, 0],
  ] as const;
  for (const [faultType, fraction, seconds] of faults) {
    await pool.query(
      `INSERT INTO soak_faults(
         run_id,fault_type,auth_digest,scheduled_at,restore_at,parameters)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        runId,
        faultType,
        authDigest,
        new Date(Date.now() + targetHours * 3_600_000 * fraction),
        seconds
          ? new Date(
              Date.now() + targetHours * 3_600_000 * fraction + seconds * 1_000,
            )
          : null,
        JSON.stringify({ durationSeconds: seconds }),
      ],
    );
  }
  process.stdout.write(`${runId}\n`);
}

async function runDueActions() {
  const run = await pool.query<{ id: string; gas_reserve_wei: string }>(
    `SELECT id,gas_reserve_wei::text FROM soak_runs WHERE deployment_key=$1
       AND state IN ('running','monitoring') ORDER BY created_at DESC LIMIT 1`,
    [deploymentKey],
  );
  if (!run.rowCount) throw new Error("No active soak run.");
  const runId = run.rows[0].id;
  for (;;) {
    const due = await pool.query<{
      id: string;
      idempotency_key: string;
    }>(
      `UPDATE soak_actions SET state='running',started_at=now()
       WHERE id=(SELECT id FROM soak_actions
          WHERE run_id=$1 AND state='scheduled' AND scheduled_at<=now()
          ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING id,idempotency_key`,
      [runId],
    );
    if (!due.rowCount) break;
    try {
      await executeRoundAction(
        runId,
        due.rows[0],
        BigInt(run.rows[0].gas_reserve_wei),
      );
      await pool.query(
        "UPDATE soak_actions SET state='confirmed',completed_at=now() WHERE id=$1",
        [due.rows[0].id],
      );
    } catch (error) {
      await pool.query(
        `UPDATE soak_actions SET state='failed',completed_at=now(),last_error=$2
         WHERE id=$1`,
        [
          due.rows[0].id,
          error instanceof Error ? error.message : String(error),
        ],
      );
    }
  }
}

async function status() {
  const result = await pool.query(
    `SELECT r.*,
       count(a.*) FILTER (WHERE a.state='confirmed') AS confirmed_actions,
       count(a.*) FILTER (WHERE a.state='failed') AS failed_actions,
       count(a.*) FILTER (WHERE a.state='scheduled') AS scheduled_actions
     FROM soak_runs r LEFT JOIN soak_actions a ON a.run_id=r.id
     WHERE r.deployment_key=$1
     GROUP BY r.id ORDER BY r.created_at DESC LIMIT 1`,
    [deploymentKey],
  );
  process.stdout.write(`${JSON.stringify(result.rows[0] ?? null, null, 2)}\n`);
}

async function reconcile() {
  const run = await pool.query<{ id: string }>(
    `SELECT id FROM soak_runs WHERE deployment_key=$1
     ORDER BY created_at DESC LIMIT 1`,
    [deploymentKey],
  );
  if (!run.rowCount) throw new Error("No soak run to reconcile.");
  const runId = run.rows[0].id;
  const settlements = await pool.query<{
    contract_address: string;
    args: Record<string, string>;
  }>(
    `SELECT contract_address,args FROM chain_events
     WHERE deployment_key=$1 AND event_name='RoundSettled'
       AND coalesce(args->>'contractVersion','') <> ''
     ORDER BY block_number,log_index`,
    [deploymentKey],
  );
  for (const settlement of settlements.rows) {
    const args = settlement.args;
    const gross = BigInt(args.grossPot);
    const holder = BigInt(args.holderPool);
    const airtime = BigInt(args.airtimePool);
    const seed = BigInt(args.nextRoundPool);
    const protocol = BigInt(args.protocolPool);
    const discrepancy = gross - holder - airtime - seed - protocol;
    const claims = await pool.query<{ fees: string }>(
      `SELECT coalesce(sum((args->>'fee')::numeric),0)::text AS fees
       FROM chain_events WHERE deployment_key=$1
         AND lower(contract_address)=lower($2) AND event_name='BellClaimed'`,
      [deploymentKey, settlement.contract_address],
    );
    await pool.query(
      `INSERT INTO soak_reconciliations(
         run_id,round_contract,round_id,canonical,fee_raw,holder_raw,airtime_raw,
         seed_raw,protocol_raw,discrepancy_raw,evidence)
       VALUES($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(run_id,round_contract) DO UPDATE SET
         fee_raw=excluded.fee_raw,holder_raw=excluded.holder_raw,
         airtime_raw=excluded.airtime_raw,seed_raw=excluded.seed_raw,
         protocol_raw=excluded.protocol_raw,
         discrepancy_raw=excluded.discrepancy_raw,evidence=excluded.evidence,
         checked_at=now()`,
      [
        runId,
        settlement.contract_address,
        args.roundId,
        claims.rows[0]?.fees ?? "0",
        holder.toString(),
        airtime.toString(),
        seed.toString(),
        protocol.toString(),
        discrepancy.toString(),
        JSON.stringify({
          grossPot: gross.toString(),
          totalRawControlTime: args.totalRawControlTime,
          contractVersion: args.contractVersion,
        }),
      ],
    );
    await pool.query(
      `INSERT INTO soak_assertions(
         run_id,assertion_key,scope,passed,expected,actual)
       VALUES($1,'payout-conservation',$2,$3,$4,$5)`,
      [
        runId,
        settlement.contract_address,
        discrepancy === 0n,
        JSON.stringify({ discrepancyRaw: "0" }),
        JSON.stringify({ discrepancyRaw: discrepancy.toString() }),
      ],
    );
  }
  const failed = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM soak_reconciliations WHERE run_id=$1 AND discrepancy_raw<>0",
    [runId],
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        runId,
        reconciledRounds: settlements.rowCount,
        discrepancies: Number(failed.rows[0]?.count ?? 0),
      },
      null,
      2,
    )}\n`,
  );
}

if (command === "start") await createRun();
else if (command === "run") await runDueActions();
else if (command === "status") await status();
else if (command === "reconcile") await reconcile();
else throw new Error("Usage: testnet-soak.ts start|run|status|reconcile");

await pool.end();
