"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  PlayerRoundProjection,
  RoundState,
  SessionBudget,
  SimulationScenarioId,
  TickerId,
} from "@/lib/game/types";
import { useWalletGame } from "@/lib/web3/use-wallet-game";

type ActionStatus = "idle" | "submitted" | "accepted" | "rejected";
const gameMode = process.env.NEXT_PUBLIC_GAME_MODE || "simulator";
const devnetMode = gameMode === "devnet";
const chainMode =
  gameMode === "devnet" || gameMode === "testnet" || gameMode === "mainnet";

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
  const [amountUsd, setAmountUsd] = useState(10);
  const [guestSession, setGuestSession] = useState<SessionBudget | null>(null);
  const [guestClaimable, setGuestClaimable] = useState<ClaimableBalances>({
    holderUsd: 0,
    airtimeUsd: 0,
    refundUsd: 0,
  });
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle");
  const [playerProjection, setPlayerProjection] =
    useState<PlayerRoundProjection | null>(null);
  const [announcement, setAnnouncement] = useState(
    "Live broadcast synchronized.",
  );
  const activeRoundIdentity = useRef(
    `${state.contractAddress?.toLowerCase() ?? "none"}:${state.roundId}`,
  );
  const walletGame = useWalletGame(
    state.contractAddress,
    state.contractVersion,
  );
  const v4Economy = state.contractVersion === "last-bell-v4-stock-pot";
  const activeSession = walletGame.isConnected
    ? walletGame.session
    : guestSession;
  const activeClaimable = walletGame.isConnected
    ? walletGame.claimable
    : guestClaimable;
  const effectiveTicker =
    state.tickerScores.find((score) => score.ticker === selectedTicker)
      ?.ticker ??
    state.tickerScores[0]?.ticker ??
    selectedTicker;

  const loadScenario = (nextScenario: SimulationScenarioId) => {
    setScenario(nextScenario);
    setState(cloneState(scenarios[nextScenario].state));
    setActionStatus("idle");
    setAnnouncement(`${scenarios[nextScenario].label} loaded.`);
  };

  const refreshChain = async (signal?: AbortSignal) => {
    const response = await fetch("/api/game/snapshot", {
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
      throw new Error(payload.error || "Chain snapshot failed");
    }
    const nextRoundIdentity = `${payload.state.contractAddress?.toLowerCase() ?? "none"}:${payload.state.roundId}`;
    if (nextRoundIdentity !== activeRoundIdentity.current) {
      activeRoundIdentity.current = nextRoundIdentity;
      setActionStatus("idle");
      setAnnouncement("Live broadcast synchronized.");
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
    if (!chainMode) return;
    const controller = new AbortController();
    const synchronize = async () => {
      try {
        await refreshChain(controller.signal);
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
    if (!walletGame.address || !chainMode) {
      const clear = window.setTimeout(() => setPlayerProjection(null), 0);
      return () => window.clearTimeout(clear);
    }
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/players/${walletGame.address}/round-projection`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          projection?: PlayerRoundProjection;
        };
        if (payload.projection) setPlayerProjection(payload.projection);
      } catch {
        // The public game remains usable when a wallet projection is unavailable.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [walletGame.address, state.roundId]);

  useEffect(() => {
    if (chainMode || (state.phase !== "live" && state.phase !== "rug")) return;
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
      } else if (!chainMode) {
        setState((current) => settle(current));
        setAnnouncement("Settlement confirmed. The final holder wins.");
      } else {
        setAnnouncement("The keeper is confirming the final tape.");
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
    ticker = effectiveTicker,
    amount = amountUsd,
  ) => {
    try {
      const response = await fetch("/api/devnet/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ticker, amountUsd: amount }),
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
      chainMode
        ? "Claim submitted to the active chain."
        : "Claim submitted. Waiting for the local tape.",
    );
    if (chainMode) {
      if (walletGame.isConnected) {
        void walletGame
          .claim(ticker, amountUsd)
          .then(() => refreshChain())
          .then(() => {
            setActionStatus("accepted");
            setAnnouncement("Claim accepted from your connected wallet.");
          })
          .catch((error: unknown) => {
            setActionStatus("rejected");
            setAnnouncement(
              `${error instanceof Error ? error.message : "Claim rejected."} ${
                v4Economy
                  ? "The selected contribution was not charged"
                  : "The $1 game fee was not charged"
              }; network gas may have been spent.`,
            );
          });
      } else if (devnetMode) {
        void requestDevnetAction("claim", ticker, amountUsd);
      } else {
        setActionStatus("rejected");
        setAnnouncement("Connect the testnet wallet before taking the bell.");
      }
      return;
    }
    window.setTimeout(() => {
      setState((current) => {
        const result = claimBell(
          current,
          {
            address: demoAddresses.player,
            displayName: "you.local",
            ticker,
            band: tickerById(ticker).currentBand,
            multiplierBps: tickerById(ticker).multiplierBps,
            verifiedPrice: tickerById(ticker).currentPrice,
            reportTimestamp: Math.floor(Date.now() / 1000),
            producerPass: true,
          },
          amountUsd,
        );
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
      `Putting ${effectiveTicker} on air with a reusable USDG approval.`,
    );
    if (chainMode) {
      if (walletGame.isConnected) {
        try {
          await walletGame.enter(effectiveTicker, amountUsd);
          await refreshChain();
          setActionStatus("accepted");
          setAnnouncement(
            `${effectiveTicker} is on air from your connected wallet.`,
          );
        } catch (error) {
          setActionStatus("rejected");
          setAnnouncement(
            error instanceof Error ? error.message : "Entry rejected.",
          );
        }
      } else if (devnetMode) {
        await requestDevnetAction("enter", effectiveTicker, amountUsd);
      } else {
        setActionStatus("rejected");
        setAnnouncement("Connect the testnet wallet before entering.");
      }
      return;
    }
    setState(
      (current) =>
        claimBell(
          current,
          {
            address: demoAddresses.player,
            displayName: "you.local",
            ticker: effectiveTicker,
            band: tickerById(effectiveTicker).currentBand,
            multiplierBps: tickerById(effectiveTicker).multiplierBps,
            verifiedPrice: tickerById(effectiveTicker).currentPrice,
            reportTimestamp: Math.floor(Date.now() / 1000),
            producerPass: true,
          },
          amountUsd,
        ).state,
    );
    setGuestSession({
      player: demoAddresses.player,
      starterTicker: effectiveTicker,
      maximumUsd: sessionApproval.amountUsd,
      spentUsd: amountUsd,
      remainingUsd: Math.max(0, sessionApproval.amountUsd - amountUsd),
      availableActions: Math.max(0, sessionApproval.amountUsd - amountUsd),
      allowanceUsd: sessionApproval.amountUsd,
      expiresAt: null,
      status: "active",
      mode: "devnet-guest",
      producerPass: true,
    });
    setActionStatus("accepted");
    setAnnouncement(
      `${effectiveTicker} is on air. Bell stolen for ${formatUsd(amountUsd)}.`,
    );
  };

  const tickerLeader = leadingTicker(state);
  const joined = activeSession?.status === "active";
  const isCurrentHolder =
    (
      activeSession?.player ?? (!chainMode ? demoAddresses.player : undefined)
    )?.toLowerCase() === state.holder?.address.toLowerCase();
  const entryRequired = state.phase === "entry";
  const hasChainClaimPath = walletGame.isConnected
    ? walletGame.ready
    : devnetMode &&
      joined &&
      (v4Economy || (activeSession?.availableActions ?? 0) > 0);
  const canAct =
    state.freshness === "live" &&
    (state.phase === "live" || state.phase === "rug") &&
    !isCurrentHolder &&
    Boolean(chainMode ? hasChainClaimPath : true);

  return (
    <>
      <div className="scenarioBar" aria-label="Local development source">
        {chainMode ? (
          <>
            <span>LIVE SOURCE:</span>
            <strong>
              {devnetMode
                ? "ANVIL · CHAIN 31337 · AUTOMINE"
                : gameMode === "testnet"
                  ? "ROBINHOOD TESTNET · CHAIN 46630 · TEST TOKENS"
                  : "ROBINHOOD CHAIN · CHAIN 4663"}
            </strong>
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
                <span>
                  {v4Economy
                    ? "Choose what the pot buys."
                    : "Choose what goes on air now."}
                </span>
              </li>
              <li>
                <strong>{v4Economy ? "Choose an amount." : "Pay $1."}</strong>
                <span>
                  {v4Economy
                    ? "$1 minimum. No maximum."
                    : "Start the clock or take the bell."}
                </span>
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
              {state.freshness === "live" ? "LIVE DATA" : "CONNECTION DEGRADED"}
            </span>
          </div>

          {state.freshness === "offline" ? (
            <DeadAir />
          ) : entryRequired ? (
            <EntryDesk
              state={state}
              selected={effectiveTicker}
              onSelect={setSelectedTicker}
              onEnter={enterRound}
              status={actionStatus}
              walletConnected={walletGame.isConnected}
              amountUsd={amountUsd}
              onAmountChange={setAmountUsd}
              v4Economy={v4Economy}
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
              amountUsd={amountUsd}
              onAmountChange={setAmountUsd}
              v4Economy={v4Economy}
            />
          )}

          <div className="mobileClosingPrint">
            <ClosingPrintBoard state={state} leader={tickerLeader} />
          </div>

          <div className="newsCrawl" aria-hidden="true">
            <div>
              <span>NO CHARTS WERE HARMED IN THIS BROADCAST</span>
              <span>
                {v4Economy
                  ? "ANY AMOUNT CHANGES THE CALLER"
                  : "ONE DOLLAR CHANGES THE CALLER"}
              </span>
              <span>RUG ZONE ADDS ZERO SECONDS</span>
              <span>RUG ZONE IS FCFS</span>
              <span>AUTOMATED WALLETS MAY BE FASTER</span>
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
          <ProjectionPanel state={state} player={playerProjection} />
          <RaidPanel />
          <Trenches state={state} />
        </aside>
      </div>
    </>
  );
}

function AmountComposer({
  amountUsd,
  onChange,
}: {
  amountUsd: number;
  onChange: (amount: number) => void;
}) {
  return (
    <div className="amountComposer" aria-label="Contribution amount">
      <div className="amountPresets">
        {[1, 10, 100, 1_000].map((amount) => (
          <button
            type="button"
            key={amount}
            data-selected={amountUsd === amount}
            onClick={() => onChange(amount)}
          >
            {formatUsd(amount)}
          </button>
        ))}
      </div>
      <label>
        <span>USDG INPUT · $1 MINIMUM · NO MAXIMUM</span>
        <input
          type="number"
          min="1"
          step="1"
          value={amountUsd}
          onChange={(event) =>
            onChange(Math.max(1, Number(event.target.value) || 1))
          }
          inputMode="decimal"
        />
      </label>
    </div>
  );
}

function EntryDesk({
  state,
  selected,
  onSelect,
  onEnter,
  status,
  walletConnected,
  amountUsd,
  onAmountChange,
  v4Economy,
}: {
  state: RoundState;
  selected: TickerId;
  onSelect: (id: TickerId) => void;
  onEnter: () => void;
  status: ActionStatus;
  walletConnected: boolean;
  amountUsd: number;
  onAmountChange: (amount: number) => void;
  v4Economy: boolean;
}) {
  return (
    <div className="entryDesk">
      <div className="segmentTitle">
        <span>
          {v4Economy
            ? "STOCK POT"
            : state.marketMode === "DEX"
              ? "ONCHAIN MOMENTUM"
              : "FLAT ROUND · DEX HISTORY WARMING UP"}
        </span>
        <h1>
          {v4Economy ? "Pick a stock. Take the bell." : "Pick the first print"}
        </h1>
        <p>
          {v4Economy
            ? "Your buy starts the five-minute clock. The Stock Tokens go into this round's pot."
            : "Your first call starts the five-minute broadcast clock."}
        </p>
        {state.marketExplanation ? <p>{state.marketExplanation}</p> : null}
      </div>
      <div
        className="entryClock"
        aria-label="Broadcast clock ready at five minutes"
      >
        <strong>05:00</strong>
        <span>BROADCAST CLOCK</span>
        <small>
          {v4Economy
            ? "WAITING · FIRST CONTRIBUTION STARTS IT"
            : "WAITING · FIRST $1 STARTS IT"}
        </small>
      </div>
      <div className="factionGrid">
        {state.tickerScores.map((score, index) => {
          const ticker = tickerById(score.ticker);
          const band =
            state.marketMode === "FLAT"
              ? "FLAT"
              : (score.estimatedBand ?? score.currentBand);
          const multiplier =
            state.marketMode === "FLAT"
              ? 10_000
              : (score.estimatedMultiplierBps ?? score.multiplierBps);
          return (
            <button
              type="button"
              className="factionChoice"
              data-selected={selected === score.ticker}
              style={
                {
                  "--faction": ticker.color,
                  "--faction-dark": ticker.secondary,
                } as React.CSSProperties
              }
              key={score.ticker}
              onClick={() => onSelect(score.ticker)}
            >
              <span className="tickerBadge">{score.ticker}</span>
              <strong>
                {v4Economy
                  ? `${(score.multiplierBps / 10_000).toFixed(2)}× · ${(score.recentVolumeUsd ?? 0).toLocaleString()} 30S HEAT`
                  : `${state.marketMode === "DEX" ? "EST. " : ""}${band} · ${(multiplier / 10_000).toFixed(2)}×`}
              </strong>
              <small>
                {v4Economy
                  ? `${score.weightedScore.toLocaleString()} POINTS · ${(score.potTokenQuantity ?? 0).toLocaleString()} ${score.ticker} IN POT`
                  : `${score.currentPrice ? `10M TWAP ${formatUsd(score.currentPrice)}` : "10M TWAP WARMING UP"} · HEAT #${score.volatilityRank || index + 1} · 30M ${(score.realizedMovementBps ?? 0).toFixed(1)} BPS`}
              </small>
              <small>
                {gameMode === "testnet"
                  ? "TESTNET MOCK · NO VALUE"
                  : gameMode === "devnet"
                    ? "DEVNET MOCK · NO VALUE"
                    : gameMode === "mainnet"
                      ? "CANONICAL STOCK TOKEN"
                      : "SIMULATION · NO VALUE"}
              </small>
            </button>
          );
        })}
      </div>
      {v4Economy ? (
        <AmountComposer amountUsd={amountUsd} onChange={onAmountChange} />
      ) : null}
      <div className="entryTerms">
        <span>TIMER WAITS FOR YOU</span>
        <span>{v4Economy ? "$1 MIN · NO MAX" : "$1 PER CALL"}</span>
        <span>ONE APPROVAL</span>
        <span>REVOKE ANY TIME</span>
      </div>
      <button
        type="button"
        className="primaryAction"
        onClick={onEnter}
        disabled={status === "submitted" || state.freshness !== "live"}
      >
        {state.freshness !== "live"
          ? "CONNECTION DEGRADED · ACTIONS PAUSED"
          : status === "submitted"
            ? "TUNING THE LINE…"
            : v4Economy
              ? `APE ${formatUsd(amountUsd)} ON ${selected}`
              : `ENTER WITH ${selected} · $1`}
      </button>
      <p className="actionFinePrint">
        {v4Economy
          ? "One reusable approval. Your wallet can edit or revoke it. Quote protection reverts the whole call if the swap moves beyond your minimum."
          : walletConnected
            ? `Approves ${formatUsd(sessionApproval.amountUsd)} play USDG only when allowance is below ${formatUsd(sessionApproval.refreshBelowUsd)}. You can change or revoke it in your wallet.`
            : `${gameMode === "testnet" ? "The built-in testnet wallet" : "Devnet guest mode"} uses the same ${formatUsd(sessionApproval.amountUsd)} reusable play-USDG approval. No real value is used.`}
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
  amountUsd,
  onAmountChange,
  v4Economy,
}: {
  state: RoundState;
  actionStatus: ActionStatus;
  canAct: boolean;
  takeBell: (ticker: TickerId) => void;
  session: SessionBudget | null;
  amountUsd: number;
  onAmountChange: (amount: number) => void;
  v4Economy: boolean;
}) {
  const ticker = state.holder ? tickerById(state.holder.ticker) : null;
  const currentCall = [...state.claims]
    .reverse()
    .find(
      (claim) =>
        claim.accepted &&
        claim.claimant.address.toLowerCase() ===
          state.holder?.address.toLowerCase(),
    );
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
      {state.phase === "rug" ? (
        <div className="rugDisclosure" role="note">
          <strong>RUG ZONE IS FCFS</strong>
          <span>AUTOMATED WALLETS MAY BE FASTER</span>
          <span>LAST ACCEPTED CALL WINS 50%</span>
        </div>
      ) : null}
      <div className="callerCard">
        <span className="callerLabel">CALLER HOLDING THE BELL</span>
        <div className="callerVisual">
          <Image
            src="/brand/saved-bell-mascot.png"
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
            <strong>
              {state.holder?.profileHandle ? (
                <Link href={`/profile/${state.holder.profileHandle}`}>
                  {state.holder.displayName}
                </Link>
              ) : (
                (state.holder?.displayName ?? "Nobody has called")
              )}
            </strong>
            <small>
              {v4Economy
                ? `CALL #${state.holder?.claimNumber ?? 0} · ${formatUsd(currentCall?.usdgAmount ?? 0)} · ${(currentCall?.pointsAwarded ?? 0).toLocaleString()} PTS`
                : `CLAIM #${state.holder?.claimNumber ?? 0} · ${state.holder?.band ?? "FLAT"} · ${((state.holder?.multiplierBps ?? 10_000) / 10_000).toFixed(2)}×`}
            </small>
            {v4Economy && currentCall ? (
              <span className="earningRate">
                {currentCall.claimant.ticker} ·{" "}
                {(currentCall.multiplierBps / 10_000).toFixed(2)}× LOCKED ·{" "}
                {(currentCall.pointsAwarded ?? 0).toLocaleString()} PTS WON
              </span>
            ) : state.projection?.currentEarning || state.holder ? (
              <span className="earningRate">
                {state.projection?.currentEarning?.ticker ??
                  state.holder?.ticker}{" "}
                ·{" "}
                {(
                  state.projection?.currentEarning?.pointsPerSecond ??
                  (state.holder?.multiplierBps ?? 10_000) / 10_000
                ).toFixed(2)}{" "}
                PTS/SEC
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="miniFactionSwitch" aria-label="Producer status">
        <span>PRODUCER PASS</span>
        <strong>
          {session?.producerPass ? "ACTUALLY HOLDS THE BAG" : "OPEN CALLER"}
        </strong>
        <small>
          {v4Economy
            ? "REUSABLE APPROVAL · CUSTOM AMOUNTS"
            : `${formatUsd(session?.remainingUsd ?? 0)} APPROVED · ${session?.availableActions ?? 0} CALLS`}
        </small>
      </div>
      <div className="claimTickerGrid" aria-label="Put a stock on air">
        {v4Economy ? (
          <AmountComposer amountUsd={amountUsd} onChange={onAmountChange} />
        ) : null}
        {state.tickerScores.map((score) => {
          const slot = tickerById(score.ticker);
          return (
            <button
              className="primaryAction apeButton"
              type="button"
              key={score.ticker}
              disabled={!canAct || actionStatus === "submitted"}
              onClick={() => takeBell(score.ticker)}
              style={{ "--faction": slot.color } as React.CSSProperties}
            >
              {actionStatus === "submitted"
                ? "CALLING…"
                : v4Economy
                  ? `APE ${formatUsd(amountUsd)} ON ${score.ticker}`
                  : `PUT ${score.ticker} ON AIR · $1`}
              <small>
                {v4Economy
                  ? `${(score.multiplierBps / 10_000).toFixed(2)}× · ${(score.recentVolumeUsd ?? 0).toLocaleString()} HEAT · ${score.weightedScore.toLocaleString()} PTS`
                  : `${score.currentBand} · ${(score.multiplierBps / 10_000).toFixed(2)}× · ${score.weightedScore.toFixed(1)} POINTS`}
              </small>
            </button>
          );
        })}
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
  const v4Economy = state.contractVersion === "last-bell-v4-stock-pot";
  const max = Math.max(
    ...state.tickerScores.map((score) => score.weightedScore),
    1,
  );
  return (
    <section className="railCard airtimeCard">
      <span className="railLabel closingPrintLabel">
        <strong>
          {v4Economy ? "WINNING STOCK · 30%" : "CLOSING PRINT CROWN"}
        </strong>
        <small>
          {v4Economy
            ? "POINTS PICK THE STOCK"
            : state.marketMode === "DEX"
              ? "10M MOMENTUM"
              : "FLAT · 1.00×"}
        </small>
      </span>
      {state.tickerScores.map((score) => {
        const ticker = tickerById(score.ticker);
        return (
          <div
            className="airtimeRow"
            data-leader={leader === score.ticker}
            key={score.ticker}
          >
            <div className="airtimeRowTop">
              <span className="airtimeTicker">
                <strong>{score.ticker}</strong>
                {leader === score.ticker ? <small>LEADS</small> : null}
              </span>
              <span className="airtimeMetrics">
                <b>
                  {score.weightedScore.toFixed(1)}
                  <small>PTS</small>
                </b>
                <b>
                  {v4Economy
                    ? (score.recentVolumeUsd ?? 0).toLocaleString()
                    : score.rawSeconds}
                  <small>{v4Economy ? "30S HEAT" : "SEC AIRTIME"}</small>
                </b>
              </span>
            </div>
            <div className="airtimeTrack">
              <i
                style={{
                  width: `${(score.weightedScore / max) * 100}%`,
                  background: ticker.color,
                }}
              />
            </div>
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
                <strong>
                  {claim.claimant.profileHandle ? (
                    <Link href={`/profile/${claim.claimant.profileHandle}`}>
                      {claim.claimant.displayName}
                    </Link>
                  ) : (
                    claim.claimant.displayName
                  )}
                </strong>
                <span>
                  {claim.accepted
                    ? state.contractVersion === "last-bell-v4-stock-pot"
                      ? ` APED ${formatUsd(claim.usdgAmount ?? 0)} ON ${claim.claimant.ticker} · ${(claim.multiplierBps / 10_000).toFixed(2)}× · ${(claim.pointsAwarded ?? 0).toLocaleString()} PTS`
                      : ` PUT ${claim.claimant.ticker} ON AIR · ${claim.marketBand} ${(claim.multiplierBps / 10_000).toFixed(2)}×`
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

function ProjectionPanel({
  state,
  player,
}: {
  state: RoundState;
  player: PlayerRoundProjection | null;
}) {
  const v4Economy = state.contractVersion === "last-bell-v4-stock-pot";
  const projection = state.projection;
  const projectedHolder =
    projection?.finalHolderDisplayName ?? state.holder?.displayName;
  const projectedHolderPool =
    projection?.holderPoolUsd ??
    (state.phase === "settled" && state.pools
      ? state.pools.holderUsd
      : (state.potUsd * roundConfig.payoutBps.holder) / 10_000);
  const projectedTicker =
    projection?.closingPrintCrown.ticker ??
    (state.tickerScores.length ? leadingTicker(state) : null);
  const projectedTickerScore =
    projection?.closingPrintCrown.weightedPoints ??
    state.tickerScores.find((score) => score.ticker === projectedTicker)
      ?.weightedScore ??
    0;
  const projectedAirtimePool =
    projection?.airtimePoolUsd ??
    (state.phase === "settled" && state.pools
      ? state.pools.airtimeUsd
      : (state.potUsd * roundConfig.payoutBps.airtime) / 10_000);
  return (
    <section className="railCard projectionCard">
      <span className="railLabel">IF THE BELL RANG NOW</span>
      <dl>
        <div>
          <dt>FINAL CALLER · 50%</dt>
          <dd>
            <span>{projectedHolder ?? "NO CALLER"}</span>
            <strong>{formatUsd(projectedHolderPool)}</strong>
          </dd>
        </div>
        <div>
          <dt>
            {v4Economy
              ? "WINNING STOCK · 30%"
              : "CLOSING PRINT CROWN · PRESTIGE"}
          </dt>
          <dd>
            <span>{projectedTicker ?? "NO PRINT"}</span>
            <strong>{projectedTickerScore.toFixed(1)} PTS</strong>
          </dd>
        </div>
        <div>
          <dt>{v4Economy ? "LIFETIME POINTS · 10%" : "AIRTIME POOL · 30%"}</dt>
          <dd>
            <span>
              {v4Economy
                ? "PERSISTENT · NEVER BURN"
                : `${projection?.totalRawAirtimeSeconds.toFixed(0) ?? "0"} TOTAL SEC`}
            </span>
            <strong>
              {formatUsd(v4Economy ? state.potUsd * 0.1 : projectedAirtimePool)}
            </strong>
          </dd>
        </div>
      </dl>
      {player ? (
        <p>
          YOUR EST. CLAIM{" "}
          <strong>{formatUsd(player.projectedTotalRewardUsd)}</strong>
        </p>
      ) : (
        <p>
          {v4Economy ? (
            <Link href="/earnings">OPEN YOUR EARNINGS</Link>
          ) : (
            "CONNECT TO SEE YOUR EST. CLAIM"
          )}
        </p>
      )}
      <small>ESTIMATE · FINAL AMOUNTS SETTLE ONCHAIN</small>
    </section>
  );
}

function RaidPanel() {
  const [raid, setRaid] = useState<{
    state: string;
    voteCount: number;
    threshold: number;
    viewerEligible: boolean;
    viewerVoted: boolean;
    secondsRemaining?: number;
  } | null>(null);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    try {
      const response = await fetch("/api/raids/current", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        campaign?: typeof raid;
      };
      if (payload.campaign) setRaid(payload.campaign);
    } catch {
      // Raids are an optional attention layer and never block the game.
    }
  };

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
    // The polling closure intentionally owns its latest response state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!raid) return null;
  const vote = async () => {
    const response = await fetch("/api/raids/vote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const payload = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? "Your signal joined the raid."
        : payload.error || "Vote failed.",
    );
    await refresh();
  };
  return (
    <section className="railCard raidCard" data-state={raid.state}>
      <span className="railLabel">FEATURED RAID</span>
      <div>
        <strong>{raid.state}</strong>
        <span>
          {raid.voteCount}/{raid.threshold} UNIQUE CALLERS
        </span>
      </div>
      <progress value={raid.voteCount} max={Math.max(raid.threshold, 1)} />
      {raid.secondsRemaining !== undefined ? (
        <b>{raid.secondsRemaining}s</b>
      ) : null}
      {raid.state === "GATHERING" ? (
        <button
          type="button"
          className="textButton"
          disabled={!raid.viewerEligible || raid.viewerVoted}
          onClick={() => void vote()}
        >
          {raid.viewerVoted
            ? "SIGNAL COUNTED"
            : raid.viewerEligible
              ? "VOTE TO SOUND THE RAID"
              : "SIGN IN · MAKE A CALL TO VOTE"}
        </button>
      ) : null}
      {message ? <small role="status">{message}</small> : null}
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
  onClaim: (kind: "holder" | "airtime") => void;
}) {
  const v4Economy = state.contractVersion === "last-bell-v4-stock-pot";
  const holderPayout = state.pools?.holderUsd ?? state.potUsd * 0.5;
  const airtimePayout = state.pools?.airtimeUsd ?? state.potUsd * 0.3;
  const nextRound = state.pools?.nextRoundUsd ?? state.potUsd * 0.15;
  const protocol = state.pools?.protocolUsd ?? state.potUsd * 0.05;
  return (
    <div className="finalTransmission">
      <span className="phaseBug">FINAL TRANSMISSION</span>
      <Image
        src="/brand/saved-bell-mascot.png"
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
          <span>
            {v4Economy
              ? "WINNING STOCK · 30%"
              : "CLOSING PRINT CROWN · PRESTIGE"}
          </span>
          <strong>
            {state.winningTicker ?? "—"} ·{" "}
            {state.tickerScores
              .find((score) => score.ticker === state.winningTicker)
              ?.weightedScore.toFixed(1) ?? "0.0"}{" "}
            PTS
          </strong>
        </div>
        <div className="payoutTape">
          <span>
            {v4Economy
              ? "LIFETIME POINTS · 10% · FUTURE EARNINGS"
              : "AIRTIME POOL · 30% · ALL CALLERS"}
          </span>
          <strong>
            {formatUsd(v4Economy ? state.potUsd * 0.1 : airtimePayout)}
          </strong>
        </div>
      </div>
      <div className="poolBreakdown">
        <span>
          NEXT ROUND · {formatUsd(v4Economy ? state.potUsd * 0.05 : nextRound)}
        </span>
        <span>PROTOCOL · {formatUsd(protocol)}</span>
      </div>
      {typeof state.nextRoundStartsInSeconds === "number" ? (
        <p className="nextRoundNotice" role="status">
          NEXT BROADCAST STARTS AUTOMATICALLY IN{" "}
          {state.nextRoundStartsInSeconds}s
        </p>
      ) : null}
      {claimable.holderUsd > 0 || claimable.airtimeUsd > 0 ? (
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
          {claimable.airtimeUsd > 0 ? (
            <button
              type="button"
              className="secondaryAction"
              onClick={() => onClaim("airtime")}
            >
              CLAIM AIRTIME {formatUsd(claimable.airtimeUsd)}
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
  const maxApproval = (session?.allowanceUsd ?? 0) > 1_000_000_000;
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
              <dd>{maxApproval ? "MAX" : formatUsd(session.maximumUsd)}</dd>
            </div>
            <div>
              <dt>SPENT</dt>
              <dd>{formatUsd(session.spentUsd)}</dd>
            </div>
            <div>
              <dt>ALLOWANCE</dt>
              <dd>
                {maxApproval ? "REUSABLE" : formatUsd(session.remainingUsd)}
              </dd>
            </div>
            <div>
              <dt>CALLS</dt>
              <dd>{maxApproval ? "NO CAP" : session.availableActions}</dd>
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
