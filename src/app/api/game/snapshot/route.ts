import { NextResponse } from "next/server";
import { screenRoster, screenStockPotRoster } from "@/lib/game/market-screen";
import { buildRoundProjection } from "@/lib/game/projections";
import { loadScreeningAssets } from "@/lib/server/market-store";
import { loadServerDeployment } from "@/lib/server/deployment";
import {
  isDevnetRuntime,
  isV4DevnetRuntime,
  isV4Runtime,
} from "@/lib/server/runtime-deployment";
import { getDevnetSession, getDevnetSnapshot } from "@/lib/web3/devnet";
import {
  getV4DevnetSession,
  getV4DevnetSnapshot,
} from "@/lib/web3/v4-devnet-runtime";
import { getLiveSnapshot } from "@/lib/web3/live-snapshot";
import { assessLanRpcHealth, readRpcEndpoints } from "@/lib/web3/rpc-routing";

export const dynamic = "force-dynamic";

export async function GET() {
  const mode = process.env.NEXT_PUBLIC_GAME_MODE || "simulator";
  try {
    if (isDevnetRuntime()) {
      const v4 = isV4DevnetRuntime();
      const state = v4
        ? await getV4DevnetSnapshot()
        : await getDevnetSnapshot();
      if (state.contractVersion !== "last-bell-v4-stock-pot") {
        state.projection = buildRoundProjection(state);
      }
      return NextResponse.json({
        ok: true,
        chainId: 31337,
        state,
        ...(state.contractVersion === "last-bell-v4-stock-pot"
          ? await getV4DevnetSession()
          : await getDevnetSession()),
      });
    }
    if (mode !== "testnet" && mode !== "mainnet") {
      return NextResponse.json(
        { ok: false, error: "Simulator mode has no chain snapshot." },
        { status: 409 },
      );
    }
    const v4 = isV4Runtime();
    const state = v4 ? await getV4DevnetSnapshot() : await getLiveSnapshot();
    const deployment = await loadServerDeployment();
    const configuredEndpoints = readRpcEndpoints(mode);
    const rpcHealth = await assessLanRpcHealth({
      primary: deployment.rpc.primary,
      fallback: deployment.rpc.fallback ?? configuredEndpoints.fallback,
    });
    const assets = await loadScreeningAssets().catch(() => []);
    const byTicker = new Map(assets.map((asset) => [asset.ticker, asset]));
    const roster = v4 ? screenStockPotRoster(assets) : screenRoster(assets);
    state.marketExplanation = roster.reason;
    if (v4) {
      state.freshness =
        roster.delayed || rpcHealth.status === "degraded" ? "delayed" : "live";
      if (rpcHealth.status === "degraded") {
        state.marketExplanation =
          "LAN RPC connection degraded. Actions are paused; no automatic Alchemy fallback is enabled.";
      }
      return NextResponse.json({
        ok: true,
        chainId: state.chainId,
        state,
        rpc: { policy: "LAN_ONLY", ...rpcHealth },
      });
    }
    const now = Math.floor(Date.now() / 1_000);
    let newestObservation = 0;
    state.tickerScores = state.tickerScores.map((score) => {
      const asset = byTicker.get(score.ticker);
      const latest = asset?.samples[asset.samples.length - 1];
      const openingPrice = score.openingPrice ?? 0;
      const movementBps =
        latest?.price && openingPrice > 0
          ? ((latest.price - openingPrice) * 10_000) / openingPrice
          : 0;
      const estimatedBand =
        state.marketMode === "FLAT"
          ? "FLAT"
          : movementBps >= 5
            ? "GREEN"
            : movementBps <= -5
              ? "RED"
              : "FLAT";
      const estimatedMultiplierBps =
        estimatedBand === "GREEN"
          ? 12_500
          : estimatedBand === "RED"
            ? 7_500
            : 10_000;
      const observationAt = asset?.samples.at(-1)?.timestamp;
      newestObservation = Math.max(newestObservation, observationAt ?? 0);
      return {
        ...score,
        currentPrice: latest?.price,
        poolSafety: asset?.dexMarket?.safety,
        volatilityRank:
          roster.selected.findIndex((item) => item.ticker === score.ticker) + 1,
        realizedMovementBps: asset
          ? asset.samples.slice(1).reduce((total, sample, index) => {
              const previous = asset.samples[index]?.price ?? 0;
              return previous > 0
                ? total +
                    Math.abs(((sample.price - previous) * 10_000) / previous)
                : total;
            }, 0)
          : 0,
        estimatedBand,
        estimatedMultiplierBps,
        observationAt,
      };
    });
    if (state.marketMode === "DEX" && now - newestObservation > 30) {
      state.freshness = newestObservation ? "delayed" : "offline";
      state.marketExplanation =
        "The latest onchain observation is stale. Calls are paused before payment.";
    }
    if (rpcHealth.status === "degraded") {
      state.freshness = "delayed";
      state.marketExplanation =
        "LAN RPC connection degraded. Actions are paused; no automatic Alchemy fallback is enabled.";
    }
    state.projection = buildRoundProjection(state);
    return NextResponse.json({
      ok: true,
      chainId: state.chainId,
      state,
      rpc: { policy: "LAN_ONLY", ...rpcHealth },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The live tape is unavailable.",
      },
      { status: 503 },
    );
  }
}
