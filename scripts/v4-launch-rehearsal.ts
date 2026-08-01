import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  encodeFunctionData,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  maxUint256,
  parseAbi,
  parseUnits,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { foundry } from "viem/chains";
import {
  assertRehearsalScope,
  rehearsalRoundSchedule,
  REHEARSAL_CONTRIBUTIONS,
  DEVNET_REHEARSAL_BUDGET_RAW,
  DEVNET_REHEARSAL_DURATION_MS,
  DEVNET_REHEARSAL_ROUNDS,
  rehearsalGasLimit,
  restartCheckpointsForSettledRounds,
  validateRehearsalActors,
} from "../src/lib/release/launch-rehearsal";
import {
  lastBellV4Abi,
  lifetimePointsVaultAbi,
  rewardRouterV4Abi,
  roundManagerV4Abi,
  stockSwapAdapterAbi,
} from "../src/lib/web3/last-bell-abi";
import {
  deploymentKeyFor,
  loadManifest,
  pool,
  publicClientFor,
  type DeploymentManifest,
} from "../services/common";

const execFile = promisify(execFileCallback);

const erc20Abi = parseAbi([
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const managerRoleAbi = parseAbi([
  "function admin() view returns (address)",
  "function pendingAdmin() view returns (address)",
  "function keeper() view returns (address)",
  "function treasury() view returns (address)",
  "function pendingTreasury() view returns (address)",
]);
const adapterAdminAbi = parseAbi([
  "function admin() view returns (address)",
  "function pendingAdmin() view returns (address)",
  "function swapStockForUsdg(address,uint256,uint256,uint64,address) returns (uint256)",
]);

function unlockedWallet(address: Address, rpcUrl: string) {
  return createWalletClient({
    account: address,
    chain: foundry,
    transport: http(rpcUrl),
  });
}
type WalletClient = ReturnType<typeof unlockedWallet>;
type RunRow = {
  id: string;
  deployment_key: string;
  source_commit: string;
  manifest_hash: string;
  operator_address: Address;
  player_a_address: Address;
  player_b_address: Address;
  state: string;
  target_rounds: number;
  duration_minutes: number;
  usdg_budget: string;
  spent_usdg: string;
  settled_rounds: number;
  initial_round_id: string;
  started_at: Date;
  ends_at: Date;
  completed_at: Date | null;
  last_error: string | null;
};
type ActionRow = {
  id: string;
  state: string;
  transaction_hash: Hex | null;
  signed_transaction: Hex | null;
  nonce: string | null;
  details?: Record<string, unknown>;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function configuredRestartHelper() {
  const helper = await realpath(required("KEYGAME_REHEARSAL_RESTART_HELPER"));
  const root = await realpath(process.cwd());
  const relative = path.relative(root, helper);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error(
      "Rehearsal restart helper must remain outside the repository.",
    );
  }
  const helperStat = await stat(helper);
  if (helperStat.uid !== 0 || (helperStat.mode & 0o022) !== 0) {
    throw new Error(
      "Rehearsal restart helper must be root-owned and not group/world writable.",
    );
  }
  return helper;
}

async function assertRestartAuthority() {
  const helper = await configuredRestartHelper();
  for (const service of ["keeper", "indexer"] as const) {
    await execFile("sudo", ["-n", "-l", helper, service], {
      timeout: 10_000,
    });
  }
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

async function manifestHash() {
  const manifestPath = await realpath(required("KEYGAME_DEPLOYMENT_MANIFEST"));
  return sha256(await readFile(manifestPath));
}

async function context() {
  const manifest = await loadManifest();
  if (
    manifest.chainId !== 31_337 ||
    !manifest.mockOnly ||
    manifest.contractVersion !== "last-bell-v4-stock-pot" ||
    !manifest.contracts.swapAdapter ||
    !manifest.contracts.rewardRouter ||
    !manifest.contracts.lifetimePointsVault
  ) {
    throw new Error(
      "The launch rehearsal requires an isolated mock-only chain-31337 manifest.",
    );
  }
  const client = publicClientFor(manifest);
  if ((await client.getChainId()) !== 31_337) {
    throw new Error("Launch rehearsal RPC must be chain 31337.");
  }
  const operator = getAddress(manifest.deployer!);
  const players = manifest.players ?? [];
  if (players.length < 2)
    throw new Error("Rehearsal manifest needs two deterministic players.");
  const playerA = getAddress(players[0]);
  const playerB = getAddress(players[1]);
  const operatorWallet = unlockedWallet(operator, manifest.rpc.primary);
  const playerAWallet = unlockedWallet(playerA, manifest.rpc.primary);
  const playerBWallet = unlockedWallet(playerB, manifest.rpc.primary);
  const [admin, pendingAdmin, keeper, treasury, pendingTreasury] =
    await Promise.all([
      client.readContract({
        address: manifest.contracts.manager,
        abi: managerRoleAbi,
        functionName: "admin",
      }),
      client.readContract({
        address: manifest.contracts.manager,
        abi: managerRoleAbi,
        functionName: "pendingAdmin",
      }),
      client.readContract({
        address: manifest.contracts.manager,
        abi: managerRoleAbi,
        functionName: "keeper",
      }),
      client.readContract({
        address: manifest.contracts.manager,
        abi: managerRoleAbi,
        functionName: "treasury",
      }),
      client.readContract({
        address: manifest.contracts.manager,
        abi: managerRoleAbi,
        functionName: "pendingTreasury",
      }),
    ]);
  if (pendingAdmin !== zeroAddress || pendingTreasury !== zeroAddress) {
    throw new Error(
      "Pending role transfers must be empty before the rehearsal.",
    );
  }
  validateRehearsalActors({
    operator,
    playerA,
    playerB,
    roles: [admin, keeper, treasury],
  });
  return {
    manifest,
    manifestHash: await manifestHash(),
    client,
    operatorWallet,
    playerAWallet,
    playerBWallet,
    operator,
    playerA,
    playerB,
    deploymentKey: deploymentKeyFor(manifest),
  };
}

async function currentRun(deploymentKey: string) {
  const result = await pool.query<RunRow>(
    `SELECT * FROM v4_launch_rehearsal_runs
     WHERE deployment_key=$1 ORDER BY created_at DESC LIMIT 1`,
    [deploymentKey],
  );
  return result.rows[0];
}

async function reconcileBroadcast(
  action: ActionRow,
  client: ReturnType<typeof publicClientFor>,
) {
  if (!action.transaction_hash) return false;
  const receipt = await client
    .getTransactionReceipt({ hash: action.transaction_hash })
    .catch(() => null);
  if (receipt) {
    await pool.query(
      `UPDATE v4_launch_rehearsal_actions SET state=$2,receipt_block=$3,
         signed_transaction=NULL,last_error=$4,updated_at=now() WHERE id=$1`,
      [
        action.id,
        receipt.status === "success" ? "confirmed" : "failed",
        receipt.blockNumber.toString(),
        receipt.status === "success" ? null : "Transaction reverted",
      ],
    );
    if (receipt.status !== "success")
      throw new Error("Rehearsal transaction reverted.");
    return true;
  }
  const pending = await client
    .getTransaction({ hash: action.transaction_hash })
    .catch(() => null);
  if (pending) return false;
  if (!action.signed_transaction || action.nonce === null) {
    throw new Error(
      "Broadcast action lacks recoverable signed transaction evidence.",
    );
  }
  const signer = getAddress(
    (
      await pool.query<{ actor_address: Address }>(
        "SELECT actor_address FROM v4_launch_rehearsal_actions WHERE id=$1",
        [action.id],
      )
    ).rows[0].actor_address,
  );
  const pendingNonce = await client.getTransactionCount({
    address: signer,
    blockTag: "pending",
  });
  if (pendingNonce > Number(action.nonce)) {
    throw new Error("Rehearsal nonce advanced without a recoverable receipt.");
  }
  if (pendingNonce === Number(action.nonce)) {
    const rebroadcast = await client.sendRawTransaction({
      serializedTransaction: action.signed_transaction,
    });
    if (rebroadcast !== action.transaction_hash) {
      throw new Error(
        "Rebroadcast hash does not match persisted transaction hash.",
      );
    }
  }
  return false;
}

async function sendAction(input: {
  run: RunRow;
  key: string;
  type: string;
  wallet: WalletClient;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  roundId?: bigint;
  roundAddress?: Address;
  tickerIndex?: number;
  amount?: bigint;
  details?: Record<string, unknown>;
  client: ReturnType<typeof publicClientFor>;
}) {
  const found = await pool.query<ActionRow>(
    `SELECT id::text,state,transaction_hash,signed_transaction,nonce::text
     FROM v4_launch_rehearsal_actions WHERE run_id=$1 AND idempotency_key=$2`,
    [input.run.id, input.key],
  );
  let action = found.rows[0];
  if (action?.state === "confirmed") return action.transaction_hash;
  if (action?.transaction_hash) {
    if (await reconcileBroadcast(action, input.client))
      return action.transaction_hash;
    return action.transaction_hash;
  }
  const account = input.wallet.account;
  if (!account) throw new Error("Rehearsal signer is unavailable.");
  if (!action) {
    action = (
      await pool.query<ActionRow>(
        `INSERT INTO v4_launch_rehearsal_actions(
           run_id,idempotency_key,action_type,actor_address,round_id,
           round_address,ticker_index,usdg_amount,state,details)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)
         RETURNING id::text,state,transaction_hash,signed_transaction,nonce::text`,
        [
          input.run.id,
          input.key,
          input.type,
          account.address,
          input.roundId?.toString() ?? null,
          input.roundAddress ?? null,
          input.tickerIndex ?? null,
          (input.amount ?? 0n).toString(),
          JSON.stringify(input.details ?? {}),
        ],
      )
    ).rows[0];
  }
  const data = encodeFunctionData({
    abi: input.abi,
    functionName: input.functionName,
    args: input.args,
  } as never);
  await input.client.call({ account, to: input.address, data });
  const nonce = await input.client.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  const estimatedGas = await input.client.estimateGas({
    account,
    to: input.address,
    data,
  });
  const request = await input.wallet.prepareTransactionRequest({
    account,
    to: input.address,
    data,
    gas: rehearsalGasLimit(estimatedGas),
    nonce,
  });
  const signed = await input.wallet.signTransaction(request);
  const hash = keccak256(signed);
  await pool.query(
    `UPDATE v4_launch_rehearsal_actions SET state='broadcast',nonce=$2,
       transaction_hash=$3,signed_transaction=$4,updated_at=now() WHERE id=$1`,
    [action.id, nonce, hash, signed],
  );
  const sent = await input.client.sendRawTransaction({
    serializedTransaction: signed,
  });
  if (sent !== hash)
    throw new Error("Broadcast hash differs from persisted hash.");
  const receipt = await input.client.waitForTransactionReceipt({ hash });
  await pool.query(
    `UPDATE v4_launch_rehearsal_actions SET state=$2,receipt_block=$3,
       signed_transaction=NULL,last_error=$4,updated_at=now() WHERE id=$1`,
    [
      action.id,
      receipt.status === "success" ? "confirmed" : "failed",
      receipt.blockNumber.toString(),
      receipt.status === "success" ? null : "Transaction reverted",
    ],
  );
  if (receipt.status !== "success") throw new Error(`${input.type} reverted.`);
  return hash;
}

async function ensureApproval(
  run: RunRow,
  wallet: WalletClient,
  token: Address,
  spender: Address,
  requiredAmount: bigint,
  client: ReturnType<typeof publicClientFor>,
  key: string,
) {
  const account = wallet.account!;
  const allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, spender],
  });
  if (allowance >= requiredAmount) return;
  await sendAction({
    run,
    key,
    type: "approve",
    wallet,
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, maxUint256],
    client,
  });
}

