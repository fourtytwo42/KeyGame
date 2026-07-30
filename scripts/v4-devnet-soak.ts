import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  maxUint256,
  parseAbi,
  publicActions,
  stringToHex,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import {
  lastBellV4Abi,
  lifetimePointsVaultAbi,
  roundManagerV4Abi,
  stockSwapAdapterAbi,
} from "../src/lib/web3/last-bell-abi";
import { localDevnet } from "../src/lib/web3/chains";
import { deploymentKeyFor, loadManifest, pool } from "../services/common";

const command = process.argv[2] ?? "status";
process.env.KEYGAME_CHAIN_ID ??= "31337";
const manifest = await loadManifest();
if (
  manifest.chainId !== 31337 ||
  !manifest.mockOnly ||
  manifest.contractVersion !== "last-bell-v4-stock-pot"
) {
  throw new Error("V4 qualification requires mock chain 31337.");
}

type DevnetManifest = typeof manifest & {
  deployer: Address;
  players: Address[];
  stockTokens: Address[];
  sourceCommit: string;
};
const deployment = manifest as DevnetManifest;
if (
  !deployment.deployer ||
  deployment.players.length < 3 ||
  deployment.stockTokens.length !== 4
) {
  throw new Error(
    "The devnet manifest needs an operator, three players, and four stocks.",
  );
}

const deploymentKey = deploymentKeyFor(deployment);
const rpc = deployment.rpc.primary;
const client = createPublicClient({
  chain: localDevnet,
  cacheTime: 0,
  pollingInterval: 50,
  transport: http(rpc),
});
const testClient = createTestClient({
  chain: localDevnet,
  mode: "anvil",
  transport: http(rpc),
}).extend(publicActions);
const manager = deployment.contracts.manager;
const vault = deployment.contracts.lifetimePointsVault as Address;
const adapter = deployment.contracts.swapAdapter as Address;
const paymentToken = deployment.contracts.paymentToken;
const paymentRouter = deployment.contracts.paymentRouter;
const scenarioSeed = Number(process.env.V4_SOAK_SCENARIO_SEED || 4663);
const runProfile =
  process.env.V4_SOAK_PROFILE === "endurance"
    ? "v4-endurance"
    : "v4-accelerated";
const targetSettled = Number(
  process.env.V4_SOAK_TARGET_ROUNDS ||
    (runProfile === "v4-endurance" ? 24 : 100),
);
const targetCancelled = Number(
  process.env.V4_SOAK_CANCEL_ROUNDS || (runProfile === "v4-endurance" ? 0 : 10),
);
const enduranceIntervalMs = Number(
  process.env.V4_SOAK_ENDURANCE_INTERVAL_MS || 300_000,
);
const reportDirectory = path.join(process.cwd(), "artifacts", "qualification");

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
]);
const mockAdapterAbi = parseAbi([
  "function setFailSwaps(bool)",
  "function failSwaps() view returns (bool)",
]);

function wallet(account: Address) {
  return createWalletClient({
    account,
    chain: localDevnet,
    pollingInterval: 50,
    transport: http(rpc),
  });
}

async function activeRound() {
  const round = await client.readContract({
    address: manager,
    abi: roundManagerV4Abi,
    functionName: "activeRound",
  });
  if (round === zeroAddress) throw new Error("No active v4 round.");
  return round;
}

async function ensureDeploymentRow() {
  await pool.query(
    `INSERT INTO deployments(
       deployment_key,chain_id,environment,deployment_block,source_commit,manifest)
     VALUES($1,31337,'anvil',$2,$3,$4)
     ON CONFLICT(deployment_key) DO UPDATE SET
       source_commit=excluded.source_commit,manifest=excluded.manifest,
       updated_at=now()`,
    [
      deploymentKey,
      deployment.deploymentBlock,
      deployment.sourceCommit,
      JSON.stringify(deployment),
    ],
  );
}

