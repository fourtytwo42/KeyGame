import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { RaidCampaign } from "@/lib/game/types";
import { raidThreshold } from "@/lib/game/raid-config";
import { database } from "./db";
import { loadServerDeploymentWithKey } from "./deployment";

const GATHERING_HOURS = 24;
const COUNTDOWN_MINUTES = 5;
const LIVE_MINUTES = 15;
const COOLDOWN_MINUTES = 45;

function configuredOverride() {
  const explicit = Number(process.env.RAID_THRESHOLD_OVERRIDE || 0);
  if (explicit > 0) return explicit;
  const mode = process.env.NEXT_PUBLIC_GAME_MODE;
  return mode === "devnet" ? 1 : mode === "testnet" ? 2 : undefined;
}

async function eligibleClaim(
  client: PoolClient,
  deploymentKey: string,
  address: string,
) {
  const result = await client.query<{
    transaction_hash: string;
    block_number: string;
  }>(
    `WITH tip AS (
       SELECT coalesce(max(number),0) AS block FROM canonical_blocks
       WHERE chain_id=(SELECT chain_id FROM deployments WHERE deployment_key=$1)
     )
     SELECT e.transaction_hash,e.block_number::text
     FROM chain_events e
     JOIN canonical_blocks b
       ON b.chain_id=e.chain_id AND b.number=e.block_number
     CROSS JOIN tip
     WHERE e.deployment_key=$1 AND e.event_name='BellClaimed'
       AND lower(e.args->>'player')=lower($2)
       AND b.block_time >= now() - interval '30 days'
       AND e.block_number <= tip.block - 3
     ORDER BY e.block_number DESC,e.log_index DESC LIMIT 1`,
    [deploymentKey, address],
  );
  return result.rows[0] ?? null;
}

async function eligibleCount(client: PoolClient, deploymentKey: string) {
  const result = await client.query<{ count: string }>(
    `WITH tip AS (
       SELECT coalesce(max(number),0) AS block FROM canonical_blocks
       WHERE chain_id=(SELECT chain_id FROM deployments WHERE deployment_key=$1)
     )
     SELECT count(DISTINCT lower(e.args->>'player'))::text
     FROM chain_events e
     JOIN canonical_blocks b
       ON b.chain_id=e.chain_id AND b.number=e.block_number
     CROSS JOIN tip
     WHERE e.deployment_key=$1 AND e.event_name='BellClaimed'
       AND b.block_time >= now() - interval '30 days'
       AND e.block_number <= tip.block - 3`,
    [deploymentKey],
  );
  return Number(result.rows[0]?.count ?? 0);
}

type CampaignRow = {
  id: string;
  deployment_key: string;
  state: RaidCampaign["state"];
  threshold: number;
  eligible_voters: number;
  gathering_expires_at: Date;
  countdown_starts_at: Date | null;
  live_starts_at: Date | null;
  live_ends_at: Date | null;
  cooldown_ends_at: Date | null;
  discrepancy: string | null;
  vote_count: string;
};

async function loadOpenCampaign(client: PoolClient, deploymentKey: string) {
  return (
    await client.query<CampaignRow>(
      `SELECT c.*,
        (SELECT count(*)::text FROM raid_votes v
         WHERE v.campaign_id=c.id AND v.valid) AS vote_count
       FROM raid_campaigns c
       WHERE c.deployment_key=$1
         AND c.state IN ('GATHERING','COUNTDOWN','LIVE','COOLDOWN')
       ORDER BY c.created_at DESC LIMIT 1
       FOR UPDATE`,
      [deploymentKey],
    )
  ).rows[0];
}

async function createCampaign(
  client: PoolClient,
  deploymentKey: string,
  eligible: number,
) {
  const threshold = raidThreshold(eligible, configuredOverride());
  const result = await client.query<CampaignRow>(
    `INSERT INTO raid_campaigns(
       id,deployment_key,state,threshold,eligible_voters,gathering_expires_at)
     VALUES($1,$2,'GATHERING',$3,$4,
       now()+($5::text || ' hours')::interval)
     RETURNING *, '0'::text AS vote_count`,
    [randomUUID(), deploymentKey, threshold, eligible, GATHERING_HOURS],
  );
  return result.rows[0];
}

