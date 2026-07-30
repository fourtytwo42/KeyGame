import "server-only";

import { createHash } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { tickerSlots } from "@/lib/game/constants";
import type { PlayerProfile } from "@/lib/game/types";
import { validateProfile } from "@/lib/game/profile-validation";
import { database } from "./db";
import { loadServerDeploymentWithKey } from "./deployment";

async function statsFor(address: string) {
  const { deploymentKey } = await loadServerDeploymentWithKey();
  const [basics, finalBells, winningContributions, rewards, airtime] =
    await Promise.all([
      database.query<{ calls: string; rounds: string }>(
        `SELECT count(*)::text AS calls,
          count(DISTINCT contract_address)::text AS rounds
         FROM chain_events
         WHERE deployment_key=$1 AND event_name='BellClaimed'
           AND lower(args->>'player')=lower($2)`,
        [deploymentKey, address],
      ),
      database.query<{ count: string }>(
        `SELECT count(*)::text FROM chain_events
         WHERE deployment_key=$1 AND event_name='RoundSettled'
           AND lower(args->>'finalHolder')=lower($2)`,
        [deploymentKey, address],
      ),
      database.query<{ count: string }>(
        `SELECT count(*)::text
         FROM chain_events claim
         WHERE claim.deployment_key=$1 AND claim.event_name='BellClaimed'
           AND lower(claim.args->>'player')=lower($2)
           AND EXISTS (
             SELECT 1 FROM chain_events settled
             WHERE settled.deployment_key=claim.deployment_key
               AND lower(settled.contract_address)=lower(claim.contract_address)
               AND settled.event_name='RoundSettled'
               AND settled.args->>'winningTicker'=claim.args->>'ticker'
           )`,
        [deploymentKey, address],
      ),
      database.query<{ amount: string }>(
        `SELECT coalesce(sum((args->>'amount')::numeric),0)::text AS amount
         FROM chain_events
         WHERE deployment_key=$1 AND event_name='RewardClaimed'
           AND lower(args->>'player')=lower($2)`,
        [deploymentKey, address],
      ),
      database.query<{
        total_seconds: string;
        top_ticker: string | null;
      }>(
        `WITH settlements AS (
           SELECT e.contract_address,
             extract(epoch FROM b.block_time)::bigint AS settled_at
           FROM chain_events e
           JOIN canonical_blocks b
             ON b.chain_id=e.chain_id AND b.number=e.block_number
           WHERE e.deployment_key=$1 AND e.event_name='RoundSettled'
         ), ordered AS (
           SELECT claim.contract_address,claim.args,
             (args->>'ticker') AS ticker,
             (args->>'acceptedAt')::bigint AS accepted_at,
             lead((args->>'acceptedAt')::bigint) OVER (
               PARTITION BY claim.contract_address
               ORDER BY claim.block_number,claim.log_index
             ) AS next_at,
             settlements.settled_at
           FROM chain_events claim
           LEFT JOIN settlements
             ON lower(settlements.contract_address)=lower(claim.contract_address)
           WHERE claim.deployment_key=$1 AND claim.event_name='BellClaimed'
         ), owned AS (
           SELECT ticker,
             greatest(
               0,coalesce(next_at,settled_at,accepted_at)-accepted_at
             ) AS seconds
           FROM ordered
           WHERE lower(args->>'player')=lower($2)
         ), totals AS (
           SELECT ticker,sum(seconds) AS seconds FROM owned GROUP BY ticker
         )
         SELECT coalesce(sum(seconds),0)::text AS total_seconds,
           (array_agg(ticker ORDER BY seconds DESC,ticker))[1] AS top_ticker
         FROM totals`,
        [deploymentKey, address],
      ),
    ]);
  const topTicker = airtime.rows[0]?.top_ticker;
  const topTickerIndex = topTicker === null ? Number.NaN : Number(topTicker);
  return {
    calls: Number(basics.rows[0]?.calls ?? 0),
    roundsPlayed: Number(basics.rows[0]?.rounds ?? 0),
    finalBells: Number(finalBells.rows[0]?.count ?? 0),
    winningTickerContributions: Number(
      winningContributions.rows[0]?.count ?? 0,
    ),
    totalRawAirtimeSeconds: Number(airtime.rows[0]?.total_seconds ?? 0),
    topTicker:
      Number.isInteger(topTickerIndex) && tickerSlots[topTickerIndex]
        ? tickerSlots[topTickerIndex].id
        : (topTicker ?? undefined),
    claimedRewardsUsd: Number(rewards.rows[0]?.amount ?? 0) / 1e6,
  };
}

export async function getProfile(
  identity: string,
): Promise<PlayerProfile | null> {
  const result = await database.query<{
    address: `0x${string}`;
    handle: string;
    display_name: string;
    favorite_ticker: string | null;
    avatar_seed: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT address,handle,display_name,favorite_ticker,avatar_seed,
            created_at,updated_at
     FROM player_profiles
     WHERE ${isAddress(identity) ? "lower(address)=lower($1)" : "handle=lower($1)"}`,
    [identity],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    address: getAddress(row.address),
    handle: row.handle,
    displayName: row.display_name,
    favoriteTicker: row.favorite_ticker ?? undefined,
    avatarSeed: row.avatar_seed,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    stats: await statsFor(row.address),
  };
}

export async function upsertProfile(
  address: string,
  input: { handle?: unknown; displayName?: unknown; favoriteTicker?: unknown },
) {
  const profile = validateProfile(input);
  const avatarSeed = createHash("sha256")
    .update(`last-bell-avatar:${address.toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
  try {
    await database.query(
      `INSERT INTO player_profiles(
         address,handle,display_name,favorite_ticker,avatar_seed)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(address) DO UPDATE SET
         handle=excluded.handle,
         display_name=excluded.display_name,
         favorite_ticker=excluded.favorite_ticker,
         updated_at=now()`,
      [
        address.toLowerCase(),
        profile.handle,
        profile.displayName,
        profile.favoriteTicker ?? null,
        avatarSeed,
      ],
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new Error("That handle is already on the tape.");
    }
    throw error;
  }
  return getProfile(address);
}