async function transaction(
  runId: string,
  actionId: string | null,
  key: string,
  signer: Address,
  send: () => Promise<Hex>,
) {
  const existing = await pool.query<{
    transaction_hash: Hex | null;
    state: string;
  }>(
    `SELECT transaction_hash,state FROM soak_transactions
     WHERE run_id=$1 AND idempotency_key=$2`,
    [runId, key],
  );
  if (existing.rows[0]?.transaction_hash) {
    const receipt = await client.getTransactionReceipt({
      hash: existing.rows[0].transaction_hash,
    });
    if (receipt.status !== "success") throw new Error(`${key} reverted`);
    return existing.rows[0].transaction_hash;
  }
  const nonce = await client.getTransactionCount({
    address: signer,
    blockTag: "pending",
  });
  await pool.query(
    `INSERT INTO soak_transactions(
       run_id,action_id,idempotency_key,signer_address,nonce,state)
     VALUES($1,$2,$3,$4,$5,'planned')
     ON CONFLICT(run_id,idempotency_key) DO NOTHING`,
    [runId, actionId, key, signer, nonce],
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

async function ensurePlayers(runId: string) {
  for (const player of deployment.players.slice(0, 4)) {
    const balance = await client.readContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [player],
    });
    if (balance < 1_000_000_000_000_000n) {
      await transaction(
        runId,
        null,
        `fund:${player}`,
        deployment.deployer,
        () =>
          wallet(deployment.deployer).writeContract({
            address: paymentToken,
            abi: erc20Abi,
            functionName: "mint",
            args: [player, 1_000_000_000_000_000_000n],
          }),
      );
    }
    const allowance = await client.readContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [player, paymentRouter],
    });
    if (allowance !== maxUint256) {
      await transaction(runId, null, `approve:${player}`, player, () =>
        wallet(player).writeContract({
          address: paymentToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [paymentRouter, maxUint256],
        }),
      );
    }
  }
}

async function contribute(
  runId: string,
  actionId: string,
  round: Address,
  player: Address,
  ticker: number,
  amount: bigint,
  key: string,
) {
  const token = deployment.stockTokens[ticker];
  const output = await client.readContract({
    address: adapter,
    abi: stockSwapAdapterAbi,
    functionName: "quoteUsdgForStock",
    args: [token, amount],
  });
  const block = await client.getBlock();
  return transaction(runId, actionId, key, player, () =>
    wallet(player).writeContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "claimBell",
      args: [ticker, amount, output, block.timestamp + 60n, 255],
      gas: 1_000_000n,
    }),
  );
}

async function expectRejectedWithoutStateChange(
  round: Address,
  player: Address,
  args: readonly [number, bigint, bigint, bigint, number],
) {
  const [holderBefore, paidBefore] = await Promise.all([
    client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "holder",
    }),
    client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "paid",
      args: [player],
    }),
  ]);
  let rejected = false;
  try {
    const hash = await wallet(player).writeContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "claimBell",
      args,
      gas: 1_000_000n,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    rejected = receipt.status === "reverted";
  } catch {
    rejected = true;
  }
  const [holderAfter, paidAfter] = await Promise.all([
    client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "holder",
    }),
    client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "paid",
      args: [player],
    }),
  ]);
  if (
    !rejected ||
    holderAfter.toLowerCase() !== holderBefore.toLowerCase() ||
    paidAfter !== paidBefore
  ) {
    throw new Error("Rejected contribution changed canonical state.");
  }
}

async function exerciseAtomicFailures(round: Address, ordinal: number) {
  if (ordinal > 4) return;
  const player = deployment.players[(ordinal + 1) % 3];
  const ticker = ordinal % 4;
  const token = deployment.stockTokens[ticker];
  const amount = 10_000_000n;
  const output = await client.readContract({
    address: adapter,
    abi: stockSwapAdapterAbi,
    functionName: "quoteUsdgForStock",
    args: [token, amount],
  });
  const block = await client.getBlock();

  if (ordinal === 1) {
    await wallet(deployment.deployer).writeContract({
      address: adapter,
      abi: mockAdapterAbi,
      functionName: "setFailSwaps",
      args: [true],
    });
    await expectRejectedWithoutStateChange(round, player, [
      ticker,
      amount,
      output,
      block.timestamp + 60n,
      255,
    ]);
    await wallet(deployment.deployer).writeContract({
      address: adapter,
      abi: mockAdapterAbi,
      functionName: "setFailSwaps",
      args: [false],
    });
  } else if (ordinal === 2) {
    await expectRejectedWithoutStateChange(round, player, [
      ticker,
      amount,
      output,
      block.timestamp - 1n,
      255,
    ]);
  } else if (ordinal === 3) {
    await expectRejectedWithoutStateChange(round, player, [
      ticker,
      amount,
      output + 1n,
      block.timestamp + 60n,
      255,
    ]);
  } else {
    await wallet(player).writeContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [paymentRouter, 0n],
    });
    await expectRejectedWithoutStateChange(round, player, [
      ticker,
      amount,
      output,
      block.timestamp + 60n,
      255,
    ]);
    await wallet(player).writeContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [paymentRouter, maxUint256],
    });
  }
}