async function revalidateVotes(client: PoolClient, campaign: CampaignRow) {
  await client.query(
    `UPDATE raid_votes v SET valid=EXISTS (
       WITH tip AS (
         SELECT coalesce(max(number),0) AS block FROM canonical_blocks
         WHERE chain_id=(SELECT chain_id FROM deployments WHERE deployment_key=$1)
       )
       SELECT 1 FROM chain_events e
       JOIN canonical_blocks b
         ON b.chain_id=e.chain_id AND b.number=e.block_number
       CROSS JOIN tip
       WHERE e.deployment_key=$1 AND e.event_name='BellClaimed'
         AND lower(e.args->>'player')=lower(v.address)
         AND b.block_time >= now() - interval '30 days'
         AND e.block_number <= tip.block - 3
     )
     WHERE v.campaign_id=$2`,
    [campaign.deployment_key, campaign.id],
  );
}

async function advanceCampaign(
  client: PoolClient,
  campaign: CampaignRow,
  eligible: number,
) {
  const now = new Date();
  await revalidateVotes(client, campaign);
  const votes = Number(
    (
      await client.query<{ count: string }>(
        "SELECT count(*)::text FROM raid_votes WHERE campaign_id=$1 AND valid",
        [campaign.id],
      )
    ).rows[0]?.count ?? 0,
  );
  const threshold = raidThreshold(eligible, configuredOverride());
  if (campaign.state === "GATHERING") {
    if (campaign.gathering_expires_at <= now) {
      await client.query(
        "UPDATE raid_campaigns SET state='EXPIRED',updated_at=now() WHERE id=$1",
        [campaign.id],
      );
      return null;
    }
    if (votes >= threshold) {
      await client.query(
        `UPDATE raid_campaigns SET
           state='COUNTDOWN',threshold=$2,eligible_voters=$3,
           countdown_starts_at=now(),
           live_starts_at=now()+($4::text || ' minutes')::interval,
           live_ends_at=now()+(($4+$5)::text || ' minutes')::interval,
           cooldown_ends_at=now()+(($4+$5+$6)::text || ' minutes')::interval,
           updated_at=now()
         WHERE id=$1`,
        [
          campaign.id,
          threshold,
          eligible,
          COUNTDOWN_MINUTES,
          LIVE_MINUTES,
          COOLDOWN_MINUTES,
        ],
      );
    } else {
      await client.query(
        `UPDATE raid_campaigns SET threshold=$2,eligible_voters=$3,updated_at=now()
         WHERE id=$1`,
        [campaign.id, threshold, eligible],
      );
    }
  } else if (campaign.state === "COUNTDOWN") {
    if (votes < threshold) {
      await client.query(
        `UPDATE raid_campaigns SET state='GATHERING',
           threshold=$2,eligible_voters=$3,
           countdown_starts_at=NULL,live_starts_at=NULL,live_ends_at=NULL,
           cooldown_ends_at=NULL,updated_at=now()
         WHERE id=$1`,
        [campaign.id, threshold, eligible],
      );
    } else if (campaign.live_starts_at && campaign.live_starts_at <= now) {
      await client.query(
        "UPDATE raid_campaigns SET state='LIVE',updated_at=now() WHERE id=$1",
        [campaign.id],
      );
    }
  } else if (
    campaign.state === "LIVE" &&
    campaign.live_ends_at &&
    campaign.live_ends_at <= now
  ) {
    await client.query(
      "UPDATE raid_campaigns SET state='COOLDOWN',updated_at=now() WHERE id=$1",
      [campaign.id],
    );
  } else if (
    campaign.state === "COOLDOWN" &&
    campaign.cooldown_ends_at &&
    campaign.cooldown_ends_at <= now
  ) {
    await client.query(
      "UPDATE raid_campaigns SET state='EXPIRED',updated_at=now() WHERE id=$1",
      [campaign.id],
    );
    return null;
  }
  return loadOpenCampaign(client, campaign.deployment_key);
}

