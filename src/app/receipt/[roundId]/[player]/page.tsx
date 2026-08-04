import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoundRewardPanel } from "@/components/round-reward-panel";
import { ShareReceipt } from "@/components/share-receipt";
import { OnchainVerification } from "@/components/onchain-verification";
import { formatUsd, shortAddress } from "@/lib/game/constants";
import { scenarios } from "@/lib/game/scenarios";
import { getIndexedHistoricalRunByRoundId } from "@/lib/server/indexed-history";
import { getDevnetSnapshot } from "@/lib/web3/devnet";
import { deriveAchievements, deriveHighlights } from "@/lib/game/highlights";

export const metadata: Metadata = {
  title: "Final Holder Receipt",
  description: "The canonical receipt for Saved by the Bell Round 4663.",
};
export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ roundId: string; player: string }>;
}) {
  const { roundId, player } = await params;
  const mode = process.env.NEXT_PUBLIC_GAME_MODE;
  const indexed =
    mode === "testnet" || mode === "mainnet"
      ? await getIndexedHistoricalRunByRoundId(roundId)
      : undefined;
  if ((mode === "testnet" || mode === "mainnet") && !indexed) notFound();
  const state = indexed
    ? indexed.state
    : mode === "devnet"
      ? await getDevnetSnapshot()
      : scenarios.settled.state;
  const isWinner =
    state.holder?.address.toLowerCase() === player.toLowerCase() ||
    player === "demo";
  const isAirtimeVersion = state.contractVersion === "closing-print-v3-airtime";
  const isStockPotVersion =
    state.contractVersion === "saved-bell-v5-market-pot" ||
    state.contractVersion === "last-bell-v4-stock-pot";
  const callerClaims = state.claims.filter(
    (claim) =>
      player === "demo" ||
      claim.claimant.address.toLowerCase() === player.toLowerCase(),
  );
  const playerRawSeconds = callerClaims.reduce(
    (total, claim) => total + (claim.intervalSeconds ?? 0),
    0,
  );
  const totalRawSeconds = state.claims.reduce(
    (total, claim) => total + (claim.intervalSeconds ?? 0),
    0,
  );
  const legacyEligibleSeconds = callerClaims
    .filter((claim) => claim.claimant.ticker === state.winningTicker)
    .reduce((total, claim) => total + (claim.intervalSeconds ?? 0), 0);
  const legacyTotalSeconds = state.claims
    .filter((claim) => claim.claimant.ticker === state.winningTicker)
    .reduce((total, claim) => total + (claim.intervalSeconds ?? 0), 0);
  const playerWinningPoints = callerClaims
    .filter((claim) => claim.claimant.ticker === state.winningTicker)
    .reduce((total, claim) => total + (claim.pointsAwarded ?? 0), 0);
  const winningTickerPoints = state.claims
    .filter(
      (claim) =>
        claim.accepted && claim.claimant.ticker === state.winningTicker,
    )
    .reduce((total, claim) => total + (claim.pointsAwarded ?? 0), 0);
  const eligibleAmount = isStockPotVersion
    ? playerWinningPoints
    : isAirtimeVersion
      ? playerRawSeconds
      : legacyEligibleSeconds;
  const eligibleTotal = isStockPotVersion
    ? winningTickerPoints
    : isAirtimeVersion
      ? totalRawSeconds
      : legacyTotalSeconds;
  const stockOrAirtimeReward =
    eligibleTotal > 0
      ? (state.potUsd * 0.3 * eligibleAmount) / eligibleTotal
      : 0;
  const receiptReward =
    (isWinner ? state.potUsd * 0.5 : 0) + stockOrAirtimeReward;
  const highlights = deriveHighlights(state);
  const achievements = deriveAchievements(state).filter(
    (item) =>
      player === "demo" || item.player.toLowerCase() === player.toLowerCase(),
  );
  const largestCall = Math.max(
    0,
    ...state.claims.map((claim) => claim.usdgAmount ?? 0),
  );
  const flips = highlights.filter((item) => item.kind === "TICKER_FLIP").length;
  const finalCall = state.claims.filter((claim) => claim.accepted).at(-1);

  return (
    <div className="receiptPage">
      <article className="receiptCard">
        <div className="receiptTop">
          <span>SAVED BY THE BELL</span>
          <strong>ROUND {roundId}</strong>
          <span>FINAL TAPE</span>
        </div>
        <div className="receiptHero">
          <Image
            src="/brand/saved-bell-mascot-settled.png"
            alt=""
            width={210}
            height={210}
          />
          <span className="eyebrow">
            {isWinner
              ? "FINAL HOLDER"
              : isStockPotVersion
                ? "STOCK POT CALLER"
                : "AIRTIME CALLER"}
          </span>
          <h1>
            {isWinner ? "Bag secured.\nBell kept." : "Cooked.\nStill on tape."}
          </h1>
          <p>
            {isWinner
              ? `${state.holder?.displayName} held the last accepted bell.`
              : `${shortAddress(player)} appeared in the trenches.`}
          </p>
        </div>
        <div className="receiptAmount">
          <span>ESTIMATED SETTLED BASKET VALUE</span>
          <strong>{formatUsd(receiptReward)}</strong>
        </div>
        <dl className="receiptDetails">
          <div>
            <dt>Round</dt>
            <dd>#{roundId}</dd>
          </div>
          <div>
            <dt>Ticker on air</dt>
            <dd>{isWinner ? state.holder?.ticker : "—"}</dd>
          </div>
          <div>
            <dt>
              {isStockPotVersion ? "Accepted contribution" : "Locked score"}
            </dt>
            <dd>
              {isWinner
                ? isStockPotVersion
                  ? `${formatUsd(finalCall?.usdgAmount ?? 0)} · ${((finalCall?.multiplierBps ?? 10_000) / 10_000).toFixed(2)}×`
                  : `${state.holder?.band} · ${((state.holder?.multiplierBps ?? 10_000) / 10_000).toFixed(2)}×`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>
              {isStockPotVersion ? "Winning Stock points" : "Eligible seconds"}
            </dt>
            <dd>
              {eligibleAmount.toLocaleString()} /{" "}
              {eligibleTotal.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>Closing Print Crown</dt>
            <dd>{state.winningTicker ?? "—"}</dd>
          </div>
          <div>
            <dt>Final pot</dt>
            <dd>{formatUsd(state.potUsd)}</dd>
          </div>
          <div>
            <dt>Largest ape</dt>
            <dd>{formatUsd(largestCall)}</dd>
          </div>
          <div>
            <dt>Stock flips</dt>
            <dd>{flips}</dd>
          </div>
          <div>
            <dt>Last-call timing</dt>
            <dd>
              {finalCall
                ? `${finalCall.timeAfterSeconds.toFixed(1)}s left`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Tape status</dt>
            <dd>{state.phase.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Chain</dt>
            <dd>{state.chainId ?? "SIM"}</dd>
          </div>
          <div>
            <dt>Block</dt>
            <dd>{state.blockNumber ?? "SIM"}</dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>
              {state.contractAddress
                ? shortAddress(state.contractAddress)
                : "LOCAL"}
            </dd>
          </div>
        </dl>
        {achievements.length ? (
          <div className="achievementBadges">
            {achievements.map((achievement) => (
              <span key={achievement.id}>{achievement.title}</span>
            ))}
          </div>
        ) : null}
        <OnchainVerification
          state={state}
          playerNumerator={eligibleAmount}
          totalDenominator={eligibleTotal}
        />
        <div className="receiptRip" aria-hidden="true" />
      </article>
      <div className="receiptActions">
        <ShareReceipt />
        <Link
          className="secondaryAction linkAction"
          href={`/replay/${roundId}`}
        >
          WATCH THE TAPE
        </Link>
      </div>
      {mode === "testnet" || mode === "mainnet" ? (
        <RoundRewardPanel state={state} />
      ) : null}
      <p className="receiptDisclaimer">
        {mode === "testnet"
          ? "Testnet receipt. Test tokens have no monetary value."
          : mode === "mainnet"
            ? "Onchain receipt. Verify every amount against the linked contracts and transactions."
            : "Devnet receipt. No real asset, payout, or brokerage position exists."}
      </p>
    </div>
  );
}