async function finishRoundClock(round: Address, natural: boolean) {
  const deadline = await client.readContract({
    address: round,
    abi: lastBellV4Abi,
    functionName: "deadline",
  });
  const block = await client.getBlock();
  const seconds = Number(deadline - block.timestamp + 1n);
  if (natural) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1, seconds) * 1_000),
    );
    await testClient.mine({ blocks: 1 });
  } else {
    await testClient.increaseTime({ seconds });
    await testClient.mine({ blocks: 1 });
  }
}

async function waitForKeeperRollover(round: Address, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const [phase, active] = await Promise.all([
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "currentPhase",
        }),
        client.readContract({
          address: manager,
          abi: roundManagerV4Abi,
          functionName: "activeRound",
        }),
      ]);
      if (Number(phase) === 4 && active.toLowerCase() !== round.toLowerCase()) {
        return;
      }
    } catch {
      // A scheduled RPC interruption is allowed to clear before polling again.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Keeper did not roll ${round} within ${timeoutMs}ms.`);
}

async function managerCall(
  runId: string,
  actionId: string,
  key: string,
  functionName:
    "finalizeActive" | "cancelActive" | "prepareRound" | "activatePrepared",
  args: readonly unknown[] = [],
) {
  return transaction(runId, actionId, key, deployment.deployer, () =>
    wallet(deployment.deployer).writeContract({
      address: manager,
      abi: roundManagerV4Abi,
      functionName,
      args: args as never,
      gas: 8_000_000n,
    } as never),
  );
}

async function prepareAndActivate(
  runId: string,
  actionId: string,
  previous: Address,
) {
  const latest = await client.readContract({
    address: manager,
    abi: roundManagerV4Abi,
    functionName: "latestRoundId",
  });
  const configs = await Promise.all(
    [0n, 1n, 2n, 3n].map((index) =>
      client.readContract({
        address: previous,
        abi: lastBellV4Abi,
        functionName: "tickerConfigs",
        args: [index],
      }),
    ),
  );
  const nextId = latest + 1n;
  await managerCall(runId, actionId, `prepare:${nextId}`, "prepareRound", [
    {
      roundId: nextId,
      startDuration: 45n,
      extensionDuration: 2n,
      rugDuration: 10n,
      hardCapDuration: 180n,
      heatTarget: 4_000_000_000n,
      producerPassRequired: false,
    },
    configs.map((config) => ({
      symbol: config[0],
      assetId: config[1],
      token: config[2],
    })),
  ]);
  await managerCall(runId, actionId, `activate:${nextId}`, "activatePrepared", [
    [0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n],
    (1n << 64n) - 1n,
  ]);
}

