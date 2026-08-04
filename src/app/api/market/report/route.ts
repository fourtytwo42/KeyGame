import { NextResponse } from "next/server";
import { tickerSlots } from "@/lib/game/constants";
import type { TickerId } from "@/lib/game/types";
import { createMockMarketReport } from "@/lib/web3/devnet";
import { database } from "@/lib/server/db";
import { loadServerDeploymentWithKey } from "@/lib/server/deployment";
import { deploymentPublicClient } from "@/lib/server/rpc-client";
import { lastBellAbi, roundManagerAbi } from "@/lib/web3/last-bell-abi";
import { hexToString, zeroAddress } from "viem";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json(
      { ok: false, error: "Unknown ticker." },
      { status: 400 },
    );
  }

  if (process.env.NEXT_PUBLIC_GAME_MODE === "devnet") {
    if (!tickerSlots.some((slot) => slot.id === ticker)) {
      return NextResponse.json(
        { ok: false, error: "Unknown ticker." },
        { status: 400 },
      );
    }
    try {
      return NextResponse.json({
        ok: true,
        ...(await createMockMarketReport(ticker as TickerId)),
        source: "mock-verifier",
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "The market report is unavailable.",
        },
        { status: 503 },
      );
    }
  }

  let roundAddress: `0x${string}` | undefined;
  let tickerIndex = -1;
  let marketMode = 1;
  const adapterUrl = process.env.DEX_MARKET_ADAPTER_URL;
  const adapterToken = process.env.DEX_MARKET_ADAPTER_TOKEN;
  let sourceChainId = 4663;
  try {
    const { manifest, deploymentKey } = await loadServerDeploymentWithKey();
    sourceChainId = manifest.chainId;
    const client = deploymentPublicClient(manifest);
    const [active, prepared] = await Promise.all([
      client.readContract({
        address: manifest.contracts.manager,
        abi: roundManagerAbi,
        functionName: "activeRound",
      }),
      client.readContract({
        address: manifest.contracts.manager,
        abi: roundManagerAbi,
        functionName: "preparedRound",
      }),
    ]);
    roundAddress = prepared !== zeroAddress ? prepared : active;
    if (roundAddress === zeroAddress) throw new Error("No playable round.");
    const configs = await Promise.all(
      [0n, 1n, 2n, 3n].map((index) =>
        client.readContract({
          address: roundAddress!,
          abi: lastBellAbi,
          functionName: "tickerConfigs",
          args: [index],
        }),
      ),
    );
    tickerIndex = configs.findIndex(
      (config) =>
        hexToString(config[0], { size: 32 }).replace(/\0/g, "") === ticker,
    );
    if (tickerIndex < 0) throw new Error("Ticker is not in this round.");
    marketMode = Number(
      await client.readContract({
        address: roundAddress,
        abi: lastBellAbi,
        functionName: "marketMode",
      }),
    );
    const initialized = await client.readContract({
      address: roundAddress,
      abi: lastBellAbi,
      functionName: "initialized",
    });
    if (!initialized) {
      let openingReports = ["0x", "0x", "0x", "0x"];
      if (marketMode === 1 && manifest.chainId !== 4663) {
        if (!adapterUrl || !adapterToken) {
          throw new Error(
            "DEX observation attestation is not configured for activation.",
          );
        }
        const opening = await fetch(
          `${adapterUrl}?opening=true&round=${roundAddress}&markets=${configs
            .map((config) => config[2])
            .join(",")}`,
          {
            cache: "no-store",
            headers: { authorization: `Bearer ${adapterToken}` },
            signal: AbortSignal.timeout(5_000),
          },
        );
        const payload = (await opening.json()) as {
          reports?: string[];
          error?: string;
        };
        if (
          !opening.ok ||
          payload.reports?.length !== 4 ||
          payload.reports.some((report) => !/^0x[0-9a-fA-F]+$/.test(report))
        ) {
          throw new Error(
            payload.error || "Fresh opening DEX observations are unavailable.",
          );
        }
        openingReports = payload.reports;
      }
      const idempotencyKey = `activate:${roundAddress.toLowerCase()}`;
      await database.query(
        `INSERT INTO keeper_jobs(
           deployment_key,chain_id,idempotency_key,job_type,payload)
         VALUES($1,$2,$3,'activate',$4)
         ON CONFLICT(deployment_key,idempotency_key) DO NOTHING`,
        [
          deploymentKey,
          manifest.chainId,
          idempotencyKey,
          JSON.stringify({ openingReports }),
        ],
      );
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        if (
          await client.readContract({
            address: roundAddress,
            abi: lastBellAbi,
            functionName: "initialized",
          })
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (
        !(await client.readContract({
          address: roundAddress,
          abi: lastBellAbi,
          functionName: "initialized",
        }))
      ) {
        throw new Error("The round keeper did not activate the broadcast.");
      }
    }
    if (marketMode === 0) {
      return NextResponse.json({
        ok: true,
        ticker,
        tickerIndex,
        report: "0x",
        source: "flat-round",
        verifierType: "none",
      });
    }
    if (sourceChainId === 4663) {
      return NextResponse.json({
        ok: true,
        ticker,
        tickerIndex,
        report: "0x",
        source: "uniswap-v3-twap",
        verifierType: "dex-onchain",
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Round activation failed.",
      },
      { status: 503 },
    );
  }

  if (!adapterUrl || !adapterToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "DEX observation attestation is not configured for this deployment.",
      },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(
      `${adapterUrl}?ticker=${encodeURIComponent(ticker)}&round=${roundAddress}`,
      {
        cache: "no-store",
        headers: { authorization: `Bearer ${adapterToken}` },
        signal: AbortSignal.timeout(2_500),
      },
    );
    const payload = (await upstream.json()) as {
      report?: string;
      price?: number;
      observedAt?: number;
      sourceReportHash?: string;
      validFrom?: number;
      expiresAt?: number;
      band?: string;
      multiplierBps?: number;
      error?: string;
    };
    if (
      !upstream.ok ||
      !/^0x[0-9a-fA-F]+$/.test(payload.report ?? "") ||
      !Number.isFinite(payload.price) ||
      !Number.isInteger(payload.observedAt)
    ) {
      throw new Error(payload.error || "Malformed signed report response.");
    }
    return NextResponse.json({
      ok: true,
      ticker,
      tickerIndex,
      source: "uniswap-v3-twap",
      ...payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Signed market data is unavailable.",
      },
      { status: 503 },
    );
  }
}