async function contribute(input: {
  run: RunRow;
  ordinal: number;
  actorLabel: "player-a" | "player-b";
  wallet: WalletClient;
  amountUsd: number;
  tickerIndex: number;
  round: Address;
  roundId: bigint;
  manifest: DeploymentManifest;
  client: ReturnType<typeof publicClientFor>;
}) {
  const config = await input.client.readContract({
    address: input.round,
    abi: lastBellV4Abi,
    functionName: "tickerConfigs",
    args: [BigInt(input.tickerIndex)],
  });
  const amount = parseUnits(String(input.amountUsd), 6);
  const output = await input.client.readContract({
    address: input.manifest.contracts.swapAdapter!,
    abi: stockSwapAdapterAbi,
    functionName: "quoteUsdgForStock",
    args: [config[2], amount],
  });
  const block = await input.client.getBlock({ blockTag: "pending" });
  await ensureApproval(
    input.run,
    input.wallet,
    input.manifest.contracts.paymentToken,
    input.manifest.contracts.paymentRouter,
    amount,
    input.client,
    `approve:${input.actorLabel}:usdg`,
  );
  await sendAction({
    run: input.run,
    key: `round:${input.ordinal}:contribution:${input.actorLabel}`,
    type: "contribution",
    wallet: input.wallet,
    address: input.round,
    abi: lastBellV4Abi,
    functionName: "claimBell",
    args: [
      input.tickerIndex,
      amount,
      (output * 9_900n) / 10_000n,
      block.timestamp + 30n,
      255,
    ],
    roundId: input.roundId,
    roundAddress: input.round,
    tickerIndex: input.tickerIndex,
    amount,
    client: input.client,
  });
}

