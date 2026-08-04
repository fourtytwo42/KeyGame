import "server-only";

import type {
  HistoricalRun,
  HistoricalRunSummary,
} from "@/lib/game/history-types";
import type { TickerId } from "@/lib/game/types";
import { getLiveSnapshot } from "@/lib/web3/live-snapshot";
import { database } from "./db";
import { loadServerDeploymentWithKey } from "./deployment";

type SettledRow = {
  deployment_key: string;
  round_id: string;
  contract_address: `0x${string}`;
  roster: {
    selected?: Array<{ ticker?: TickerId }>;
  };
  settled_at: Date;
  transaction_hash: `0x${string}`;
  args: {
    finalHolder?: `0x${string}`;
    winningTicker?: string | number;
    grossPot?: string;
  };
  claim_count: string;
  final_holder_display_name: string | null;
  final_holder_handle: string | null;
  largest_call_usd: string | null;
  flip_count: string;
  last_call_time_remaining: string | null;
  notable_achievement: string | null;
};

function archiveId(row: SettledRow) {
  const deploymentTag = row.deployment_key
    .split(":")[1]
    ?.replace(/^0x/, "")
    .slice(0, 8);
  return `${deploymentTag}-${row.round_id}-${row.contract_address.replace(/^0x/, "").slice(0, 8)}-${row.transaction_hash.replace(/^0x/, "").slice(-12)}`;
}

function summary(row: SettledRow): HistoricalRunSummary {
  const winner = Number(row.args.winningTicker);
  const holder = row.args.finalHolder;
  const peakPotUsd =
    Number(
      row.args.grossPot ??
        (row.args as { totalContributed?: string }).totalContributed ??
        0,
    ) / 1e6;
  const winningTicker = row.roster.selected?.[winner]?.ticker;
  const claimCount = Number(row.claim_count);
  const lastCall =
    row.last_call_time_remaining === null
      ? undefined
      : Number(row.last_call_time_remaining);
  return {
    id: archiveId(row),
    deploymentKey: row.deployment_key,
    roundId: row.round_id,
    finishedAt: row.settled_at.toISOString(),
    peakPotUsd,
    finalHolder: holder
      ? (row.final_holder_display_name ?? `caller-${holder.slice(2, 7)}`)
      : "NO FINAL CALLER",
    finalHolderHandle: row.final_holder_handle ?? undefined,
    winningTicker,
    claimCount,
    largestCallUsd: row.largest_call_usd
      ? Number(row.largest_call_usd) / 1e6
      : undefined,
    flipCount: Number(row.flip_count),
    lastCallTimeRemaining: lastCall,
    storySummary: `$${peakPotUsd.toLocaleString()} POT · ${winningTicker ?? "NO STOCK"} WON · ${claimCount} CALLS${lastCall === undefined ? "" : ` · STOLEN WITH ${lastCall.toFixed(1)}S LEFT`}${row.notable_achievement ? ` · ${row.notable_achievement}` : ""}`,
  };
}

async function settledRows(roundId?: string) {
  const { deploymentKey } = await loadServerDeploymentWithKey();
  return database.query<SettledRow>(
    `SELECT r.deployment_key,r.round_id::text,r.contract_address,r.roster,r.settled_at,
            e.transaction_hash,e.args,
            p.display_name AS final_holder_display_name,
            p.handle AS final_holder_handle,
            (SELECT max(usdg_amount)::text FROM stock_pot_contributions s
             WHERE s.deployment_key=r.deployment_key AND s.round_id=r.round_id AND s.canonical=true) AS largest_call_usd,
            (SELECT count(*)::text FROM round_highlights h
             WHERE h.deployment_key=r.deployment_key AND h.round_id=r.round_id AND h.kind='TICKER_FLIP' AND h.canonical=true) AS flip_count,
            (SELECT greatest(0,(c.args->>'deadline')::numeric-(c.args->>'acceptedAt')::numeric)::text
             FROM chain_events c WHERE c.deployment_key=r.deployment_key AND lower(c.contract_address)=lower(r.contract_address)
               AND c.event_name='BellClaimed' ORDER BY c.block_number DESC,c.log_index DESC LIMIT 1) AS last_call_time_remaining,
            (SELECT title FROM player_achievements a
             WHERE a.deployment_key=r.deployment_key AND a.round_id=r.round_id AND a.canonical=true
             ORDER BY CASE a.kind WHEN 'BELL_SNIPER' THEN 1 WHEN 'RUG_SURVIVOR' THEN 2 WHEN 'BIGGEST_APE' THEN 3 ELSE 4 END LIMIT 1) AS notable_achievement,
            (SELECT count(*)::text FROM chain_events c
             WHERE c.deployment_key=r.deployment_key
               AND lower(c.contract_address)=lower(r.contract_address)
               AND c.event_name='BellClaimed') AS claim_count
     FROM rounds r
     JOIN LATERAL (
       SELECT transaction_hash,args
       FROM chain_events
       WHERE deployment_key=r.deployment_key
         AND lower(contract_address)=lower(r.contract_address)
         AND event_name='RoundSettled'
       ORDER BY block_number DESC,log_index DESC LIMIT 1
     ) e ON true
     LEFT JOIN player_profiles p
       ON lower(p.address)=lower(e.args->>'finalHolder')
     WHERE r.deployment_key=$1 AND r.state='settled'
       AND ($2::text IS NULL OR r.round_id::text=$2)
     ORDER BY r.round_id DESC LIMIT 20`,
    [deploymentKey, roundId ?? null],
  );
}

export async function getIndexedHistoricalRunSummaries() {
  return (await settledRows()).rows.map(summary);
}

export async function getIndexedHistoricalRun(
  id: string,
): Promise<HistoricalRun | undefined> {
  const row = (await settledRows()).rows.find(
    (candidate) => archiveId(candidate) === id,
  );
  if (!row) return undefined;
  return {
    ...summary(row),
    state: await getLiveSnapshot(row.contract_address),
  };
}

export async function getIndexedHistoricalRunByRoundId(
  roundId: string,
): Promise<HistoricalRun | undefined> {
  const row = (await settledRows(roundId)).rows[0];
  if (!row) return undefined;
  return {
    ...summary(row),
    state: await getLiveSnapshot(row.contract_address),
  };
}
