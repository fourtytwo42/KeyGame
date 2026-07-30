import { roundConfig } from "./constants";
import type { ClaimEvent, MarketBand, TickerId } from "./types";

type LegacyFactionClaim = {
  id: string;
  sequence: number;
  acceptedAt: number;
  player: `0x${string}`;
  displayName?: string;
  faction: TickerId;
  previousHolder?: `0x${string}`;
  previousFaction?: TickerId;
  feeUsd: number;
  potAfterUsd: number;
  timeAfterSeconds: number;
  transactionHash?: `0x${string}`;
  blockNumber?: number;
};

export type VersionedReplay =
  | {
      contractVersion: "closing-print-v2-dex";
      claims: ClaimEvent[];
    }
  | {
      contractVersion: "closing-print-v1";
      claims: ClaimEvent[];
    }
  | {
      contractVersion: "faction-v0";
      claims: LegacyFactionClaim[];
    };

export function parseVersionedReplay(input: VersionedReplay): ClaimEvent[] {
  if (
    input.contractVersion === "closing-print-v2-dex" ||
    input.contractVersion === "closing-print-v1"
  ) {
    return input.claims.map((claim) => ({
      ...claim,
      contractVersion: input.contractVersion,
    }));
  }

  return input.claims.map((claim) => {
    const band: MarketBand = "FLAT";
    return {
      id: claim.id,
      sequence: claim.sequence,
      atSeconds: claim.acceptedAt,
      claimant: {
        address: claim.player,
        displayName: claim.displayName ?? `caller-${claim.player.slice(2, 7)}`,
        ticker: claim.faction,
        claimNumber: claim.sequence,
        band,
        multiplierBps: 10_000,
        verifiedPrice: 0,
        reportTimestamp: 0,
        producerPass: false,
      },
      previousHolder: claim.previousHolder,
      previousTicker: claim.previousFaction,
      feeUsd: claim.feeUsd,
      transactionHash: claim.transactionHash,
      blockNumber: claim.blockNumber,
      contractVersion: "faction-v0",
      accepted: true,
      potAfterUsd: claim.potAfterUsd,
      timeAfterSeconds: claim.timeAfterSeconds,
      verifiedPrice: 0,
      reportTimestamp: 0,
      marketBand: band,
      multiplierBps: roundConfig.multipliersBps.FLAT,
      producerPass: false,
    };
  });
}