async function assertCurrentHolderRejected(input: {
  run: RunRow;
  ordinal: number;
  wallet: WalletClient;
  round: Address;
  manifest: DeploymentManifest;
  client: ReturnType<typeof publicClientFor>;
}) {
  const key = `round:${input.ordinal}:current-holder-rejection`;
  const prior = await pool.query(
    "SELECT 1 FROM v4_launch_rehearsal_actions WHERE run_id=$1 AND idempotency_key=$2",
    [input.run.id, key],
  );
  if (prior.rowCount) return;
  const config = await input.client.readContract({
    address: input.round,
    abi: lastBellV4Abi,
    functionName: "tickerConfigs",
    args: [0n],
  });
  const amount = parseUnits("1", 6);
  const output = await input.client.readContract({
    address: input.manifest.contracts.swapAdapter!,
    abi: stockSwapAdapterAbi,
    functionName: "quoteUsdgForStock",
    args: [config[2], amount],
  });
  const block = await input.client.getBlock({ blockTag: "pending" });
  let rejected = false;
  try {
    await input.client.simulateContract({
      account: input.wallet.account!,
      address: input.round,
      abi: lastBellV4Abi,
      functionName: "claimBell",
      args: [
        0,
        amount,
        (output * 9_900n) / 10_000n,
        block.timestamp + 30n,
        255,
      ],
    });
  } catch {
    rejected = true;
  }
  if (!rejected)
    throw new Error(
      "Current-holder self-call simulation unexpectedly succeeded.",
    );
  await pool.query(
    `INSERT INTO v4_launch_rehearsal_actions(run_id,idempotency_key,action_type,
       actor_address,round_address,state,details)
     VALUES($1,$2,'current-holder-rejection',$3,$4,'expected-revert',$5)`,
    [
      input.run.id,
      key,
      input.wallet.account!.address,
      input.round,
      JSON.stringify({ atomic: true }),
    ],
  );
}

