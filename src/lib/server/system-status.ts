import "server-only";
import { database, databaseHealth } from "./db";
import { loadServerDeploymentWithKey } from "./deployment";
import { deploymentPublicClient } from "./rpc-client";
import { getLiveSnapshot } from "@/lib/web3/live-snapshot";
import { getV4DevnetSnapshot } from "@/lib/web3/v4-devnet";
import { isV4DevnetRuntime } from "./runtime-deployment";

async function probe(url: string) {
  const started = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
    signal: AbortSignal.timeout(2_500),
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    result?: `0x${string}`;
    error?: unknown;
  };
  if (!response.ok || !payload.result || payload.error) {
    throw new Error(`RPC returned ${response.status}`);
  }
  return {
    ok: true,
    block: Number(BigInt(payload.result)),
    latencyMs: Date.now() - started,
  };
}

export async function getSystemStatus() {
  const mode = process.env.NEXT_PUBLIC_GAME_MODE || "simulator";
  if (mode === "devnet") {
    const [db, run, services] = await Promise.all([
      databaseHealth(),
      database
        .query<{
          id: string;
          state: string;
          run_profile: string;
          started_at: Date;
          completed_at: Date | null;
          confirmed: string;
          failed: string;
          settled: string;
          cancelled: string;
          discrepancies: string;
        }>(
          `SELECT r.id,r.state,r.run_profile,r.started_at,r.completed_at,
             count(DISTINCT a.id) FILTER (
               WHERE a.state='confirmed'
             )::text AS confirmed,
             count(DISTINCT a.id) FILTER (
               WHERE a.state='failed'
             )::text AS failed,
             count(DISTINCT a.id) FILTER (
               WHERE a.state='confirmed'
                 AND a.action_type='v4-settled-round'
             )::text AS settled,
             count(DISTINCT a.id) FILTER (
               WHERE a.state='confirmed'
                 AND a.action_type='v4-cancelled-round'
             )::text AS cancelled,
             count(DISTINCT ar.round_contract) FILTER (
               WHERE ar.discrepancy_raw<>0
             )::text AS discrepancies
           FROM soak_runs r
           LEFT JOIN soak_actions a ON a.run_id=r.id
           LEFT JOIN soak_asset_reconciliations ar ON ar.run_id=r.id
           WHERE r.chain_id=31337
           GROUP BY r.id ORDER BY r.created_at DESC LIMIT 1`,
        )
        .catch(() => ({ rows: [], rowCount: 0 })),
      database
        .query<{
          service: string;
          status: string;
          observed_at: Date;
        }>(
          `SELECT service,status,observed_at FROM service_heartbeats
           WHERE chain_id=31337 ORDER BY service`,
        )
        .catch(() => ({ rows: [], rowCount: 0 })),
    ]);
    const latest = run.rows[0];
    return {
      ok: true,
      mode,
      database: db,
      qualification: latest
        ? {
            runId: latest.id,
            profile: latest.run_profile,
            state: latest.state,
            settledRounds: Number(latest.settled),
            cancelledRounds: Number(latest.cancelled),
            confirmedActions: Number(latest.confirmed),
            failedActions: Number(latest.failed),
            discrepancies: Number(latest.discrepancies),
            startedAt: latest.started_at.toISOString(),
            completedAt: latest.completed_at?.toISOString(),
          }
        : null,
      services: services.rows.map((service) => ({
        name: service.service,
        status: service.status,
        observedAt: service.observed_at.toISOString(),
      })),
      checkedAt: new Date().toISOString(),
    };
  }
  if (mode !== "testnet" && mode !== "mainnet") {
    return { ok: true, mode, checkedAt: new Date().toISOString() };
  }
  const { manifest, deploymentKey } = await loadServerDeploymentWithKey();
  const client = deploymentPublicClient(manifest);
  const [
    block,
    db,
    services,
    checkpoint,
    market,
    currentRound,
    latestReport,
    primary,
    fallback,
  ] = await Promise.all([
    client.getBlockNumber(),
    databaseHealth(),
    database.query<{
      service: string;
      status: string;
      details: Record<string, unknown>;
      observed_at: Date;
    }>(
      `SELECT service,status,details,observed_at FROM service_heartbeats
         WHERE chain_id=$1 AND service <> 'data-streams-adapter'
         ORDER BY service`,
      [manifest.chainId],
    ),
    database.query<{ block_number: string; updated_at: Date }>(
      `SELECT block_number,updated_at FROM indexer_checkpoints
         WHERE deployment_key=$1 AND service='chain-indexer'`,
      [deploymentKey],
    ),
    database.query<{
      assets: string;
      complete: string;
      safe: string;
      newest_sample: Date | null;
    }>(
      `SELECT count(DISTINCT symbol)::text AS assets,
          count(DISTINCT symbol) FILTER (
            WHERE symbol IN (
              SELECT symbol FROM market_samples
              WHERE sampled_at >= now() - interval '30 minutes'
                AND source='uniswap-v3-twap'
              GROUP BY symbol HAVING count(*) >= 100
            )
          )::text AS complete,
          count(DISTINCT symbol) FILTER (WHERE dex_safe)::text AS safe,
          max(sampled_at) FILTER (
            WHERE source='uniswap-v3-twap'
          ) AS newest_sample
        FROM market_assets LEFT JOIN market_samples USING(symbol)`,
    ),
    (isV4DevnetRuntime() ? getV4DevnetSnapshot() : getLiveSnapshot()).catch(
      () => null,
    ),
    database.query<{ observed_at: Date }>(
      "SELECT observed_at FROM market_reports ORDER BY observed_at DESC LIMIT 1",
    ),
    probe(manifest.rpc.primary).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })),
    manifest.rpc.fallback
      ? probe(manifest.rpc.fallback).catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }))
      : Promise.resolve({ ok: false, error: "not configured" }),
  ]);
  const indexedBlock = checkpoint.rowCount
    ? Number(checkpoint.rows[0].block_number)
    : manifest.deploymentBlock - 1;
  const warningPotUsd = Number(process.env.OPERATIONS_POT_WARNING_USD || 1_000);
  const criticalPotUsd = Number(
    process.env.OPERATIONS_POT_CRITICAL_USD || 5_000,
  );
  const currentPotUsd = currentRound?.potUsd ?? 0;
  const potAlert =
    currentPotUsd >= criticalPotUsd
      ? "critical"
      : currentPotUsd >= warningPotUsd
        ? "warning"
        : "normal";
  return {
    ok: true,
    mode,
    chainId: manifest.chainId,
    block: Number(block),
    sourceCommit: manifest.sourceCommit,
    deploymentBlock: manifest.deploymentBlock,
    deploymentKey,
    contracts: manifest.contracts,
    mockOnly: manifest.mockOnly,
    rpc: { primary, fallback },
    database: db,
    indexer: {
      indexedBlock,
      lag: Number(block) - indexedBlock,
      updatedAt: checkpoint.rows[0]?.updated_at?.toISOString(),
    },
    market: {
      assets: Number(market.rows[0]?.assets || 0),
      completeStreams: Number(market.rows[0]?.complete || 0),
      safeDexMarkets: Number(market.rows[0]?.safe || 0),
      newestSample: market.rows[0]?.newest_sample?.toISOString(),
      latestDexObservation: latestReport.rows[0]?.observed_at?.toISOString(),
      currentRoster: currentRound?.tickerScores ?? [],
    },
    round: currentRound
      ? {
          id: currentRound.roundId,
          state: currentRound.phase,
          address: currentRound.contractAddress,
          potUsd: currentPotUsd,
          operationsPotAlert: {
            level: potAlert,
            warningPotUsd,
            criticalPotUsd,
            informationalOnly: true,
            claimsBlocked: false,
          },
        }
      : null,
    services: services.rows.map((service) => ({
      name: service.service,
      status: service.status,
      details: service.details,
      observedAt: service.observed_at.toISOString(),
    })),
    checkedAt: new Date().toISOString(),
  };
}
