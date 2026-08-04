"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { publicEnvironment } from "@/lib/env";
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
  StockSwapQuote,
  TickerId,
  TransactionStage,
} from "@/lib/game/types";
import {
  contributionShortcuts,
  heatLevel,
  phasePresentation,
  transactionStageFor,
} from "@/lib/game/highlights";
import { useWalletGame } from "@/lib/web3/use-wallet-game";
import { OnchainVerification } from "./onchain-verification";

type ActionStatus = "idle" | "submitted" | "accepted" | "rejected";
// Use the statically inlined public environment. Reading process.env directly in
// a client component leaves Turbopack's browser shim empty and silently drops a
// testnet build back into simulator behavior after hydration.
const gameMode = publicEnvironment.mode;
const devnetMode = gameMode === "devnet";
const chainMode =
  gameMode === "devnet" || gameMode === "testnet" || gameMode === "mainnet";

function cloneState(state: RoundState): RoundState {
  return structuredClone(state);
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)
    .toString()
    .padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
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
  const [quote, setQuote] = useState<StockSwapQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [playerProjection, setPlayerProjection] =
    useState<PlayerRoundProjection | null>(null);
  const [announcement, setAnnouncement] = useState(
    "Bell Board synchronized.",
  );
  const [audioEnabled, setAudioEnabled] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem("saved-bell-audio") === "on",
  );
  const lastStinger = useRef<string | null>(null);
  const activeRoundIdentity = useRef(
    `${state.contractAddress?.toLowerCase() ?? "none"}:${state.roundId}`,
  );
  const walletGame = useWalletGame(
    state.contractAddress,
    state.contractVersion,
  );
  useEffect(() => {
    const headline = state.currentHeadline;
    if (
      !audioEnabled ||
      !headline ||
      lastStinger.current === headline.id ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    lastStinger.current = headline.id;
    if (
      !["POT_MILESTONE", "TICKER_FLIP", "RUG_STEAL", "SETTLEMENT"].includes(
        headline.kind,
      )
    )
      return;
    const AudioContextClass =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = headline.kind === "RUG_STEAL" ? "sawtooth" : "square";
    oscillator.frequency.setValueAtTime(
      headline.kind === "SETTLEMENT" ? 660 : 440,
      context.currentTime,
    );
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener("ended", () => void context.close());
  }, [audioEnabled, state.currentHeadline]);
  useEffect(() => {
    const nextMascot =
      state.phase === "rug" || state.phase === "finalizing"
        ? "/brand/saved-bell-mascot-settled.png"
        : "/brand/saved-bell-mascot-rug.png";
    const preload = new window.Image();
    preload.src = nextMascot;
  }, [state.phase]);
  const v4Economy =
    state.contractVersion === "saved-bell-v5-market-pot" ||
    state.contractVersion === "last-bell-v4-stock-pot";
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
  const transactionStage: TransactionStage = transactionStageFor({
    walletAction: walletGame.action,
    actionStatus,
    connected: walletGame.isConnected,
    chainMode,
    devnetMode,
  });

  useEffect(() => {
    if (!v4Economy || !chainMode || state.freshness !== "live") {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/game/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: effectiveTicker,
          amountUsd,
          player: activeSession?.player,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            quote?: StockSwapQuote;
            error?: string;
          };
          if (!response.ok || !payload.quote)
            throw new Error(payload.error || "Quote unavailable.");
          setQuote(payload.quote);
          setQuoteError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setQuote(null);
          setQuoteError(
            error instanceof Error ? error.message : "Quote unavailable.",
          );
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    activeSession?.player,
    amountUsd,
    effectiveTicker,
    state.roundId,
    state.freshness,
    v4Economy,
  ]);

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
      setAnnouncement("Bell Board synchronized.");
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
          ? `${ticker} is bell live. Reusable USDG approval active.`
          : action === "claim"
            ? `Call accepted on chain 31337. ${ticker} is bell live.`
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
            ? `Call accepted. ${ticker} is bell live.`
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
      `Taking the bell with ${effectiveTicker} using a reusable USDG approval.`,
    );
    if (chainMode) {
      if (walletGame.isConnected) {
        try {
          await walletGame.enter(effectiveTicker, amountUsd);
          await refreshChain();
          setActionStatus("accepted");
          setAnnouncement(
            `${effectiveTicker} is bell live from your connected wallet.`,
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
      `${effectiveTicker} is bell live. Bell stolen for ${formatUsd(amountUsd)}.`,
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
      (v4Economy ||
        (joined && (activeSession?.availableActions ?? 0) > 0));
  const canAct =
    state.freshness === "live" &&
    (state.phase === "live" || state.phase === "rug") &&
    !isCurrentHolder &&
    Boolean(chainMode ? hasChainClaimPath : true);

  return (
    <>
      {!v4Economy ? (
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
      ) : null}

      {v4Economy ? (
        <BellRushBoard
          state={state}
          selected={effectiveTicker}
          onSelect={setSelectedTicker}
          amountUsd={amountUsd}
          onAmountChange={setAmountUsd}
          quote={quote}
          quoteError={quoteError}
          transactionStage={transactionStage}
          approvalHash={walletGame.latestApprovalHash}
          contributionHash={walletGame.latestContributionHash}
          actionStatus={actionStatus}
          canAct={
            entryRequired
              ? state.freshness === "live" &&
                Boolean(chainMode ? hasChainClaimPath : true)
              : canAct
          }
          onAction={() => entryRequired ? void enterRound() : takeBell(effectiveTicker)}
          session={activeSession}
          playerProjection={playerProjection}
          claimable={activeClaimable}
          onClaim={(kind) =>
            walletGame.isConnected
              ? void walletGame.claimReward(kind)
              : void requestDevnetAction(
                  kind === "holder"
                    ? "claim-holder"
                    : kind === "refund"
                      ? "claim-refund"
                      : "claim-print",
                )
          }
        />
      ) : (
      <div className="broadcastGrid">
        <aside className="sideRail leftRail" aria-label="Round briefing">
          <details className="railCard ruleCard howItWorks">
            <summary>HOW IT WORKS</summary>
            <p>
              Pick a stock. Choose any amount. Take the bell. Hold it at zero to
              win 50%.
            </p>
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
          </details>
          <ClosingPrintBoard state={state} leader={tickerLeader} />
        </aside>

        <section className={`broadcastArena phase-${state.phase}`}>
          <div className="lowerThird">
            <span>ROUND {state.roundId ?? roundConfig.roundId}</span>
            <strong>{formatUsd(state.potUsd)} POT</strong>
          </div>
          <PrimaryScoreboard state={state} />

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
              quote={quote}
              quoteError={quoteError}
              transactionStage={transactionStage}
              approvalHash={walletGame.latestApprovalHash}
              contributionHash={walletGame.latestContributionHash}
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
              selected={effectiveTicker}
              onSelect={setSelectedTicker}
              quote={quote}
              quoteError={quoteError}
              transactionStage={transactionStage}
              approvalHash={walletGame.latestApprovalHash}
              contributionHash={walletGame.latestContributionHash}
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
          <AudioControl
            enabled={audioEnabled}
            onChange={(enabled) => {
              setAudioEnabled(enabled);
              window.localStorage.setItem(
                "saved-bell-audio",
                enabled ? "on" : "off",
              );
            }}
          />
          <RaidPanel />
        </aside>
      </div>
      )}
      {v4Economy &&
      (state.phase === "entry" ||
        state.phase === "live" ||
        state.phase === "rug") ? (
        <MobileActionDock
          state={state}
          ticker={effectiveTicker}
          amountUsd={amountUsd}
          onAction={() =>
            state.phase === "entry"
              ? void enterRound()
              : takeBell(effectiveTicker)
          }
          disabled={
            state.freshness !== "live" ||
            actionStatus === "submitted" ||
            (state.phase !== "entry" && !canAct)
          }
        />
      ) : null}
    </>
  );
}

function BellRushBoard({
  state,
  selected,
  onSelect,
  amountUsd,
  onAmountChange,
  quote,
  quoteError,
  transactionStage,
  approvalHash,
  contributionHash,
  actionStatus,
  canAct,
  onAction,
  session,
  playerProjection,
  claimable,
  onClaim,
}: {
  state: RoundState;
  selected: TickerId;
  onSelect: (ticker: TickerId) => void;
  amountUsd: number;
  onAmountChange: (amount: number) => void;
  quote: StockSwapQuote | null;
  quoteError: string | null;
  transactionStage: TransactionStage;
  approvalHash: `0x${string}` | null;
  contributionHash: `0x${string}` | null;
  actionStatus: ActionStatus;
  canAct: boolean;
  onAction: () => void;
  session: SessionBudget | null;
  playerProjection: PlayerRoundProjection | null;
  claimable: ClaimableBalances;
  onClaim: (kind: "holder" | "airtime" | "refund") => void;
}) {
  const ranked = [...state.tickerScores].sort(
    (a, b) =>
      b.weightedScore - a.weightedScore || a.ticker.localeCompare(b.ticker),
  );
  const leader = ranked[0];
  const selectedScore = state.tickerScores.find(
    (score) => score.ticker === selected,
  )!;
  const selectedRank =
    ranked.findIndex((score) => score.ticker === selected) + 1;
  const projectedPoints =
    quote?.projectedPoints ??
    (amountUsd * selectedScore.multiplierBps) / 10_000;
  const latestClaim = state.claims.at(-1);
  const playerAddress = session?.player?.toLowerCase();
  const bellStolen = Boolean(
    playerAddress &&
      latestClaim?.previousHolder?.toLowerCase() === playerAddress &&
      state.holder?.address.toLowerCase() !== playerAddress,
  );
  const finalWindow =
    (state.phase === "live" || state.phase === "rug") &&
    state.hardTimeLeftSeconds <= 300;
  const canTakeFirst =
    selectedRank > 1 && (quote?.projectedRank ?? selectedRank) === 1;
  const leadGap = Math.max(
    0,
    (leader?.weightedScore ?? 0) - selectedScore.weightedScore,
  );
  const takeLeadAmount = contributionShortcuts(
    quote?.pointsToLead ?? leadGap,
    quote?.multiplierBps ?? selectedScore.multiplierBps,
  ).takeTheLead;

  const pressure = state.phase === "rug"
    ? {
        tone: "rug",
        title: "RUG ZONE · LAST ACCEPTED CALL WINS 50%",
        detail: `Automated wallets may be faster. Hard stop in ${formatClock(state.hardTimeLeftSeconds)}.`,
      }
    : finalWindow
      ? {
          tone: "final",
          title: "FINAL WINDOW",
          detail: `The bell clock cannot reset past the ${formatClock(state.hardTimeLeftSeconds)} hard stop.`,
        }
      : bellStolen
        ? {
            tone: "stolen",
            title: "YOUR BELL WAS STOLEN",
            detail: `${state.holder?.displayName ?? "Another caller"} took it with ${formatUsd(latestClaim?.usdgAmount ?? 0)} on ${state.holder?.ticker ?? selected}.`,
          }
        : canTakeFirst
          ? {
              tone: "flip",
              title: `${selected} TAKES #1 WITH THIS CALL`,
              detail: `${projectedPoints.toLocaleString()} points would move it to the top of the board.`,
            }
          : selectedRank > 1
            ? {
                tone: "race",
                title: `${selected} IS ${Math.ceil(leadGap).toLocaleString()} PTS FROM #1`,
                detail: `At ${(selectedScore.multiplierBps / 10_000).toFixed(2)}×, ${formatUsd(takeLeadAmount)} takes the lead.`,
              }
            : selectedScore.multiplierBps >= 17_500
              ? {
                  tone: "heat",
                  title: `${selected} IS NUCLEAR · ${(selectedScore.multiplierBps / 10_000).toFixed(2)}×`,
                  detail: "Recent activity is currently earning more Round Points per dollar.",
                }
              : {
                  tone: "ready",
                  title: "MAKE YOUR MOVE",
                  detail: "Every accepted contribution earns Round Points and takes the bell.",
                };

  const mascot = state.phase === "rug"
    ? "/brand/bell-rush-hall-monitor-rug.png"
    : state.phase === "settled"
      ? "/brand/bell-rush-hall-monitor-settled.png"
      : actionStatus === "accepted"
        ? "/brand/bell-rush-hall-monitor-accepted.png"
        : bellStolen
          ? "/brand/bell-rush-hall-monitor-stolen.png"
          : state.currentHeadline?.kind === "TICKER_FLIP"
            ? "/brand/bell-rush-hall-monitor-flip.png"
            : "/brand/bell-rush-hall-monitor.png";

  const playable =
    state.phase === "entry" || state.phase === "live" || state.phase === "rug";
  const currentLeaderShare = leader?.weightedScore
    ? ((leader.playerPoints ?? 0) / leader.weightedScore) * 100
    : 0;

  return (
    <section className={`bellRushBoard phase-${state.phase}`}>
      <header className="bellRushEssentials">
        <div className="bellRushClock">
          <span>BELL CLOCK</span>
          <strong>
            {state.phase === "entry" ? "05:00" : formatClock(state.timeLeftSeconds)}
          </strong>
          <small>
            HARD STOP · {state.phase === "entry" ? "10:00" : formatClock(state.hardTimeLeftSeconds)}
          </small>
          <i
            aria-hidden="true"
            style={{
              width: `${Math.min(100, Math.max(0, (state.hardTimeLeftSeconds / 600) * 100))}%`,
            }}
          />
        </div>
        <div className="bellRushPot">
          <span>ROUND {state.roundId ?? roundConfig.roundId} · POT</span>
          <strong>{formatUsd(state.potUsd)}</strong>
          <small>{(state.claims?.length ?? 0).toLocaleString()} ACCEPTED CALLS</small>
        </div>
        <div className="bellRushHolder">
          <Image src={mascot} alt="Bell Rush Hall Monitor" width={120} height={120} priority />
          <span>
            <small>HOLDS THE BELL</small>
            <strong>{state.holder?.displayName ?? "OPEN BELL"}</strong>
            <b>{state.holder?.ticker ?? "PICK A STOCK"}</b>
          </span>
        </div>
        <div className="bellRushHolderPrize">
          <span>WINS IF IT RANG NOW · 50%</span>
          <strong>{formatUsd(state.pools?.holderUsd ?? state.potUsd * 0.5)}</strong>
          <small>{state.holder ? "PROJECTED · SETTLES ONCHAIN" : "WAITING FOR FIRST CALL"}</small>
        </div>
      </header>

      <div className="bellRushRule">
        <strong>PICK A STOCK. APE TO EARN POINTS AND STEAL THE BELL.</strong>
        <span>#1 STOCK SPLITS 30% · HOLD THE BELL AT ZERO TO WIN 50%</span>
      </div>

      {state.freshness === "offline" ? (
        <DeadAir />
      ) : playable ? (
        <>
          <StockRaceBoard
            state={state}
            ranked={ranked}
            selected={selected}
            onSelect={onSelect}
            connected={Boolean(session)}
          />
          <section className="bellRushPressure" data-tone={pressure.tone} role="status">
            <div>
              <strong>{pressure.title}</strong>
              <span>{pressure.detail}</span>
            </div>
            {bellStolen || selectedRank > 1 ? (
              <div className="pressureShortcuts">
                <button type="button" onClick={() => onAmountChange(1)}>
                  SET RETAKE · $1
                </button>
                <button type="button" onClick={() => onAmountChange(takeLeadAmount)}>
                  SET TAKE #1 · {formatUsd(takeLeadAmount)}
                </button>
              </div>
            ) : null}
          </section>
          <ActionComposer
            state={state}
            selected={selected}
            onSelect={onSelect}
            amountUsd={amountUsd}
            onAmountChange={onAmountChange}
            quote={quote}
            quoteError={quoteError}
            transactionStage={transactionStage}
            approvalHash={approvalHash}
            contributionHash={contributionHash}
            actionLabel={`APE ${formatUsd(amountUsd)} ON ${selected}`}
            onAction={onAction}
            disabled={!canAct || actionStatus === "submitted"}
          />
          <PrizeStrip
            state={state}
            leader={leader?.ticker ?? selected}
            leaderPoints={leader?.weightedScore ?? 0}
            playerLeaderShare={currentLeaderShare}
            playerProjection={playerProjection}
          />
          <HallwayFeed state={state} />
        </>
      ) : state.phase === "cancelled" ? (
        <CancelledRound state={state} refundUsd={claimable.refundUsd} onClaim={() => onClaim("refund")} />
      ) : state.phase === "finalizing" ? (
        <Finalizing state={state} />
      ) : (
        <FinalTransmission state={state} claimable={claimable} onClaim={onClaim} />
      )}
    </section>
  );
}

function StockRaceBoard({
  state,
  ranked,
  selected,
  onSelect,
  connected,
}: {
  state: RoundState;
  ranked: RoundState["tickerScores"];
  selected: TickerId;
  onSelect: (ticker: TickerId) => void;
  connected: boolean;
}) {
  const max = Math.max(ranked[0]?.weightedScore ?? 0, 1);
  return (
    <section className="stockRaceBoard" aria-label="Stock Race">
      <header>
        <div>
          <span>BELL RUSH</span>
          <h2>THE STOCK RACE</h2>
        </div>
        <small>ROUND POINTS PICK THE #1 STOCK</small>
      </header>
      <div className="stockRaceRows">
        {ranked.map((score, index) => {
          const playerShare = score.weightedScore
            ? ((score.playerPoints ?? 0) / score.weightedScore) * 100
            : 0;
          const gap = Math.max(0, max - score.weightedScore);
          const captain = state.tickerCaptains?.find(
            (item) => item.ticker === score.ticker,
          );
          return (
            <article
              className="stockRaceRow"
              data-stock={score.ticker}
              data-selected={score.ticker === selected}
              data-leader={index === 0}
              key={score.ticker}
              onClick={() => onSelect(score.ticker)}
              title={`Select ${score.ticker}`}
            >
              <span className="raceRank">#{index + 1}</span>
              <button
                type="button"
                className="raceTickerButton"
                aria-pressed={score.ticker === selected}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(score.ticker);
                }}
              >
                <span>{score.ticker}</span>
                <small className="selectedTickerFlag" aria-hidden="true">PICKED</small>
              </button>
              <span className="racePoints">
                <b>{score.weightedScore.toLocaleString()}</b>
                <small>ROUND PTS</small>
              </span>
              <span className="raceTrack" aria-hidden="true">
                <i
                  style={{
                    width: `${(score.weightedScore / max) * 100}%`,
                    background: tickerById(score.ticker).color,
                  }}
                />
              </span>
              <span className="raceHeat">
                <b>{(score.multiplierBps / 10_000).toFixed(2)}×</b>
                <small>{heatLevel(score.multiplierBps)}</small>
              </span>
              <span className="raceGap">
                {index === 0 ? "LEADS" : `−${Math.ceil(gap).toLocaleString()} PTS`}
              </span>
              <span className="racePlayer">
                {connected
                  ? `YOU ${(score.playerPoints ?? 0).toLocaleString()} · ${playerShare.toFixed(1)}%`
                  : "CONNECT TO SEE YOUR POSITION"}
              </span>
              <details className="raceDetails" onClick={(event) => event.stopPropagation()}>
                <summary>DETAILS</summary>
                <span>{(score.recentVolumeUsd ?? 0).toLocaleString()} USDG · 30S HEAT</span>
                <span>{(score.potTokenQuantity ?? 0).toLocaleString()} {score.ticker} IN POT</span>
                {captain ? <span>CAPTAIN · {captain.displayName}</span> : null}
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PrizeStrip({
  state,
  leader,
  leaderPoints,
  playerLeaderShare,
  playerProjection,
}: {
  state: RoundState;
  leader: TickerId;
  leaderPoints: number;
  playerLeaderShare: number;
  playerProjection: PlayerRoundProjection | null;
}) {
  const holderPool = state.pools?.holderUsd ?? state.potUsd * 0.5;
  const stockPool = state.potUsd * 0.3;
  const lifetimePool = state.potUsd * 0.1;
  return (
    <section className="bellRushPrizes" aria-label="Current projected prizes">
      <article>
        <span>LAST BELL · 50%</span>
        <strong>{state.holder?.displayName ?? "NO CALLER"}</strong>
        <b>{formatUsd(holderPool)}</b>
      </article>
      <article>
        <span>#1 STOCK · 30%</span>
        <strong>{leader} · {leaderPoints.toLocaleString()} PTS</strong>
        <b>
          {playerLeaderShare > 0
            ? `YOU ${playerLeaderShare.toFixed(1)}% · ${formatUsd(stockPool * playerLeaderShare / 100)}`
            : `${formatUsd(stockPool)} TO BACKERS`}
        </b>
      </article>
      <article>
        <span>LIFETIME · 10%</span>
        <strong>POINTS NEVER BURN</strong>
        <b>
          {playerProjection
            ? `YOUR EST. ${formatUsd(Math.max(0, playerProjection.projectedTotalRewardUsd - playerProjection.projectedHolderRewardUsd - playerProjection.projectedAirtimeRewardUsd))}`
            : `${formatUsd(lifetimePool)} THIS ROUND`}
        </b>
      </article>
      <details>
        <summary>FULL POT SPLIT · 50 / 30 / 10 / 5 / 5</summary>
        <div className="potSplitBar" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </div>
        <p>50% Last Bell · 30% #1 Stock · 10% Lifetime · 5% next-round seed · 5% protocol</p>
      </details>
    </section>
  );
}

function HallwayFeed({ state }: { state: RoundState }) {
  const last = state.claims.at(-1);
  const fallback = last
    ? `${last.claimant.displayName} APED ${formatUsd(last.usdgAmount ?? 0)} ON ${last.claimant.ticker}`
    : "THE BELL IS WAITING FOR ITS FIRST CALLER";
  return (
    <section className="hallwayFeed" aria-label="Hallway Feed">
      <span>HALLWAY FEED</span>
      <strong>{state.currentHeadline?.text ?? fallback}</strong>
      <small>CANONICAL GAME EVENTS ONLY</small>
    </section>
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

function PrimaryScoreboard({ state }: { state: RoundState }) {
  const phase = state.phasePresentation ?? phasePresentation(state);
  const projectedReward =
    state.projection?.holderPoolUsd ??
    state.pools?.holderUsd ??
    state.potUsd * 0.5;
  return (
    <section
      className={`primaryScoreboard tone-${phase.tone}`}
      aria-label="Live round essentials"
    >
      <article>
        <span>CLOCK</span>
        <strong>
          {state.phase === "entry"
            ? "05:00"
            : formatClock(state.timeLeftSeconds)}
        </strong>
      </article>
      <article>
        <span>POT</span>
        <strong>{formatUsd(state.potUsd)}</strong>
      </article>
      <article>
        <span>CURRENT HOLDER</span>
        <strong>{state.holder?.displayName ?? "OPEN BELL"}</strong>
      </article>
      <article>
        <span>WINS IF IT RANG NOW</span>
        <strong>{formatUsd(projectedReward)}</strong>
      </article>
      <p>
        <b>{phase.label}</b> · {phase.message}
      </p>
    </section>
  );
}

function ActionComposer({
  state,
  selected,
  onSelect,
  amountUsd,
  onAmountChange,
  quote,
  quoteError,
  transactionStage,
  approvalHash,
  contributionHash,
  actionLabel,
  onAction,
  disabled,
}: {
  state: RoundState;
  selected: TickerId;
  onSelect: (ticker: TickerId) => void;
  amountUsd: number;
  onAmountChange: (amount: number) => void;
  quote: StockSwapQuote | null;
  quoteError: string | null;
  transactionStage: TransactionStage;
  approvalHash: `0x${string}` | null;
  contributionHash: `0x${string}` | null;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}) {
  const selectedScore = state.tickerScores.find(
    (score) => score.ticker === selected,
  )!;
  const calculated = contributionShortcuts(
    quote?.pointsToLead ?? selectedScore.pointsNeededToLead ?? 0,
    quote?.multiplierBps ?? selectedScore.multiplierBps,
  );
  const shortcuts = [
    ["TAKE BELL", 1],
    ["MATCH #1", calculated.matchLeader],
    ["TAKE #1", calculated.takeTheLead],
    ["FLIP STOCK", calculated.flipTheStock],
  ] as const;
  const currentRank =
    quote?.currentRank ??
    state.tickerScores.findIndex((score) => score.ticker === selected) + 1;
  const projectedRank =
    quote?.projectedRank ??
    (quote?.projectedLeader === selected ? 1 : currentRank);
  const multiplierBps = quote?.multiplierBps ?? selectedScore.multiplierBps;
  const projectedPoints =
    quote?.projectedPoints ?? (amountUsd * multiplierBps) / 10_000;
  const projectedTickerPoints =
    quote?.projectedTickerPoints ?? selectedScore.weightedScore + projectedPoints;
  const projectedPlayerPoints =
    quote?.projectedPlayerTickerPoints ??
    (selectedScore.playerPoints ?? 0) + projectedPoints;
  const projectedShareBps =
    quote?.projectedPlayerShareBps ??
    (projectedTickerPoints > 0
      ? Math.round((projectedPlayerPoints / projectedTickerPoints) * 10_000)
      : 0);
  const pointsToLeadAfter =
    quote?.pointsToLeadAfter ??
    Math.max(0, (quote?.pointsToLead ?? 0) - projectedPoints);
  const acceptedResult =
    transactionStage === "ACCEPTED_ONCHAIN" ? state.claims.at(-1) : undefined;
  const stockOutput = quote
    ? `${quote.estimatedStockOut.toFixed(6)} ${selected}`
    : "CALCULATING…";
  return (
    <section
      className="actionComposer"
      aria-label="Stock contribution composer"
    >
      <div className="composerTickers">
        {state.tickerScores.map((score, index) => (
          <button
            type="button"
            key={score.ticker}
            data-selected={score.ticker === selected}
            onClick={() => onSelect(score.ticker)}
          >
            <span>#{index + 1}</span>
            <strong>{score.ticker}</strong>
            <small>
              {heatLevel(score.multiplierBps)} ·{" "}
              {(score.multiplierBps / 10_000).toFixed(2)}×
            </small>
          </button>
        ))}
      </div>
      <div className="callTicket">
        <div className="composerAmountPanel">
          <span className="ticketKicker">YOUR {selected} CALL</span>
          <AmountComposer amountUsd={amountUsd} onChange={onAmountChange} />
          <div className="impactShortcuts" aria-label="Contribution shortcuts">
            {shortcuts.map(([label, value]) => (
              <button
                type="button"
                key={label}
                onClick={() => onAmountChange(value)}
              >
                <span>{label}</span>
                <small>{formatUsd(value)}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="composerImpactPanel">
          <span className="ticketKicker">IF ACCEPTED</span>
          <div className="bellRushImpactGrid">
            <span>
              <strong>+{projectedPoints.toLocaleString()}</strong>
              <small>ROUND PTS</small>
            </span>
            <span>
              <strong>
                {selected}{" "}
                {projectedRank === currentRank
                  ? `STAYS #${currentRank}`
                  : `GOES #${projectedRank}`}
              </strong>
              <small>
                {projectedRank === 1
                  ? "TAKES THE LEAD"
                  : `${Math.ceil(pointsToLeadAfter).toLocaleString()} TO #1`}
              </small>
            </span>
            <span>
              <strong>YOU OWN {(projectedShareBps / 100).toFixed(1)}%</strong>
              <small>
                {formatUsd(
                  (state.potUsd * 0.3 * projectedShareBps) / 10_000,
                )}{" "}
                IF {selected} WINS
              </small>
            </span>
          </div>
          <div className="impactHero">
            <strong>+{projectedPoints.toLocaleString()} PTS</strong>
            <span>
              {selected} MOVES #{currentRank} → #{projectedRank}
            </span>
          </div>
          <dl className="quoteMath">
            {acceptedResult ? (
              <>
                <div>
                  <dt>USDG APED</dt>
                  <dd>{formatUsd(acceptedResult.usdgAmount ?? 0)}</dd>
                </div>
                <div>
                  <dt>USDG SWAPPED</dt>
                  <dd>{formatUsd(acceptedResult.usdgConsumed ?? 0)}</dd>
                </div>
                <div>
                  <dt>USDG LEFT IN POT</dt>
                  <dd>{formatUsd(acceptedResult.residualUsdg ?? 0)}</dd>
                </div>
                <div>
                  <dt>STOCK ADDED</dt>
                  <dd>
                    {(acceptedResult.stockReceived ?? 0).toFixed(6)} {selected}
                  </dd>
                </div>
                <div>
                  <dt>POINTS EARNED</dt>
                  <dd>
                    {(acceptedResult.pointsAwarded ?? 0).toLocaleString()}
                  </dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>EST. STOCK RECEIVED</dt>
              <dd>{stockOutput}</dd>
            </div>
            <div>
              <dt>HEAT</dt>
              <dd>
                {(multiplierBps / 10_000).toFixed(2)}× ·{" "}
                {heatLevel(multiplierBps)}
              </dd>
            </div>
            <div>
              <dt>APPROVAL</dt>
              <dd>
                {quote?.approvalRequired ? "NEEDED FIRST" : "ALREADY READY"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      {quoteError ? (
        <p className="quoteError">{quoteError} Nothing will be charged.</p>
      ) : null}
      <button
        type="button"
        className="primaryAction composerAction"
        aria-label={actionLabel}
        onClick={onAction}
        disabled={
          disabled ||
          transactionStage === "APPROVAL_PENDING" ||
          transactionStage === "CONTRIBUTION_PENDING"
        }
      >
        {disabled && state.freshness !== "live"
          ? "CONNECTION DEGRADED · ACTIONS PAUSED"
          : transactionStage === "READY"
            ? actionLabel
            : transactionStage.replaceAll("_", " ")}
      </button>
      {transactionStage !== "READY" || approvalHash || contributionHash ? (
        <div
          className={`transactionStage stage-${transactionStage.toLowerCase()}`}
          role="status"
        >
          <strong>{transactionStage.replaceAll("_", " ")}</strong>
          {approvalHash ? (
            <span>Approval {approvalHash.slice(0, 10)}…</span>
          ) : null}
          {contributionHash ? (
            <span>Contribution {contributionHash.slice(0, 10)}…</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MobileActionDock({
  state,
  ticker,
  amountUsd,
  onAction,
  disabled,
}: {
  state: RoundState;
  ticker: TickerId;
  amountUsd: number;
  onAction: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mobileActionDock">
      <span>
        <small>
          {state.phase === "entry"
            ? "READY"
            : formatClock(state.timeLeftSeconds)}
        </small>
        <strong>
          {ticker} · {formatUsd(amountUsd)}
        </strong>
      </span>
      <button type="button" onClick={onAction} disabled={disabled}>
        APE
      </button>
    </div>
  );
}

function AudioControl({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <section className="railCard audioControl">
      <span className="railLabel">BELL SOUNDS</span>
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => onChange(!enabled)}
      >
        {enabled ? "STINGERS ON" : "STINGERS MUTED"}
      </button>
      <small>Opt-in only. Milestones, flips, Rug Zone, and settlement.</small>
    </section>
  );
}

function mascotForState(state: RoundState) {
  if (state.phase === "rug") return "/brand/saved-bell-mascot-rug.png";
  if (state.phase === "settled") return "/brand/saved-bell-mascot-settled.png";
  if (state.currentHeadline?.kind === "TICKER_FLIP")
    return "/brand/saved-bell-mascot-flip.png";
  return "/brand/saved-bell-mascot.png";
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
  quote,
  quoteError,
  transactionStage,
  approvalHash,
  contributionHash,
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
  quote: StockSwapQuote | null;
  quoteError: string | null;
  transactionStage: TransactionStage;
  approvalHash: `0x${string}` | null;
  contributionHash: `0x${string}` | null;
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
      {v4Economy ? (
        <ActionComposer
          state={state}
          selected={selected}
          onSelect={onSelect}
          amountUsd={amountUsd}
          onAmountChange={onAmountChange}
          quote={quote}
          quoteError={quoteError}
          transactionStage={transactionStage}
          approvalHash={approvalHash}
          contributionHash={contributionHash}
          actionLabel={`APE ${formatUsd(amountUsd)} ON ${selected}`}
          onAction={onEnter}
          disabled={status === "submitted" || state.freshness !== "live"}
        />
      ) : (
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
      )}
      {!v4Economy ? (
        <div className="entryTerms">
          <span>TIMER WAITS FOR YOU</span>
          <span>$1 PER CALL</span>
          <span>ONE APPROVAL</span>
          <span>REVOKE ANY TIME</span>
        </div>
      ) : null}
      {!v4Economy ? (
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
      ) : null}
      {!v4Economy ? (
        <p className="actionFinePrint">
          {walletConnected
            ? `Approves ${formatUsd(sessionApproval.amountUsd)} play USDG only when allowance is below ${formatUsd(sessionApproval.refreshBelowUsd)}. You can change or revoke it in your wallet.`
            : `${gameMode === "testnet" ? "The built-in testnet wallet" : "Devnet guest mode"} uses the same ${formatUsd(sessionApproval.amountUsd)} reusable play-USDG approval. No real value is used.`}
        </p>
      ) : null}
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
  selected,
  onSelect,
  quote,
  quoteError,
  transactionStage,
  approvalHash,
  contributionHash,
}: {
  state: RoundState;
  actionStatus: ActionStatus;
  canAct: boolean;
  takeBell: (ticker: TickerId) => void;
  session: SessionBudget | null;
  amountUsd: number;
  onAmountChange: (amount: number) => void;
  v4Economy: boolean;
  selected: TickerId;
  onSelect: (ticker: TickerId) => void;
  quote: StockSwapQuote | null;
  quoteError: string | null;
  transactionStage: TransactionStage;
  approvalHash: `0x${string}` | null;
  contributionHash: `0x${string}` | null;
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
      <div className="liveStatusDeck">
        <div className="phaseBug">
          {(state.phasePresentation ?? phasePresentation(state)).label}
        </div>
        <div className="clockAssembly">
          <span>{clockLabel}</span>
          <strong aria-label={`${state.timeLeftSeconds} seconds remaining`}>
            {formatClock(state.timeLeftSeconds)}
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
              src={mascotForState(state)}
              alt="Saved by the Bell broadcast host"
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
      </div>
      <div className="liveActionDeck">
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
        {v4Economy ? (
          <ActionComposer
            state={state}
            selected={selected}
            onSelect={onSelect}
            amountUsd={amountUsd}
            onAmountChange={onAmountChange}
            quote={quote}
            quoteError={quoteError}
            transactionStage={transactionStage}
            approvalHash={approvalHash}
            contributionHash={contributionHash}
            actionLabel={`APE ${formatUsd(amountUsd)} ON ${selected}`}
            onAction={() => takeBell(selected)}
            disabled={!canAct || actionStatus === "submitted"}
          />
        ) : (
          <div className="claimTickerGrid" aria-label="Put a stock on air">
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
        )}
        <p className="actionFinePrint">
          {state.phase === "rug"
            ? "A successful contribution takes the bell and resets the clock, up to the hard stop."
            : "A successful contribution takes the bell and resets the clock to 5:00."}
        </p>
      </div>
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
  const v4Economy =
    state.contractVersion === "saved-bell-v5-market-pot" ||
    state.contractVersion === "last-bell-v4-stock-pot";
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
        const rank =
          [...state.tickerScores]
            .sort(
              (a, b) =>
                b.weightedScore - a.weightedScore ||
                a.ticker.localeCompare(b.ticker),
            )
            .findIndex((item) => item.ticker === score.ticker) + 1;
        const captain = state.tickerCaptains?.find(
          (item) => item.ticker === score.ticker,
        );
        return (
          <div
            className="airtimeRow"
            data-leader={leader === score.ticker}
            key={score.ticker}
          >
            <div className="airtimeRowTop">
              <span className="airtimeTicker">
                <strong>
                  #{rank} {score.ticker}
                </strong>
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
            {v4Economy ? (
              <div className="tickerDepth">
                <span>
                  {heatLevel(score.multiplierBps)} ·{" "}
                  {(score.multiplierBps / 10_000).toFixed(2)}×
                </span>
                <span>
                  YOU {(score.playerPoints ?? 0).toLocaleString()} PTS
                </span>
                <span>
                  {(score.pointsNeededToLead ?? 0).toLocaleString()} TO LEAD
                </span>
                <span>
                  {(score.potTokenQuantity ?? 0).toLocaleString()}{" "}
                  {score.ticker} IN POT
                </span>
                {captain ? <span>CAPTAIN {captain.displayName}</span> : null}
              </div>
            ) : null}
          </div>
        );
      })}
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
  const v4Economy =
    state.contractVersion === "saved-bell-v5-market-pot" ||
    state.contractVersion === "last-bell-v4-stock-pot";
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
      <span className="eyebrow">FINAL BELL</span>
      <h1>Checking the chain</h1>
      <p>
        The clock is frozen at zero. We are confirming the final accepted claim
        before naming the Last Bell winner.
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
  const v4Economy =
    state.contractVersion === "saved-bell-v5-market-pot" ||
    state.contractVersion === "last-bell-v4-stock-pot";
  const holderPayout = state.pools?.holderUsd ?? state.potUsd * 0.5;
  const airtimePayout = state.pools?.airtimeUsd ?? state.potUsd * 0.3;
  const nextRound = state.pools?.nextRoundUsd ?? state.potUsd * 0.15;
  const protocol = state.pools?.protocolUsd ?? state.potUsd * 0.05;
  return (
    <div className="finalTransmission">
      <span className="phaseBug">FINAL BELL</span>
      <Image
        src="/brand/bell-rush-hall-monitor-settled.png"
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
          {v4Economy ? (
            <small>
              {formatUsd(state.potUsd * 0.3)} SPLIT BY WINNING-STOCK POINTS
            </small>
          ) : null}
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
          NEXT ROUND PREPARES AUTOMATICALLY IN{" "}
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
              CLAIM {v4Economy ? "WINNING STOCK" : "AIRTIME"}{" "}
              {formatUsd(claimable.airtimeUsd)}
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="proofLine">
        ROUND CONTRACT {state.contractAddress?.slice(0, 8) ?? "SIM"}… · BLOCK{" "}
        {state.blockNumber}
      </p>
      <OnchainVerification state={state} />
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