async function reconcileSettledRound(run: RunRow, roundId: bigint) {
  const allocation = await pool.query<{
    accounted_amount: string;
    holder_amount: string;
    winning_stock_amount: string;
    lifetime_amount: string;
    seed_amount: string;
    protocol_amount: string;
  }>(
    `SELECT accounted_amount::text,holder_amount::text,
            winning_stock_amount::text,lifetime_amount::text,
            seed_amount::text,protocol_amount::text
     FROM stock_pot_allocations WHERE deployment_key=$1 AND round_id=$2`,
    [run.deployment_key, roundId.toString()],
  );
  const contributions = await pool.query<{ players: string; calls: string }>(
    `SELECT count(DISTINCT lower(player_address))::text AS players,
            count(*)::text AS calls
     FROM stock_pot_contributions
     WHERE deployment_key=$1 AND round_id=$2 AND canonical`,
    [run.deployment_key, roundId.toString()],
  );
  const exact =
    allocation.rows.length === 4 &&
    allocation.rows.every(
      (row) =>
        BigInt(row.accounted_amount) ===
        BigInt(row.holder_amount) +
          BigInt(row.winning_stock_amount) +
          BigInt(row.lifetime_amount) +
          BigInt(row.seed_amount) +
          BigInt(row.protocol_amount),
    );
  const twoPlayers = Number(contributions.rows[0]?.players ?? 0) === 2;
  await pool.query(
    `INSERT INTO v4_launch_rehearsal_assertions(run_id,round_id,assertion,passed,details)
     VALUES($1,$2,'basket-and-player-reconciliation',$3,$4)
     ON CONFLICT(run_id,round_id,assertion) DO UPDATE SET
       passed=excluded.passed,details=excluded.details,checked_at=now()`,
    [
      run.id,
      roundId.toString(),
      exact && twoPlayers,
      JSON.stringify({
        allocationRows: allocation.rows.length,
        ...contributions.rows[0],
      }),
    ],
  );
  if (!exact || !twoPlayers) {
    throw new Error(`Round ${roundId} failed exact reconciliation.`);
  }
}

async function claimPlayerRewards(input: {
  run: RunRow;
  round: Address;
  roundId: bigint;
  player: Address;
  wallet: WalletClient;
  label: "player-a" | "player-b";
  manifest: DeploymentManifest;
  client: ReturnType<typeof publicClientFor>;
}) {
  const [holder, winningTicker, holderClaimed, winningClaimed, configs] =
    await Promise.all([
      input.client.readContract({
        address: input.round,
        abi: lastBellV4Abi,
        functionName: "holder",
      }),
      input.client.readContract({
        address: input.round,
        abi: lastBellV4Abi,
        functionName: "winningTicker",
      }),
      input.client.readContract({
        address: input.round,
        abi: lastBellV4Abi,
        functionName: "holderRewardClaimed",
        args: [input.player],
      }),
      input.client.readContract({
        address: input.round,
        abi: lastBellV4Abi,
        functionName: "winningRewardClaimed",
        args: [input.player],
      }),
      Promise.all(
        [0n, 1n, 2n, 3n].map((index) =>
          input.client.readContract({
            address: input.round,
            abi: lastBellV4Abi,
            functionName: "tickerConfigs",
            args: [index],
          }),
        ),
      ),
    ]);
  const winningPoints = await input.client.readContract({
    address: input.round,
    abi: lastBellV4Abi,
    functionName: "playerTickerPoints",
    args: [input.player, winningTicker],
  });
  const tokens = configs.map((config) => config[2]) as Address[];
  const lifetimeClaimable = await Promise.all(
    tokens.map((token) =>
      input.client.readContract({
        address: input.manifest.contracts.lifetimePointsVault!,
        abi: lifetimePointsVaultAbi,
        functionName: "claimable",
        args: [input.player, token],
      }),
    ),
  );
  const holderRounds =
    !holderClaimed && getAddress(holder) === getAddress(input.player)
      ? [input.round]
      : [];
  const winningRounds =
    !winningClaimed && winningPoints > 0n ? [input.round] : [];
  const lifetimeTokens = tokens.filter(
    (_, index) => lifetimeClaimable[index] > 0n,
  );
  if (!holderRounds.length && !winningRounds.length && !lifetimeTokens.length)
    return;
  await sendAction({
    run: input.run,
    key: `round:${input.roundId}:reward:${input.label}`,
    type: "reward-claim",
    wallet: input.wallet,
    address: input.manifest.contracts.rewardRouter!,
    abi: rewardRouterV4Abi,
    functionName: "claimAll",
    args: [input.player, holderRounds, winningRounds, [], lifetimeTokens],
    roundId: input.roundId,
    roundAddress: input.round,
    details: {
      holder: holderRounds.length === 1,
      winningStock: winningRounds.length === 1,
      lifetimeTokens,
    },
    client: input.client,
  });
}

