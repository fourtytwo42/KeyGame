"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  demoAddresses,
  formatUsd,
  roundConfig,
  sessionApproval,
} from "@/lib/game/constants";
import { scenarioIds, scenarios, tickerById } from "@/lib/game/scenarios";
import { claimBell, leadingTicker, settle, tick } from "@/lib/game/simulator";
import type {
  ClaimableBalances,
  RoundState,
  SessionBudget,
  SimulationScenarioId,
  TickerId,
} from "@/lib/game/types";
import { useWalletGame } from "@/lib/web3/use-wallet-game";

type ActionStatus = "idle" | "submitted" | "accepted" | "rejected";
const devnetMode = process.env.NEXT_PUBLIC_GAME_MODE === "devnet";

function cloneState(state: RoundState): RoundState {
  return structuredClone(state);
}

export function LiveGame({
  initialScenario = "live",
}: {
  initialScenario?: SimulationScenarioId;
}) {
  const [scenario, setScenario] =
    useState<SimulationScenarioId>(initialScenario);
  const [state, setState] = useState(() =>
    cloneState(scenarios[initialScenario].state),
  );
  const [selectedTicker, setSelectedTicker] = useState<TickerId>("NVDA");
  const [guestSession, setGuestSession] = useState<SessionBudget | null>(null);
  const [guestClaimable, setGuestClaimable] = useState<ClaimableBalances>({
    holderUsd: 0,
    closingPrintUsd: 0,
    refundUsd: 0,
  });
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [announcement, setAnnouncement] = useState(
    "Live broadcast synchronized.",
  );
  const walletGame = useWalletGame(state.contractAddress);
  const activeSession = walletGame.isConnected
    ? walletGame.session
    : guestSession;
  const activeClaimable = walletGame.isConnected
    ? walletGame.claimable
    : guestClaimable;

  const loadScenario = (nextScenario: SimulationScenarioId) => {
    setScenario(nextScenario);
    setState(cloneState(scenarios[nextScenario].state));
    setActionStatus("idle");
    setAnnouncement(`${scenarios[nextScenario].label} loaded.`);
  };

  const refreshDevnet = async (signal?: AbortSignal) => {
    const response = await fetch("/api/devnet/snapshot", {
      cache: "no-store",
      signal,
    });
    const payload = (await response.json()) as {
      ok: boolean;
      state?: RoundState;
      session?: SessionBudget;
      claimable?: ClaimableBalances;
      error?: string;
    };
    if (!response.ok || !payload.state) {
      throw new Error(payload.error || "Local chain snapshot failed");
    }
    setState(payload.state);
    if (payload.session) {
      setGuestSession(payload.session);
      if (payload.session.starterTicker) {
        setSelectedTicker(payload.session.starterTicker);
      }
    }
    if (payload.claimable) setGuestClaimable(payload.claimable);
  };

  useEffect(() => {
    if (!devnetMode) return;
    const controller = new AbortController();
    const synchronize = async () => {
      try {
        await refreshDevnet(controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) => ({ ...current, freshness: "offline" }));
        setAnnouncement(
          error instanceof Error ? error.message : "Local chain is offline.",
        );
      }
    };
    void synchronize();
    const poller = window.setInterval(() => void synchronize(), 1000);
    return () => {
      controller.abort();
      window.clearInterval(poller);
    };
  }, []);

  useEffect(() => {
    if (devnetMode || (state.phase !== "live" && state.phase !== "rug")) return;
    const timer = window.setInterval(() => {
      setState((current) => {
        const next = tick(current);
        if (next.phase !== current.phase) {
          setAnnouncement(
            next.phase === "rug"
              ? "Rug Zone. Claims no longer add time."
              : "The clock hit zero. Checking the tape.",
          );
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "finalizing") return;
    const timer = window.setTimeout(() => {
      if (devnetMode) {
        void fetch("/api/devnet/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "finalize" }),
        })
          .then((response) => response.json())
          .then((payload: { state?: RoundState; error?: string }) => {
            if (!payload.state) {
              throw new Error(payload.error || "Settlement failed");
            }
            setState(payload.state);
            setAnnouncement("Settlement confirmed on chain 31337.");
          })
          .catch((error: unknown) => {
            setAnnouncement(
              error instanceof Error ? error.message : "Settlement failed.",
            );
          });
      } else {
        setState((current) => settle(current));
        setAnnouncement("Settlement confirmed. The final holder wins.");
      }
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [state.phase]);

  const requestDevnetAction = async (
    action:
      | "enter"
      | "claim"
      | "finalize"
      | "revoke"
      | "claim-holder"
      | "claim-print"
      | "claim-refund",
    ticker = selectedTicker,
  ) => {
    try {
      const response = await fetch("/api/devnet/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ticker }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        state?: RoundState;
        session?: SessionBudget;
        claimable?: ClaimableBalances;
        error?: string;
      };
      if (!response.ok || !payload.state) {
        throw new Error(payload.error || "Local chain rejected the call");
      }
      setState(payload.state);
      if (payload.session) setGuestSession(payload.session);
      if (payload.claimable) setGuestClaimable(payload.claimable);
      setActionStatus("accepted");
      setAnnouncement(
        action === "enter"
          ? `${ticker} is on air. Reusable USDG approval active.`
          : action === "claim"
            ? `Claim accepted on chain 31337. ${ticker} is on air.`
            : action.startsWith("claim-")
              ? "Pull-payment claim confirmed on chain 31337."
              : action === "revoke"
                ? "Round session revoked. No further claims are authorized."
                : "Settlement confirmed on chain 31337.",
      );
      window.setTimeout(() => setActionStatus("idle"), 1500);
    } catch (error) {
      setActionStatus("rejected");
      setAnnouncement(
        error instanceof Error ? error.message : "Local chain call failed.",
      );
      window.setTimeout(() => setActionStatus("idle"), 1800);
    }
  };

  const takeBell = (ticker: TickerId) => {
    setSelectedTicker(ticker);
    if (actionStatus === "submitted") return;
    setActionStatus("submitted");
    setAnnouncement(
      devnetMode
        ? "Claim submitted to local chain 31337."
        : "Claim submitted. Waiting for the local tape.",
    );
    if (devnetMode) {
      if (walletGame.isConnected) {
        void walletGame
          .claim(ticker)
          .then(() => refreshDevnet())
          .then(() => {
            setActionStatus("accepted");
            setAnnouncement("Claim accepted from your connected wallet.");
          })
          .catch((error: unknown) => {
            setActionStatus("rejected");
            setAnnouncement(
              `${
                error instanceof Error ? error.message : "Claim rejected."
              } The $1 game fee was not charged; network gas may have been spent.`,
            );
          });
      } else {
        void requestDevnetAction("claim", ticker);
      }
      return;
    }
    window.setTimeout(() => {
      setState((current) => {
        const result = claimBell(current, {
          address: demoAddresses.player,
          displayName: "you.local",
          ticker,
          band: tickerById(ticker).currentBand,
          multiplierBps: tickerById(ticker).multiplierBps,
          verifiedPrice: tickerById(ticker).currentPrice,
          reportTimestamp: Math.floor(Date.now() / 1000),
          producerPass: true,
        });
        setActionStatus(result.event.accepted ? "accepted" : "rejected");
        setAnnouncement(
          result.event.accepted
            ? `Claim accepted. ${ticker} is on air.`
            : `Claim rejected. ${result.event.reason}.`,
        );
        window.setTimeout(() => setActionStatus("idle"), 1500);
        return result.state;
      });
    }, 450);
  };

  const enterRound = async () => {
    setActionStatus("submitted");
    setAnnouncement(
      `Putting ${selectedTicker} on air with a reusable USDG approval.`,
    );
    if (devnetMode) {
      if (walletGame.isConnected) {
        try {
          await walletGame.enter(selectedTicker);
          await refreshDevnet();
          setActionStatus("accepted");
          setAnnouncement(
            `${selectedTicker} is on air from your connected wallet.`,
          );
        } catch (error) {
          setActionStatus("rejected");
          setAnnouncement(
            error instanceof Error ? error.message : "Entry rejected.",
          );
        }
      } else {
        await requestDevnetAction("enter", selectedTicker);
      }
      return;
    }
    setState(
      (current) =>
        claimBell(current, {
          address: demoAddresses.player,
          displayName: "you.local",
          ticker: selectedTicker,
          band: tickerById(selectedTicker).currentBand,
          multiplierBps: tickerById(selectedTicker).multiplierBps,
          verifiedPrice: tickerById(selectedTicker).currentPrice,
          reportTimestamp: Math.floor(Date.now() / 1000),
          producerPass: true,
        }).state,
    );
    setGuestSession({
      player: demoAddresses.player,
      starterTicker: selectedTicker,
      maximumUsd: sessionApproval.amountUsd,
      spentUsd: 1,
      remainingUsd: sessionApproval.amountUsd - 1,
      availableActions: sessionApproval.amountUsd - 1,
      allowanceUsd: sessionApproval.amountUsd,
      expiresAt: null,
      status: "active",
      mode: "devnet-guest",
      producerPass: true,
    });
    setActionStatus("accepted");
    setAnnouncement(`${selectedTicker} is on air. Bell stolen for $1.`);
  };

  const tickerLeader = leadingTicker(state);
  const joined = activeSession?.status === "active";
  const isCurrentHolder =
    (
      activeSession?.player ?? (!devnetMode ? demoAddresses.player : undefined)
    )?.toLowerCase() === state.holder?.address.toLowerCase();
  const entryRequired =
    state.freshness === "live" &&
    (state.phase === "entry" ||
      (devnetMode &&
        (state.phase === "live" || state.phase === "rug") &&
        (!activeSession || activeSession.status === "new")));
  const canAct =
    state.freshness === "live" &&
    (state.phase === "live" || state.phase === "rug") &&
    Boolean(devnetMode ? joined : true) &&
    !isCurrentHolder &&
    Boolean(devnetMode ? (activeSession?.availableActions ?? 0) > 0 : true);

  return (
    <>
      <div className="scenarioBar" aria-label="Local development source">
        {devnetMode ? (
          <>
            <span>LIVE SOURCE:</span>
            <strong>ANVIL · CHAIN 31337 · AUTOMINE</strong>
          </>
        ) : (
          <>
            <span>LOCAL TAPE:</span>
            {scenarioIds.map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={scenario === id}
                onClick={() => loadScenario(id)}
              >
                {scenarios[id].label}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="broadcastGrid">
        <aside className="sideRail leftRail" aria-label="Round briefing">
          <section className="railCard ruleCard">
            <span className="railLabel">THE WHOLE GAME</span>
            <ol>
              <li>
                <strong>Pick a stock.</strong>
                <span>Choose what goes on air now.</span>
              </li>
              <li>
                <strong>Pay $1.</strong>
                <span>Start the clock or take the bell.</span>
              </li>
              <li>
                <strong>Hold at zero.</strong>
                <span>Win half of the pot.</span>
              </li>
            </ol>
          </section>
          <ClosingPrintBoard state={state} leader={tickerLeader} />
        </aside>

        <section className={`broadcastArena phase-${state.phase}`}>
          <div className="lowerThird">
            <span>ROUND {state.roundId ?? roundConfig.roundId}</span>
            <strong>{formatUsd(state.potUsd)} POT</strong>
            <span className={`signalState signal-${state.freshness}`}>
              {state.freshness === "live" ? "LIVE DATA" : state.freshness}
            </span>
          </div>

          {state.freshness === "offline" ? (
            <DeadAir />
          ) : entryRequired ? (
            <EntryDesk
              selected={selectedTicker}
              onSelect={setSelectedTicker}
              onEnter={enterRound}
              status={actionStatus}
              walletConnected={walletGame.isConnected}
            />
          ) : state.phase === "cancelled" ? (
            <CancelledRound
              state={state}
              refundUsd={activeClaimable.refundUsd}
              onClaim={() =>
                walletGame.isConnected
                  ? void walletGame.claimReward("refund")
                  : void requestDevnetAction("claim-refund")
              }
            />
          ) : state.phase === "finalizing" ? (
            <Finalizing state={state} />
          ) : state.phase === "settled" ? (
            <FinalTransmission
              state={state}
              claimable={activeClaimable}
              onClaim={(kind) =>
                walletGame.isConnected
                  ? void walletGame.claimReward(kind)
                  : void requestDevnetAction(
                      kind === "holder" ? "claim-holder" : "claim-print",
                    )
              }
            />
          ) : (
            <LiveArena
              state={state}
              actionStatus={
                actionStatus === "accepted" && !isCurrentHolder
                  ? "idle"
                  : actionStatus
              }
              canAct={canAct}
              takeBell={takeBell}
              session={activeSession}
            />
          )}

          <div className="mobileClosingPrint">
            <ClosingPrintBoard state={state} leader={tickerLeader} />
          </div>

          <div className="newsCrawl" aria-hidden="true">
            <div>
              <span>NO CHARTS WERE HARMED IN THIS BROADCAST</span>
              <span>ONE DOLLAR CHANGES THE CALLER</span>
              <span>RUG ZONE ADDS ZERO SECONDS</span>
              <span>THE CHAIN SETTLES THE TAPE</span>
            </div>
          </div>
          <p className="srOnly" aria-live="polite">
            {announcement}
          </p>
        </section>

        <aside className="sideRail rightRail" aria-label="Broadcast activity">
          <SessionPanel
            session={activeSession}
            connected={walletGame.isConnected}
            onRevoke={() =>
              walletGame.isConnected
                ? void walletGame.revoke()
                : void requestDevnetAction("revoke")
            }
          />
          <Trenches state={state} />
          <section className="railCard nextCard">
            <span className="railLabel">NEXT TRANSMISSION</span>
            <strong>
              ROUND {Number(state.roundId ?? roundConfig.roundId) + 1}
            </strong>
            <span>Four fresh tickers. Same bad instincts.</span>
            <Link href="/rules">READ THE FINE PRINT →</Link>
          </section>
        </aside>
      </div>
    </>
  );
}

function EntryDesk({
  selected,
  onSelect,
  onEnter,
  status,
  walletConnected,
}: {
  selected: TickerId;
  onSelect: (id: TickerId) => void;
  onEnter: () => void;
  status: ActionStatus;
  walletConnected: boolean;
}) {
  return (
    <div className="entryDesk">
      <div className="segmentTitle">
        <span>OPEN PHONE LINES</span>
        <h1>Pick the first print</h1>
        <p>Your first $1 call starts the 45-second broadcast clock.</p>
      </div>
      <div
        className="entryClock"
        aria-label="Broadcast clock ready at 45 seconds"
      >
        <strong>00:45</strong>
        <span>BROADCAST CLOCK</span>
        <small>WAITING · FIRST $1 STARTS IT</small>
      </div>
      <div className="factionGrid">
        {roundConfig.tickers.map((ticker) => (
          <button
            type="button"
            className="factionChoice"
            data-selected={selected === ticker.id}
            style={
              {
                "--faction": ticker.color,
                "--faction-dark": ticker.secondary,
              } as React.CSSProperties
            }
            key={ticker.id}
            onClick={() => onSelect(ticker.id)}
          >
            <span className="tickerBadge">{ticker.id}</span>
            <strong>
              {ticker.currentBand} ·{" "}
              {(ticker.multiplierBps / 10_000).toFixed(2)}×
            </strong>
            <small>
              #{ticker.volatilityRank} HEAT ·{" "}
              {(
                ((ticker.currentPrice - ticker.openingPrice) /
                  ticker.openingPrice) *
                100
              ).toFixed(2)}
              % · PRODUCER PASS
            </small>
          </button>
        ))}
      </div>
      <div className="entryTerms">
        <span>TIMER WAITS FOR YOU</span>
        <span>$1 PER CALL</span>
        <span>ONE APPROVAL</span>
        <span>REVOKE ANY TIME</span>
      </div>
      <button
        type="button"
        className="primaryAction"
        onClick={onEnter}
        disabled={status === "submitted"}
      >
        {status === "submitted"
          ? "TUNING THE LINE…"
          : `ENTER WITH ${selected} · $1`}
      </button>
      <p className="actionFinePrint">
        {walletConnected
          ? `Approves ${formatUsd(sessionApproval.amountUsd)} play USDG only when allowance is below ${formatUsd(sessionApproval.refreshBelowUsd)}. You can change or revoke it in your wallet.`
          : `Devnet guest mode uses the same ${formatUsd(sessionApproval.amountUsd)} reusable play-USDG approval. No real value is used.`}
      </p>
    </div>
  );
}

function LiveArena({
  state,
  actionStatus,
  canAct,
  takeBell,
  session,
}: {
  state: RoundState;
  actionStatus: ActionStatus;
  canAct: boolean;
  takeBell: (ticker: TickerId) => void;
  session: SessionBudget | null;
}) {
  const ticker = state.holder ? tickerById(state.holder.ticker) : null;
  const clockLabel = state.phase === "rug" ? "RUG ZONE" : "BROADCAST CLOCK";
  return (
    <div className="liveStage">
      <div className="phaseBug">
        {state.phase === "rug"
          ? "⚠ FINAL CALLS / NO MORE TIME"
          : "BELL IS LIVE"}
      </div>
      <div className="clockAssembly">
        <span>{clockLabel}</span>
        <strong aria-label={`${state.timeLeftSeconds} seconds remaining`}>
          00:{state.timeLeftSeconds.toString().padStart(2, "0")}
        </strong>
        <small>HARD STOP {state.hardTimeLeftSeconds}s</small>
      </div>
      <div className="callerCard">
        <span className="callerLabel">CALLER HOLDING THE BELL</span>
        <div className="callerVisual">
          <Image
            src="/brand/last-bell-mascot.png"
            alt="An anxious bell tied to a market bag"
            width={210}
            height={210}
            priority
          />
          <div>
            <span
              className="tickerBadge large"
              style={{ background: ticker?.color }}
            >
              {state.holder?.ticker ?? "—"}
            </span>
            <strong>{state.holder?.displayName ?? "Nobody has called"}</strong>
            <small>
              CLAIM #{state.holder?.claimNumber ?? 0} ·{" "}
              {state.holder?.band ?? "FLAT"} ·{" "}
              {((state.holder?.multiplierBps ?? 10_000) / 10_000).toFixed(2)}×
            </small>
          </div>
        </div>
      </div>
      <div className="miniFactionSwitch" aria-label="Producer status">
        <span>PRODUCER PASS</span>
        <strong>
          {session?.producerPass ? "ACTUALLY HOLDS THE BAG" : "OPEN CALLER"}
        </strong>
        <small>
          {formatUsd(session?.remainingUsd ?? 0)} APPROVED ·{" "}
          {session?.availableActions ?? 0} CALLS
        </small>
      </div>
      <div className="claimTickerGrid" aria-label="Put a stock on air">
        {roundConfig.tickers.map((slot) => (
          <button
            className="primaryAction apeButton"
            type="button"
            key={slot.id}
            disabled={!canAct || actionStatus === "submitted"}
            onClick={() => takeBell(slot.id)}
            style={{ "--faction": slot.color } as React.CSSProperties}
          >
            {actionStatus === "submitted"
              ? "CALLING…"
              : `PUT ${slot.id} ON AIR · $1`}
            <small>
              {slot.currentBand} · {(slot.multiplierBps / 10_000).toFixed(2)}×
            </small>
          </button>
        ))}
      </div>
      <p className="actionFinePrint">
        {state.phase === "rug"
          ? "A successful claim changes the holder but adds no time."
          : "A successful claim changes the holder and adds 2 seconds."}
      </p>
    </div>
  );
}

function ClosingPrintBoard({
  state,
  leader,
}: {
  state: RoundState;
  leader: TickerId;
}) {
  const max = Math.max(
    ...state.tickerScores.map((score) => score.weightedScore),
    1,
  );
  return (
    <section className="railCard airtimeCard">
      <span className="railLabel">THE CLOSING PRINT · 30% POOL</span>
      {state.tickerScores.map((score) => {
        const ticker = tickerById(score.ticker);
        return (
          <div className="airtimeRow" key={score.ticker}>
            <span>
              <strong>{score.ticker}</strong>
              {leader === score.ticker ? <small> LEADS</small> : null}
            </span>
            <div className="airtimeTrack">
              <i
                style={{
                  width: `${(score.weightedScore / max) * 100}%`,
                  background: ticker.color,
                }}
              />
            </div>
            <b>{score.weightedScore.toFixed(1)}pt</b>
          </div>
        );
      })}
    </section>
  );
}

function Trenches({ state }: { state: RoundState }) {
  const recent = useMemo(
    () => [...state.claims].reverse().slice(0, 5),
    [state],
  );
  return (
    <section className="railCard trenchesCard">
      <span className="railLabel">LIVE FROM THE TRENCHES</span>
      <div className="trenchesList">
        {recent.length ? (
          recent.map((claim) => (
            <div className="trenchEvent" key={claim.id}>
              <span
                className="eventDot"
                style={{
                  background: tickerById(claim.claimant.ticker).color,
                }}
              />
              <p>
                <strong>{claim.claimant.displayName}</strong>
                <span>
                  {claim.accepted
                    ? ` PUT ${claim.claimant.ticker} ON AIR · ${claim.marketBand} ${(claim.multiplierBps / 10_000).toFixed(2)}×`
                    : ` got bounced: ${claim.reason}`}
                </span>
              </p>
              <time>{claim.timeAfterSeconds}s</time>
            </div>
          ))
        ) : (
          <p className="emptyTape">Phone lines are quiet. Suspicious.</p>
        )}
      </div>
    </section>
  );
}

function Finalizing({ state }: { state: RoundState }) {
  return (
    <div className="stateInterstitial">
      <div className="testPattern" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <span className="eyebrow">PLEASE STAND BY</span>
      <h1>Checking the tape</h1>
      <p>
        The clock is frozen at zero. We are confirming the final accepted claim
        before naming a winner.
      </p>
      <strong>{state.holder?.displayName ?? "No final holder"}</strong>
    </div>
  );
}

function FinalTransmission({
  state,
  claimable,
  onClaim,
}: {
  state: RoundState;
  claimable: ClaimableBalances;
  onClaim: (kind: "holder" | "print") => void;
}) {
  const holderPayout = state.pools?.holderUsd ?? state.potUsd * 0.5;
  const printPayout = state.pools?.closingPrintUsd ?? state.potUsd * 0.3;
  const nextRound = state.pools?.nextRoundUsd ?? state.potUsd * 0.15;
  const protocol = state.pools?.protocolUsd ?? state.potUsd * 0.05;
  return (
    <div className="finalTransmission">
      <span className="phaseBug">FINAL TRANSMISSION</span>
      <Image
        src="/brand/last-bell-mascot.png"
        alt=""
        width={190}
        height={190}
      />
      <span className="eyebrow">LAST CALLER STANDING</span>
      <h1>{state.holder?.displayName}</h1>
      <p className="winnerLine">BAG SECURED. BELL KEPT.</p>
      <div className="winnerSummary">
        <div className="payoutTape">
          <span>FINAL HOLDER · 50%</span>
          <strong>{formatUsd(holderPayout)}</strong>
        </div>
        <div className="payoutTape">
          <span>CLOSING PRINT · 30%</span>
          <strong>
            {state.winningTicker ?? "—"} · {formatUsd(printPayout)}
          </strong>
        </div>
      </div>
      <div className="poolBreakdown">
        <span>NEXT ROUND · {formatUsd(nextRound)}</span>
        <span>PROTOCOL · {formatUsd(protocol)}</span>
      </div>
      {typeof state.nextRoundStartsInSeconds === "number" ? (
        <p className="nextRoundNotice" role="status">
          NEXT BROADCAST STARTS AUTOMATICALLY IN{" "}
          {state.nextRoundStartsInSeconds}s
        </p>
      ) : null}
      {claimable.holderUsd > 0 || claimable.closingPrintUsd > 0 ? (
        <div className="claimActions">
          {claimable.holderUsd > 0 ? (
            <button
              type="button"
              className="secondaryAction"
              onClick={() => onClaim("holder")}
            >
              CLAIM HOLDER {formatUsd(claimable.holderUsd)}
            </button>
          ) : null}
          {claimable.closingPrintUsd > 0 ? (
            <button
              type="button"
              className="secondaryAction"
              onClick={() => onClaim("print")}
            >
              CLAIM CLOSING PRINT {formatUsd(claimable.closingPrintUsd)}
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="proofLine">
        ROUND CONTRACT {state.contractAddress?.slice(0, 8) ?? "SIM"}… · BLOCK{" "}
        {state.blockNumber}
      </p>
    </div>
  );
}

function CancelledRound({
  state,
  refundUsd,
  onClaim,
}: {
  state: RoundState;
  refundUsd: number;
  onClaim: () => void;
}) {
  return (
    <div className="stateInterstitial cancelledRound">
      <span className="eyebrow">TRANSMISSION CANCELLED</span>
      <h1>No winner was declared</h1>
      <p>
        {state.cancellationReason ||
          "The operator cancelled this round under the published incident rules."}
      </p>
      <div className="payoutTape">
        <span>YOUR ACCEPTED GAME FEES</span>
        <strong>{formatUsd(refundUsd)}</strong>
      </div>
      <p>
        Network gas is separate and cannot be refunded by the game contract.
      </p>
      <button
        type="button"
        className="primaryAction"
        disabled={refundUsd <= 0}
        onClick={onClaim}
      >
        {refundUsd > 0
          ? `CLAIM ${formatUsd(refundUsd)} REFUND`
          : "NO REFUND DUE"}
      </button>
    </div>
  );
}

function SessionPanel({
  session,
  connected,
  onRevoke,
}: {
  session: SessionBudget | null;
  connected: boolean;
  onRevoke: () => void;
}) {
  return (
    <section className="railCard sessionPanel">
      <span className="railLabel">ROUND SESSION</span>
      {session && session.status !== "new" ? (
        <>
          <div className="sessionHeadline">
            <strong>
              {session.producerPass ? "PRODUCER PASS" : "OPEN CALLER"}
            </strong>
            <span data-status={session.status}>{session.status}</span>
          </div>
          <dl>
            <div>
              <dt>APPROVED</dt>
              <dd>{formatUsd(session.maximumUsd)}</dd>
            </div>
            <div>
              <dt>SPENT</dt>
              <dd>{formatUsd(session.spentUsd)}</dd>
            </div>
            <div>
              <dt>ALLOWANCE</dt>
              <dd>{formatUsd(session.remainingUsd)}</dd>
            </div>
            <div>
              <dt>CALLS</dt>
              <dd>{session.availableActions}</dd>
            </div>
          </dl>
          {session.status === "active" ? (
            <button type="button" className="textButton" onClick={onRevoke}>
              REVOKE USDG APPROVAL
            </button>
          ) : null}
        </>
      ) : (
        <p className="emptyTape">
          READY · {connected ? "CHOOSE A TICKER" : "GUEST OR WALLET"}
        </p>
      )}
    </section>
  );
}

function DeadAir() {
  return (
    <div className="stateInterstitial deadAir">
      <div className="staticField" aria-hidden="true" />
      <span className="eyebrow">SIGNAL LOST</span>
      <h1>Dead air</h1>
      <p>
        The round feed is not trustworthy, so calls are disabled. Your wallet
        has not been touched.
      </p>
      <button
        type="button"
        className="secondaryAction"
        onClick={() => window.location.reload()}
      >
        RETUNE THE SIGNAL
      </button>
      <Link href="/status">Open system status →</Link>
    </div>
  );
}