function campaignResponse(
  row: CampaignRow,
  viewerEligible: boolean,
  viewerVoted: boolean,
): RaidCampaign & { secondsRemaining?: number } {
  const next =
    row.state === "COUNTDOWN"
      ? row.live_starts_at
      : row.state === "LIVE"
        ? row.live_ends_at
        : row.state === "COOLDOWN"
          ? row.cooldown_ends_at
          : undefined;
  return {
    id: row.id,
    deploymentKey: row.deployment_key,
    state: row.state,
    eligibleVoters: row.eligible_voters,
    threshold: row.threshold,
    voteCount: Number(row.vote_count),
    viewerEligible,
    viewerVoted,
    gatheringExpiresAt: row.gathering_expires_at.toISOString(),
    countdownStartsAt: row.countdown_starts_at?.toISOString(),
    liveStartsAt: row.live_starts_at?.toISOString(),
    liveEndsAt: row.live_ends_at?.toISOString(),
    cooldownEndsAt: row.cooldown_ends_at?.toISOString(),
    discrepancy: row.discrepancy ?? undefined,
    secondsRemaining: next
      ? Math.max(0, Math.ceil((next.getTime() - Date.now()) / 1_000))
      : undefined,
  };
}

export async function getCurrentRaid(viewerAddress?: string) {
  const { deploymentKey } = await loadServerDeploymentWithKey();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `raid:${deploymentKey}`,
    ]);
    const eligible = await eligibleCount(client, deploymentKey);
    let campaign: CampaignRow | null =
      (await loadOpenCampaign(client, deploymentKey)) ?? null;
    campaign = campaign
      ? await advanceCampaign(client, campaign, eligible)
      : null;
    if (!campaign)
      campaign = await createCampaign(client, deploymentKey, eligible);
    const [claim, vote] = viewerAddress
      ? await Promise.all([
          eligibleClaim(client, deploymentKey, viewerAddress),
          client.query(
            "SELECT 1 FROM raid_votes WHERE campaign_id=$1 AND lower(address)=lower($2) AND valid",
            [campaign.id, viewerAddress],
          ),
        ])
      : [null, { rowCount: 0 }];
    await client.query("COMMIT");
    return campaignResponse(campaign, Boolean(claim), Boolean(vote.rowCount));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function castRaidVote(address: string) {
  const { deploymentKey } = await loadServerDeploymentWithKey();
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `raid:${deploymentKey}`,
    ]);
    const eligible = await eligibleCount(client, deploymentKey);
    let campaign = await loadOpenCampaign(client, deploymentKey);
    if (!campaign)
      campaign = await createCampaign(client, deploymentKey, eligible);
    campaign = (await advanceCampaign(client, campaign, eligible)) ?? campaign;
    if (campaign.state !== "GATHERING") {
      throw new Error("Voting is closed for this raid window.");
    }
    const claim = await eligibleClaim(client, deploymentKey, address);
    if (!claim) {
      throw new Error(
        "Make one confirmed call on this deployment before voting.",
      );
    }
    await client.query(
      `INSERT INTO raid_votes(
         campaign_id,deployment_key,address,accepted_claim_tx,accepted_claim_block)
       VALUES($1,$2,lower($3),$4,$5)`,
      [
        campaign.id,
        deploymentKey,
        address,
        claim.transaction_hash,
        claim.block_number,
      ],
    );
    const updated = await advanceCampaign(client, campaign, eligible);
    await client.query("COMMIT");
    return campaignResponse(updated ?? campaign, true, true);
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new Error("This wallet already voted in the current raid.");
    }
    throw error;
  } finally {
    client.release();
  }
}