async function convertProtocolBasket(input: {
  run: RunRow;
  round: Address;
  roundId: bigint;
  wallet: WalletClient;
  manifest: DeploymentManifest;
  client: ReturnType<typeof publicClientFor>;
}) {
  const key = `round:${input.roundId}:protocol-claim`;
  const stored = await pool.query<{
    details: { amounts?: string[]; tokens?: Address[] };
  }>(
    `SELECT details FROM v4_launch_rehearsal_actions WHERE run_id=$1 AND idempotency_key=$2`,
    [input.run.id, key],
  );
  let amounts = stored.rows[0]?.details.amounts?.map(BigInt);
  let tokens = stored.rows[0]?.details.tokens;
  if (!amounts || !tokens) {
    const configs = await Promise.all(
      [0n, 1n, 2n, 3n].map((index) =>
        input.client.readContract({
          address: input.round,
          abi: lastBellV4Abi,
          functionName: "tickerConfigs",
          args: [index],
        }),
      ),
    );
    tokens = configs.map((config) => config[2]) as Address[];
    amounts = await Promise.all(
      [0n, 1n, 2n, 3n].map((index) =>
        input.client.readContract({
          address: input.round,
          abi: lastBellV4Abi,
          functionName: "protocolPool",
          args: [index],
        }),
      ),
    );
  }
  if (amounts.every((amount) => amount === 0n)) return;
  await sendAction({
    run: input.run,
    key,
    type: "protocol-claim",
    wallet: input.wallet,
    address: input.round,
    abi: lastBellV4Abi,
    functionName: "claimProtocolBasket",
    args: [input.wallet.account!.address],
    roundId: input.roundId,
    roundAddress: input.round,
    details: { amounts: amounts.map(String), tokens },
    client: input.client,
  });
  for (let index = 0; index < tokens.length; index += 1) {
    const amount = amounts[index];
    if (amount === 0n) continue;
    await ensureApproval(
      input.run,
      input.wallet,
      tokens[index],
      input.manifest.contracts.swapAdapter!,
      amount,
      input.client,
      `round:${input.roundId}:protocol-approve:${index}`,
    );
    const output = await input.client.readContract({
      address: input.manifest.contracts.swapAdapter!,
      abi: stockSwapAdapterAbi,
      functionName: "quoteStockForUsdg",
      args: [tokens[index], amount],
    });
    const block = await input.client.getBlock({ blockTag: "pending" });
    await sendAction({
      run: input.run,
      key: `round:${input.roundId}:protocol-convert:${index}`,
      type: "protocol-conversion",
      wallet: input.wallet,
      address: input.manifest.contracts.swapAdapter!,
      abi: adapterAdminAbi,
      functionName: "swapStockForUsdg",
      args: [
        tokens[index],
        amount,
        (output * 9_900n) / 10_000n,
        block.timestamp + 30n,
        input.wallet.account!.address,
      ],
      roundId: input.roundId,
      roundAddress: input.round,
      details: {
        token: tokens[index],
        stockAmount: amount.toString(),
        expectedUsdg: output.toString(),
      },
      client: input.client,
    });
  }
}

async function processSettledRewards(
  run: RunRow,
  roundId: bigint,
  ctx: Awaited<ReturnType<typeof context>>,
) {
  const indexed = await pool.query<{ contract_address: Address }>(
    `SELECT contract_address FROM rounds
     WHERE deployment_key=$1 AND round_id=$2 AND state='settled'`,
    [run.deployment_key, roundId.toString()],
  );
  const round = indexed.rows[0]?.contract_address;
  if (!round)
    throw new Error(`Settled round ${roundId} is missing from the indexer.`);
  await claimPlayerRewards({
    run,
    round,
    roundId,
    player: ctx.playerA,
    wallet: ctx.playerAWallet,
    label: "player-a",
    manifest: ctx.manifest,
    client: ctx.client,
  });
  await claimPlayerRewards({
    run,
    round,
    roundId,
    player: ctx.playerB,
    wallet: ctx.playerBWallet,
    label: "player-b",
    manifest: ctx.manifest,
    client: ctx.client,
  });
  await convertProtocolBasket({
    run,
    round,
    roundId,
    wallet: ctx.operatorWallet,
    manifest: ctx.manifest,
    client: ctx.client,
  });
}