async function reconcileRound(
  runId: string,
  round: Address,
  cancelled: boolean,
) {
  const roundId = await client.readContract({
    address: round,
    abi: lastBellV4Abi,
    functionName: "roundId",
  });
  let failures = 0;
  for (let ticker = 0; ticker < 4; ticker += 1) {
    const [config, accounted, holder, winning, lifetime, protocol] =
      await Promise.all([
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "tickerConfigs",
          args: [BigInt(ticker)],
        }),
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "accountedStock",
          args: [BigInt(ticker)],
        }),
        cancelled
          ? Promise.resolve(0n)
          : client.readContract({
              address: round,
              abi: lastBellV4Abi,
              functionName: "holderPool",
              args: [BigInt(ticker)],
            }),
        cancelled
          ? Promise.resolve(0n)
          : client.readContract({
              address: round,
              abi: lastBellV4Abi,
              functionName: "winningStockPool",
              args: [BigInt(ticker)],
            }),
        cancelled
          ? Promise.resolve(0n)
          : client.readContract({
              address: round,
              abi: lastBellV4Abi,
              functionName: "lifetimePool",
              args: [BigInt(ticker)],
            }),
        cancelled
          ? Promise.resolve(0n)
          : client.readContract({
              address: round,
              abi: lastBellV4Abi,
              functionName: "protocolPool",
              args: [BigInt(ticker)],
            }),
      ]);
    // The keeper transfers and clears nextRoundPool before activating the next
    // entry-state round. Reconstruct the immutable 5% allocation from the
    // accounted token balance so reconciliation remains valid after rollover.
    const seed = cancelled ? 0n : (accounted * 500n) / 10_000n;
    const allocated = holder + winning + lifetime + seed + protocol;
    const discrepancy = cancelled ? 0n : accounted - allocated;
    if (discrepancy !== 0n) failures += 1;
    const balance = await client.readContract({
      address: config[2],
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [round],
    });
    await pool.query(
      `INSERT INTO soak_asset_reconciliations(
         run_id,round_contract,round_id,stock_token,ticker_index,
         accounted_raw,holder_raw,winning_stock_raw,lifetime_raw,seed_raw,
         protocol_raw,contract_balance_raw,discrepancy_raw,evidence)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT(run_id,round_contract,stock_token) DO UPDATE SET
         accounted_raw=excluded.accounted_raw,
         contract_balance_raw=excluded.contract_balance_raw,
         discrepancy_raw=excluded.discrepancy_raw,
         checked_at=now()`,
      [
        runId,
        round,
        roundId.toString(),
        config[2],
        ticker,
        accounted.toString(),
        holder.toString(),
        winning.toString(),
        lifetime.toString(),
        seed.toString(),
        protocol.toString(),
        balance.toString(),
        discrepancy.toString(),
        JSON.stringify({ cancelled }),
      ],
    );
  }
  const claimEvents = await client.getContractEvents({
    address: round,
    abi: lastBellV4Abi,
    eventName: "BellClaimed",
    fromBlock: BigInt(deployment.deploymentBlock),
  });
  for (const player of deployment.players.slice(0, 4)) {
    for (let ticker = 0; ticker < 4; ticker += 1) {
      const eventPoints = claimEvents.reduce((total, event) => {
        const args = event.args;
        return args.player?.toLowerCase() === player.toLowerCase() &&
          Number(args.ticker) === ticker
          ? total + (args.points ?? 0n)
          : total;
      }, 0n);
      const [contractPoints, config] = await Promise.all([
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "playerTickerPoints",
          args: [player, ticker],
        }),
        client.readContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "tickerConfigs",
          args: [BigInt(ticker)],
        }),
      ]);
      const activeAfter = cancelled
        ? 0n
        : await client.readContract({
            address: vault,
            abi: lifetimePointsVaultAbi,
            functionName: "tickerPointsOf",
            args: [player, config[1]],
          });
      const pointDiscrepancy = contractPoints - eventPoints;
      if (pointDiscrepancy !== 0n) failures += 1;
      await pool.query(
        `INSERT INTO soak_point_reconciliations(
           run_id,round_contract,round_id,player_address,ticker_index,
           contribution_points,contract_points,active_after,discrepancy_raw)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT(
           run_id,round_contract,player_address,ticker_index
         ) DO UPDATE SET
           contribution_points=excluded.contribution_points,
           contract_points=excluded.contract_points,
           active_after=excluded.active_after,
           discrepancy_raw=excluded.discrepancy_raw,
           checked_at=now()`,
        [
          runId,
          round,
          roundId.toString(),
          player,
          ticker,
          eventPoints.toString(),
          contractPoints.toString(),
          activeAfter.toString(),
          pointDiscrepancy.toString(),
        ],
      );
    }
  }
  await pool.query(
    `INSERT INTO soak_assertions(
       run_id,assertion_key,scope,passed,expected,actual)
     VALUES($1,'v4-basket-conservation',$2,$3,$4,$5)`,
    [
      runId,
      round,
      failures === 0,
      JSON.stringify({ discrepancies: 0 }),
      JSON.stringify({ discrepancies: failures }),
    ],
  );
  return failures;
}

