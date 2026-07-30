import "server-only";

import type {
  HistoricalRun,
  HistoricalRunSummary,
} from "@/lib/game/history-types";
import type { TickerId } from "@/lib/game/types";
import { getLiveSnapshot } from "@/lib/web3/live-snapshot";
import { database } from "./db";
import { loadServerDeployment } from "./deployment";

type SettledRow = {
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
};

function archiveId(row: SettledRow) {
  return `${row.round_id}-${row.transaction_hash.replace(/^0x/, "").slice(-12)}`;
}

function summary(row: SettledRow): HistoricalRunSummary {
  const winner = Number(row.args.winningTicker);
  const holder = row.args.finalHolder;
  return {
    id: archiveId(row),
    roundId: row.round_id,
    finishedAt: row.settled_at.toISOString(),
    peakPotUsd: Number(row.args.grossPot ?? 0) / 1e6,
    finalHolder: holder ? `caller-${holder.slice(2, 7)}` : "NO FINAL CALLER",
    winningTicker: row.roster.selected?.[winner]?.ticker,
    claimCount: Number(row.claim_count),
  };
}

async function settledRows(roundId?: string) {
  const manifest = await loadServerDeployment();
  return database.query<SettledRow>(
    `SELECT r.round_id::text,r.contract_address,r.roster,r.settled_at,
            e.transaction_hash,e.args,
            (SELECT count(*)::text FROM chain_events c
             WHERE c.chain_id=r.chain_id
               AND lower(c.contract_address)=lower(r.contract_address)
               AND c.event_name='BellClaimed') AS claim_count
     FROM rounds r
     JOIN LATERAL (
       SELECT transaction_hash,args
       FROM chain_events
       WHERE chain_id=r.chain_id
         AND lower(contract_address)=lower(r.contract_address)
         AND event_name='RoundSettled'
       ORDER BY block_number DESC,log_index DESC LIMIT 1
     ) e ON true
     WHERE r.chain_id=$1 AND r.state='settled'
       AND ($2::text IS NULL OR r.round_id::text=$2)
     ORDER BY r.round_id DESC LIMIT 20`,
    [manifest.chainId, roundId ?? null],
  );
}

export async function getIndexedHistoricalRunSummaries() {
  return (await settledRows()).rows.map(summary);
}

export async function getIndexedHistoricalRun(
  id: string,
): Promise<HistoricalRun | undefined> {
  const roundId = id.split("-", 1)[0];
  const row = (await settledRows(roundId)).rows.find(
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