async function ensureServiceRestartCheckpoints(
  run: RunRow,
  settledRounds: number,
  chainId: number,
) {
  for (const checkpoint of restartCheckpointsForSettledRounds(settledRounds)) {
    const key = `service-restart:${checkpoint.kind}:after-${checkpoint.afterSettledRounds}`;
    const existing = await pool.query<{ id: string; state: string }>(
      `SELECT id::text,state FROM v4_launch_rehearsal_actions
       WHERE run_id=$1 AND idempotency_key=$2`,
      [run.id, key],
    );
    if (existing.rows[0]?.state === "confirmed") continue;

    const helper = await configuredRestartHelper();
    const action =
      existing.rows[0] ??
      (
        await pool.query<{ id: string; state: string }>(
          `INSERT INTO v4_launch_rehearsal_actions(
             run_id,idempotency_key,action_type,state,details)
           VALUES($1,$2,'service-restart','pending',$3)
           RETURNING id::text,state`,
          [
            run.id,
            key,
            JSON.stringify({
              service: checkpoint.service,
              afterSettledRounds: checkpoint.afterSettledRounds,
            }),
          ],
        )
      ).rows[0];
    const restartedAt = new Date();
    await execFile("sudo", ["-n", helper, checkpoint.kind], {
      timeout: 30_000,
    });
    const deadline = Date.now() + 60_000;
    let heartbeat: { status: string; observed_at: Date } | undefined;
    while (Date.now() < deadline) {
      heartbeat = (
        await pool.query<{ status: string; observed_at: Date }>(
          `SELECT status,observed_at FROM service_heartbeats
           WHERE service=$1 AND chain_id=$2 AND observed_at>$3`,
          [checkpoint.service, chainId, restartedAt],
        )
      ).rows[0];
      if (heartbeat && heartbeat.status !== "error") break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    if (!heartbeat || heartbeat.status === "error") {
      await pool.query(
        `UPDATE v4_launch_rehearsal_actions SET state='failed',last_error=$2,
           updated_at=now() WHERE id=$1`,
        [action.id, `${checkpoint.service} did not recover within 60 seconds`],
      );
      throw new Error(`${checkpoint.service} restart did not recover.`);
    }
    await pool.query(
      `UPDATE v4_launch_rehearsal_actions SET state='confirmed',details=details||$2::jsonb,
         updated_at=now() WHERE id=$1`,
      [
        action.id,
        JSON.stringify({
          recoveredAt: heartbeat.observed_at.toISOString(),
          recoveredStatus: heartbeat.status,
        }),
      ],
    );
  }
}

async function assertFinalRehearsalState(
  run: RunRow,
  ctx: Awaited<ReturnType<typeof context>>,
) {
  const contributions = await pool.query<{
    round_id: string;
    calls: string;
    actors: string;
  }>(
    `SELECT round_id::text,count(*)::text AS calls,
       count(DISTINCT lower(actor_address))::text AS actors
     FROM v4_launch_rehearsal_actions
     WHERE run_id=$1 AND action_type='contribution' AND state='confirmed'
     GROUP BY round_id ORDER BY round_id`,
    [run.id],
  );
  const twoWalletsPerRound =
    contributions.rows.length === DEVNET_REHEARSAL_ROUNDS &&
    contributions.rows.every(
      (row) => Number(row.calls) === 2 && Number(row.actors) === 2,
    );
  const failedAssertions = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM v4_launch_rehearsal_assertions
     WHERE run_id=$1 AND NOT passed`,
    [run.id],
  );
  const active = await ctx.client.readContract({
    address: ctx.manifest.contracts.manager,
    abi: roundManagerV4Abi,
    functionName: "activeRound",
  });
  if (active === zeroAddress) throw new Error("Round eleven is not prepared.");
  const [roundId, startedAt, acceptedClaims] = await Promise.all([
    ctx.client.readContract({
      address: active,
      abi: lastBellV4Abi,
      functionName: "roundId",
    }),
    ctx.client.readContract({
      address: active,
      abi: lastBellV4Abi,
      functionName: "startedAt",
    }),
    ctx.client.readContract({
      address: active,
      abi: lastBellV4Abi,
      functionName: "acceptedClaims",
    }),
  ]);
  const roundElevenUnstarted =
    roundId ===
      BigInt(run.initial_round_id) + BigInt(DEVNET_REHEARSAL_ROUNDS) &&
    startedAt === 0n &&
    acceptedClaims === 0n;
  const passed =
    twoWalletsPerRound &&
    Number(failedAssertions.rows[0]?.count ?? 0) === 0 &&
    roundElevenUnstarted;
  const finalRoundId =
    BigInt(run.initial_round_id) + BigInt(DEVNET_REHEARSAL_ROUNDS - 1);
  await pool.query(
    `INSERT INTO v4_launch_rehearsal_assertions(run_id,round_id,assertion,passed,details)
     VALUES($1,$2,'one-hour-final-state',$3,$4)
     ON CONFLICT(run_id,round_id,assertion) DO UPDATE SET
       passed=excluded.passed,details=excluded.details,checked_at=now()`,
    [
      run.id,
      finalRoundId.toString(),
      passed,
      JSON.stringify({
        contributionRounds: contributions.rows,
        failedAssertions: Number(failedAssertions.rows[0]?.count ?? 0),
        activeRound: roundId.toString(),
        activeRoundStartedAt: startedAt.toString(),
        activeRoundAcceptedClaims: acceptedClaims.toString(),
      }),
    ],
  );
  if (!passed)
    throw new Error("Final one-hour rehearsal state did not reconcile.");
}

async function processRunOnce() {
  const ctx = await context();
  const run = await currentRun(ctx.deploymentKey);
  if (!run || !["scheduled", "running"].includes(run.state)) {
    throw new Error("No runnable devnet launch rehearsal exists.");
  }
  const lock = await pool.connect();
  const acquired = await lock.query<{ acquired: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
    [`v4-launch-rehearsal:${run.id}`],
  );
  if (!acquired.rows[0]?.acquired)
    throw new Error("Another rehearsal runner owns the lock.");
  try {
    await pool.query(
      "UPDATE v4_launch_rehearsal_runs SET state='running',updated_at=now() WHERE id=$1",
      [run.id],
    );
    const pending = await pool.query<ActionRow>(
      `SELECT id::text,state,transaction_hash,signed_transaction,nonce::text
       FROM v4_launch_rehearsal_actions WHERE run_id=$1 AND state='broadcast' ORDER BY id`,
      [run.id],
    );
    for (const action of pending.rows)
      await reconcileBroadcast(action, ctx.client);

    const settled = await pool.query<{ round_id: string }>(
      `SELECT round_id::text FROM rounds
       WHERE deployment_key=$1 AND state='settled'
         AND round_id >= $2 AND round_id < $2 + 10 ORDER BY round_id`,
      [run.deployment_key, run.initial_round_id],
    );
    for (const row of settled.rows) {
      const roundId = BigInt(row.round_id);
      await reconcileSettledRound(run, roundId);
      await processSettledRewards(run, roundId, ctx);
    }
    const spent = await pool.query<{ spent: string }>(
      `SELECT coalesce(sum(usdg_amount),0)::text AS spent
       FROM v4_launch_rehearsal_actions
       WHERE run_id=$1 AND action_type='contribution' AND state='confirmed'`,
      [run.id],
    );
    const settledRounds = settled.rows.length;
    const spentRaw = BigInt(spent.rows[0]?.spent ?? 0);
    await pool.query(
      `UPDATE v4_launch_rehearsal_runs SET settled_rounds=$2,spent_usdg=$3,updated_at=now() WHERE id=$1`,
      [run.id, settledRounds, spentRaw.toString()],
    );
    await ensureServiceRestartCheckpoints(
      run,
      settledRounds,
      ctx.manifest.chainId,
    );
    assertRehearsalScope({
      chainId: ctx.manifest.chainId,
      settledRounds,
      spentRaw,
      startedAtMs: run.started_at.getTime(),
      nowMs:
        settledRounds === DEVNET_REHEARSAL_ROUNDS
          ? run.ends_at.getTime()
          : Date.now(),
    });
    if (settledRounds === DEVNET_REHEARSAL_ROUNDS) {
      if (Date.now() >= run.ends_at.getTime()) {
        await assertFinalRehearsalState(run, ctx);
        await pool.query(
          "UPDATE v4_launch_rehearsal_runs SET state='completed',completed_at=now(),updated_at=now() WHERE id=$1",
          [run.id],
        );
      }
      return;
    }
    const schedule = rehearsalRoundSchedule(run.started_at.getTime())[
      settledRounds
    ];
    if (Date.now() < schedule.plannedAtMs) return;
    const round = await ctx.client.readContract({
      address: ctx.manifest.contracts.manager,
      abi: roundManagerV4Abi,
      functionName: "activeRound",
    });
    if (round === zeroAddress) throw new Error("No active round is prepared.");
    const roundId = await ctx.client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "roundId",
    });
    const expectedRoundId =
      BigInt(run.initial_round_id) + BigInt(settledRounds);
    if (roundId !== expectedRoundId)
      throw new Error(
        `Unexpected active round ${roundId}; expected ${expectedRoundId}.`,
      );
    const pair = REHEARSAL_CONTRIBUTIONS[settledRounds];
    await contribute({
      run,
      ordinal: settledRounds + 1,
      actorLabel: "player-a",
      wallet: ctx.playerAWallet,
      amountUsd: pair.deployerUsd,
      tickerIndex: settledRounds % 4,
      round,
      roundId,
      manifest: ctx.manifest,
      client: ctx.client,
    });
    await assertCurrentHolderRejected({
      run,
      ordinal: settledRounds + 1,
      wallet: ctx.playerAWallet,
      round,
      manifest: ctx.manifest,
      client: ctx.client,
    });
    await contribute({
      run,
      ordinal: settledRounds + 1,
      actorLabel: "player-b",
      wallet: ctx.playerBWallet,
      amountUsd: pair.playerUsd,
      tickerIndex: (settledRounds + 1) % 4,
      round,
      roundId,
      manifest: ctx.manifest,
      client: ctx.client,
    });
  } finally {
    await lock
      .query("SELECT pg_advisory_unlock(hashtext($1))", [
        `v4-launch-rehearsal:${run.id}`,
      ])
      .catch(() => undefined);
    lock.release();
  }
}

async function start() {
  const ctx = await context();
  await assertRestartAuthority();
  if (await currentRun(ctx.deploymentKey))
    throw new Error("A rehearsal already exists for this deployment.");
  const active = await ctx.client.readContract({
    address: ctx.manifest.contracts.manager,
    abi: roundManagerV4Abi,
    functionName: "activeRound",
  });
  if (active === zeroAddress)
    throw new Error("No unstarted active round exists.");
  const [initialRoundId, startedAt, acceptedClaims] = await Promise.all([
    ctx.client.readContract({
      address: active,
      abi: lastBellV4Abi,
      functionName: "roundId",
    }),
    ctx.client.readContract({
      address: active,
      abi: lastBellV4Abi,
      functionName: "startedAt",
    }),
    ctx.client.readContract({
      address: active,
      abi: lastBellV4Abi,
      functionName: "acceptedClaims",
    }),
  ]);
  if (startedAt !== 0n || acceptedClaims !== 0n) {
    throw new Error("Rehearsal must begin from an unstarted zero-call round.");
  }
  const now = Date.now();
  const id = `devnet-rehearsal:${ctx.deploymentKey}:${new Date(now).toISOString()}`;
  await pool.query(
    `INSERT INTO v4_launch_rehearsal_runs(
       id,deployment_key,source_commit,manifest_hash,
       operator_address,player_a_address,player_b_address,state,target_rounds,duration_minutes,
       usdg_budget,initial_round_id,started_at,ends_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,'scheduled',10,60,$8,$9,$10,$11)`,
    [
      id,
      ctx.deploymentKey,
      ctx.manifest.sourceCommit,
      ctx.manifestHash,
      ctx.operator,
      ctx.playerA,
      ctx.playerB,
      DEVNET_REHEARSAL_BUDGET_RAW.toString(),
      initialRoundId.toString(),
      new Date(now),
      new Date(now + DEVNET_REHEARSAL_DURATION_MS),
    ],
  );
  process.stdout.write(
    `${JSON.stringify({ id, initialRoundId: initialRoundId.toString(), endsAt: new Date(now + DEVNET_REHEARSAL_DURATION_MS).toISOString() }, null, 2)}\n`,
  );
}

async function status() {
  const manifest = await loadManifest();
  const run = await currentRun(deploymentKeyFor(manifest));
  if (!run) throw new Error("No devnet launch rehearsal has been recorded.");
  const actions = await pool.query<{
    state: string;
    action_type: string;
    count: string;
  }>(
    `SELECT state,action_type,count(*)::text FROM v4_launch_rehearsal_actions
     WHERE run_id=$1 GROUP BY state,action_type ORDER BY action_type,state`,
    [run.id],
  );
  const assertions = await pool.query<{ passed: boolean; count: string }>(
    `SELECT passed,count(*)::text FROM v4_launch_rehearsal_assertions
     WHERE run_id=$1 GROUP BY passed ORDER BY passed`,
    [run.id],
  );
  process.stdout.write(
    `${JSON.stringify({ run, actions: actions.rows, assertions: assertions.rows }, null, 2)}\n`,
  );
}

async function report() {
  const manifest = await loadManifest();
  const run = await currentRun(deploymentKeyFor(manifest));
  if (!run) throw new Error("No devnet launch rehearsal has been recorded.");
  const [actions, assertions] = await Promise.all([
    pool.query(
      "SELECT * FROM v4_launch_rehearsal_actions WHERE run_id=$1 ORDER BY id",
      [run.id],
    ),
    pool.query(
      "SELECT * FROM v4_launch_rehearsal_assertions WHERE run_id=$1 ORDER BY round_id,assertion",
      [run.id],
    ),
  ]);
  const evidence = {
    label:
      "INTERNALLY REVIEWED · NO INDEPENDENT AUDIT · EXTERNAL WALLET COMPATIBILITY UNVERIFIED",
    generatedAt: new Date().toISOString(),
    run,
    actions: actions.rows.map((row) => ({
      ...row,
      signed_transaction: row.signed_transaction
        ? "CLEARED_AFTER_CONFIRMATION"
        : null,
    })),
    assertions: assertions.rows,
  };
  const output =
    process.env.KEYGAME_DEVNET_REHEARSAL_REPORT ??
    path.join(
      "artifacts",
      "v4-launch-rehearsal",
      `${run.id.replaceAll(":", "-")}.json`,
    );
  await mkdir(path.dirname(output), { recursive: true });
  const json = `${JSON.stringify(evidence, null, 2)}\n`;
  const digest = sha256(json);
  await writeFile(output, json, "utf8");
  await writeFile(
    `${output}.sha256`,
    `${digest}  ${path.basename(output)}\n`,
    "utf8",
  );
  await pool.query(
    "UPDATE v4_launch_rehearsal_runs SET report_sha256=$2,updated_at=now() WHERE id=$1",
    [run.id, digest],
  );
  process.stdout.write(json);
}

const command = process.argv[2];
try {
  if (command === "start") await start();
  else if (command === "run") await processRunOnce();
  else if (command === "status" || command === "reconcile") await status();
  else if (command === "report") await report();
  else
    throw new Error(
      "Usage: v4-launch-rehearsal.ts <start|run|status|reconcile|report>",
    );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