async function claimSettledRewards(
  runId: string,
  actionId: string,
  round: Address,
  ordinal: number,
) {
  const [holder, winner] = await Promise.all([
    client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "holder",
    }),
    client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "winningTicker",
    }),
  ]);
  await transaction(runId, actionId, `holder:${round}`, holder, () =>
    wallet(holder).writeContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "claimHolderRewardFor",
      args: [holder],
    }),
  );
  for (const player of deployment.players.slice(0, 4)) {
    const points = await client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "playerTickerPoints",
      args: [player, winner],
    });
    if (points === 0n) continue;
    await transaction(
      runId,
      actionId,
      `winner:${round}:${player}`,
      player,
      () =>
        wallet(player).writeContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "claimWinningStockRewardFor",
          args: [player],
        }),
    );
  }
  await transaction(
    runId,
    actionId,
    `protocol:${round}`,
    deployment.deployer,
    () =>
      wallet(deployment.deployer).writeContract({
        address: round,
        abi: lastBellV4Abi,
        functionName: "claimProtocolBasket",
        args: [deployment.deployer],
      }),
  );
  if (ordinal % 10 === 0) {
    for (const player of deployment.players.slice(0, 3)) {
      await transaction(
        runId,
        actionId,
        `lifetime:${ordinal}:${player}`,
        player,
        () =>
          wallet(player).writeContract({
            address: vault,
            abi: lifetimePointsVaultAbi,
            functionName: "claimFor",
            args: [player, deployment.stockTokens],
            gas: 1_200_000n,
          }),
      );
    }
  }
}

async function roundForSettledAction(
  runId: string,
  ordinal: number,
): Promise<Address> {
  const existing = await pool.query<{ transaction_hash: Hex }>(
    `SELECT transaction_hash
     FROM soak_transactions
     WHERE run_id=$1 AND idempotency_key=$2
       AND transaction_hash IS NOT NULL
     LIMIT 1`,
    [runId, `round:${ordinal}:call:0`],
  );
  const hash = existing.rows[0]?.transaction_hash;
  if (!hash) return activeRound();
  const persisted = await client.getTransaction({ hash });
  if (!persisted.to) {
    throw new Error(`Persisted round ${ordinal} call has no contract target.`);
  }
  return persisted.to;
}

async function runSettledRound(
  runId: string,
  ordinal: number,
  actionId: string,
  natural = false,
) {
  const round = await roundForSettledAction(runId, ordinal);
  const phase = Number(
    await client.readContract({
      address: round,
      abi: lastBellV4Abi,
      functionName: "currentPhase",
    }),
  );
  if (phase === 4) {
    const discrepancies = await reconcileRound(runId, round, false);
    if (discrepancies) throw new Error(`Round ${ordinal} did not conserve.`);
    await claimSettledRewards(runId, actionId, round, ordinal);
    return;
  }
  if (phase !== 0 && phase !== 1 && phase !== 2) {
    throw new Error(`Round ${round} cannot resume from phase ${phase}.`);
  }
  if (phase === 0) await exerciseAtomicFailures(round, ordinal);
  const amounts = [
    1_000_000n,
    10_000_000n,
    250_000_000n,
    1_000_000_000n,
    5_000_000_000n,
    25_000_000_000n,
  ];
  const callCount = ordinal % 8 === 0 ? 6 : 4;
  for (let index = 0; index < callCount; index += 1) {
    const player = deployment.players[(ordinal + index) % 4];
    const ticker = (ordinal + index * 3) % 4;
    const amount = amounts[(scenarioSeed + ordinal + index) % amounts.length];
    await contribute(
      runId,
      actionId,
      round,
      player,
      ticker,
      amount,
      `round:${ordinal}:call:${index}`,
    );
  }
  await finishRoundClock(round, natural);
  if (natural) {
    await waitForKeeperRollover(round);
  } else {
    await managerCall(
      runId,
      actionId,
      `round:${ordinal}:finalize`,
      "finalizeActive",
    );
  }
  const discrepancies = await reconcileRound(runId, round, false);
  if (discrepancies) throw new Error(`Round ${ordinal} did not conserve.`);
  await claimSettledRewards(runId, actionId, round, ordinal);
  if (!natural) await prepareAndActivate(runId, actionId, round);
}

async function runCancelledRound(
  runId: string,
  ordinal: number,
  actionId: string,
) {
  const round = await activeRound();
  const players = deployment.players.slice(0, 3);
  for (let index = 0; index < players.length; index += 1) {
    await contribute(
      runId,
      actionId,
      round,
      players[index],
      (ordinal + index) % 4,
      BigInt(index + 1) * 10_000_000n,
      `cancel:${ordinal}:call:${index}`,
    );
  }
  const pendingBefore = await client.readContract({
    address: vault,
    abi: lifetimePointsVaultAbi,
    functionName: "totalPendingPoints",
  });
  await managerCall(
    runId,
    actionId,
    `cancel:${ordinal}:manager`,
    "cancelActive",
    [stringToHex("SOAK_CANCEL", { size: 32 })],
  );
  for (const player of players) {
    const before = await Promise.all(
      deployment.stockTokens.map((token, ticker) =>
        Promise.all([
          client.readContract({
            address: round,
            abi: lastBellV4Abi,
            functionName: "playerPurchasedStock",
            args: [player, ticker],
          }),
          client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [player],
          }),
        ]),
      ),
    );
    await transaction(
      runId,
      actionId,
      `cancel:${ordinal}:refund:${player}`,
      player,
      () =>
        wallet(player).writeContract({
          address: round,
          abi: lastBellV4Abi,
          functionName: "claimCancellationRefundFor",
          args: [player],
        }),
    );
    const after = await Promise.all(
      deployment.stockTokens.map((token) =>
        client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [player],
        }),
      ),
    );
    before.forEach(([expected, balance], ticker) => {
      if (after[ticker] - balance !== expected) {
        throw new Error(`Cancellation refund mismatch for ${player}.`);
      }
    });
  }
  const pendingAfter = await client.readContract({
    address: vault,
    abi: lifetimePointsVaultAbi,
    functionName: "totalPendingPoints",
  });
  if (pendingBefore === 0n || pendingAfter !== 0n) {
    throw new Error("Cancellation did not discard pending points.");
  }
  await reconcileRound(runId, round, true);
  await prepareAndActivate(runId, actionId, round);
}

async function start() {
  await ensureDeploymentRow();
  const existing = await pool.query(
    `SELECT id FROM soak_runs WHERE deployment_key=$1
       AND state IN ('scheduled','running','monitoring') LIMIT 1`,
    [deploymentKey],
  );
  if (existing.rowCount) {
    throw new Error(`Active soak already exists: ${existing.rows[0].id}`);
  }
  const runId = `v4-devnet-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await pool.query(
    `INSERT INTO soak_runs(
       id,deployment_key,chain_id,state,target_hours,target_rounds,
       gas_reserve_wei,config,started_at,run_profile,scenario_seed,target_minutes)
     VALUES($1,$2,31337,'running',$3,$4,0,$5,now(),$6,$7,$8)`,
    [
      runId,
      deploymentKey,
      runProfile === "v4-endurance" ? 2 : 0,
      targetSettled,
      JSON.stringify({
        targetSettled,
        targetCancelled,
        intervalMs: enduranceIntervalMs,
        rpc,
        contractVersion: deployment.contractVersion,
      }),
      runProfile,
      scenarioSeed,
      120,
    ],
  );
  await ensurePlayers(runId);
  process.stdout.write(`${runId}\n`);
}

async function currentRun() {
  const run = await pool.query<{
    id: string;
    run_profile: string;
    config: {
      targetSettled: number;
      targetCancelled: number;
      intervalMs?: number;
    };
  }>(
    `SELECT id,run_profile,config FROM soak_runs WHERE deployment_key=$1
     ORDER BY created_at DESC LIMIT 1`,
    [deploymentKey],
  );
  if (!run.rowCount) throw new Error("No v4 devnet soak exists.");
  return run.rows[0];
}

async function run() {
  const current = await currentRun();
  const natural = current.run_profile === "v4-endurance";
  for (let ordinal = 1; ordinal <= current.config.targetSettled; ordinal += 1) {
    const intervalStarted = Date.now();
    const action = await pool.query<{ id: string }>(
      `INSERT INTO soak_actions(
         run_id,idempotency_key,action_type,scheduled_at,state,payload,started_at)
       VALUES($1,$2,'v4-settled-round',now(),'running',$3,now())
       ON CONFLICT(run_id,idempotency_key) DO UPDATE SET
         state=CASE WHEN soak_actions.state='confirmed'
           THEN 'confirmed' ELSE 'running' END
       RETURNING id`,
      [current.id, `settled:${ordinal}`, JSON.stringify({ ordinal })],
    );
    const already = await pool.query<{ state: string }>(
      `SELECT state FROM soak_actions
       WHERE run_id=$1 AND idempotency_key=$2`,
      [current.id, `settled:${ordinal}`],
    );
    if (already.rows[0]?.state === "confirmed") continue;
    try {
      await runSettledRound(current.id, ordinal, action.rows[0].id, natural);
      await pool.query(
        `UPDATE soak_actions SET state='confirmed',completed_at=now()
         WHERE id=$1`,
        [action.rows[0].id],
      );
    } catch (error) {
      await pool.query(
        `UPDATE soak_actions SET state='failed',completed_at=now(),last_error=$2
         WHERE id=$1`,
        [
          action.rows[0].id,
          error instanceof Error ? error.message : String(error),
        ],
      );
      throw error;
    }
    if (natural && ordinal < current.config.targetSettled) {
      const remaining =
        (current.config.intervalMs ?? enduranceIntervalMs) -
        (Date.now() - intervalStarted);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    }
  }
  for (
    let ordinal = 1;
    ordinal <= current.config.targetCancelled;
    ordinal += 1
  ) {
    const action = await pool.query<{ id: string }>(
      `INSERT INTO soak_actions(
         run_id,idempotency_key,action_type,scheduled_at,state,payload,started_at)
       VALUES($1,$2,'v4-cancelled-round',now(),'running',$3,now())
       ON CONFLICT(run_id,idempotency_key) DO UPDATE SET
         state=CASE WHEN soak_actions.state='confirmed'
           THEN 'confirmed' ELSE 'running' END
       RETURNING id`,
      [current.id, `cancelled:${ordinal}`, JSON.stringify({ ordinal })],
    );
    const already = await pool.query<{ state: string }>(
      `SELECT state FROM soak_actions
       WHERE run_id=$1 AND idempotency_key=$2`,
      [current.id, `cancelled:${ordinal}`],
    );
    if (already.rows[0]?.state === "confirmed") continue;
    await runCancelledRound(current.id, ordinal, action.rows[0].id);
    await pool.query(
      `UPDATE soak_actions SET state='confirmed',completed_at=now()
       WHERE id=$1`,
      [action.rows[0].id],
    );
  }
  await pool.query(
    `UPDATE soak_runs SET state='completed',completed_at=now(),updated_at=now()
     WHERE id=$1`,
    [current.id],
  );
}

async function status() {
  const current = await currentRun();
  const result = await pool.query(
    `SELECT r.id,r.state,r.run_profile,r.started_at,r.completed_at,
       count(a.*) FILTER (WHERE a.state='confirmed') AS confirmed,
       count(a.*) FILTER (WHERE a.state='failed') AS failed,
       count(a.*) FILTER (WHERE a.state='running') AS running,
       count(a.*) FILTER (
         WHERE a.state='confirmed' AND a.action_type='v4-settled-round'
       ) AS settled,
       count(a.*) FILTER (
         WHERE a.state='confirmed' AND a.action_type='v4-cancelled-round'
       ) AS cancelled
     FROM soak_runs r LEFT JOIN soak_actions a ON a.run_id=r.id
     WHERE r.id=$1 GROUP BY r.id`,
    [current.id],
  );
  process.stdout.write(`${JSON.stringify(result.rows[0], null, 2)}\n`);
}

async function reconcile() {
  const current = await currentRun();
  const [assets, points, assertions, actions, transactions] = await Promise.all(
    [
      pool.query<{
        rows: string;
        discrepancies: string;
      }>(
        `SELECT count(*)::text AS rows,
         count(*) FILTER (WHERE discrepancy_raw<>0)::text AS discrepancies
       FROM soak_asset_reconciliations WHERE run_id=$1`,
        [current.id],
      ),
      pool.query<{ discrepancies: string }>(
        `SELECT count(*) FILTER (WHERE discrepancy_raw<>0)::text AS discrepancies
       FROM soak_point_reconciliations WHERE run_id=$1`,
        [current.id],
      ),
      pool.query<{ failed: string }>(
        `SELECT count(*) FILTER (WHERE NOT passed)::text AS failed
       FROM soak_assertions WHERE run_id=$1`,
        [current.id],
      ),
      pool.query<{ failed: string }>(
        `SELECT count(*) FILTER (WHERE state='failed')::text AS failed
       FROM soak_actions WHERE run_id=$1`,
        [current.id],
      ),
      pool.query<{ reverted: string }>(
        `SELECT count(*) FILTER (
         WHERE state IN ('reverted','abandoned')
       )::text AS reverted
       FROM soak_transactions WHERE run_id=$1`,
        [current.id],
      ),
    ],
  );
  const summary = {
    runId: current.id,
    assetRows: Number(assets.rows[0]?.rows ?? 0),
    discrepancies: Number(assets.rows[0]?.discrepancies ?? 0),
    pointDiscrepancies: Number(points.rows[0]?.discrepancies ?? 0),
    failedAssertions: Number(assertions.rows[0]?.failed ?? 0),
    failedActions: Number(actions.rows[0]?.failed ?? 0),
    revertedTrackedTransactions: Number(transactions.rows[0]?.reverted ?? 0),
  };
  if (
    summary.discrepancies ||
    summary.pointDiscrepancies ||
    summary.failedAssertions ||
    summary.failedActions ||
    summary.revertedTrackedTransactions
  ) {
    process.exitCode = 1;
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function report() {
  const current = await currentRun();
  const reconciliation = await reconcile();
  const statusRows = await pool.query(
    `SELECT action_type,state,count(*)::int AS count
     FROM soak_actions WHERE run_id=$1 GROUP BY action_type,state`,
    [current.id],
  );
  const machineReport = {
    runId: current.id,
    generatedAt: new Date().toISOString(),
    sourceCommit: deployment.sourceCommit,
    deploymentKey,
    scenarioSeed,
    manifest: deployment,
    scenarios: statusRows.rows,
    reconciliation,
  };
  await mkdir(reportDirectory, { recursive: true });
  const jsonPath = path.join(reportDirectory, `${current.id}.json`);
  const markdownPath = path.join(reportDirectory, `${current.id}.md`);
  await writeFile(jsonPath, `${JSON.stringify(machineReport, null, 2)}\n`);
  await writeFile(
    markdownPath,
    [
      `# Last Bell v4 Devnet Qualification`,
      ``,
      `- Run: \`${current.id}\``,
      `- Source: \`${deployment.sourceCommit}\``,
      `- Scenario seed: \`${scenarioSeed}\``,
      `- Asset reconciliation rows: ${reconciliation.assetRows}`,
      `- Discrepancies: ${reconciliation.discrepancies}`,
      `- Failed assertions: ${reconciliation.failedAssertions}`,
      `- Failed actions: ${reconciliation.failedActions}`,
      ``,
    ].join("\n"),
  );
  await pool.query(
    `INSERT INTO soak_run_reports(
       run_id,source_commit,manifest,scenario_summary,assertion_summary,
       machine_report)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(run_id) DO UPDATE SET
       scenario_summary=excluded.scenario_summary,
       assertion_summary=excluded.assertion_summary,
       machine_report=excluded.machine_report,generated_at=now()`,
    [
      current.id,
      deployment.sourceCommit,
      JSON.stringify(deployment),
      JSON.stringify(statusRows.rows),
      JSON.stringify(reconciliation),
      JSON.stringify(machineReport),
    ],
  );
  await pool.query(
    "UPDATE soak_runs SET report_path=$2,updated_at=now() WHERE id=$1",
    [current.id, path.relative(process.cwd(), jsonPath)],
  );
  process.stdout.write(`${jsonPath}\n`);
}

if (command === "start") await start();
else if (command === "run") await run();
else if (command === "status") await status();
else if (command === "reconcile") await reconcile();
else if (command === "report") await report();
else {
  throw new Error("Usage: v4-devnet-soak.ts start|run|status|reconcile|report");
}

await pool.end();
