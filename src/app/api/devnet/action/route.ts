import { NextResponse } from "next/server";
import type { TickerId } from "@/lib/game/types";
import { tickerSlots } from "@/lib/game/constants";
import {
  isDevnetRuntime,
  isV4DevnetRuntime,
} from "@/lib/server/runtime-deployment";
import { sendDevnetAction, type DevnetAction } from "@/lib/web3/devnet";
import {
  sendV4DevnetAction,
  type V4DevnetAction,
} from "@/lib/web3/v4-devnet-runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDevnetRuntime()) {
    return NextResponse.json(
      { ok: false, error: "Local devnet controls are disabled." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      ticker?: string;
      amountUsd?: number;
    };
    const supported: string[] = [
      "enter",
      "claim",
      "demo-claim",
      "finalize",
      "revoke",
      "claim-holder",
      "claim-print",
      "claim-lifetime",
      "claim-refund",
    ];
    if (!supported.includes(body.action as DevnetAction)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported devnet action." },
        { status: 400 },
      );
    }
    if (
      (body.action === "enter" ||
        body.action === "claim" ||
        body.action === "demo-claim") &&
      !tickerSlots.some((ticker) => ticker.id === body.ticker)
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid ticker." },
        { status: 400 },
      );
    }
    const result = isV4DevnetRuntime()
      ? await sendV4DevnetAction(
          body.action as V4DevnetAction,
          body.ticker as TickerId | undefined,
          body.amountUsd,
        )
      : await sendDevnetAction(
          body.action as DevnetAction,
          body.ticker as TickerId | undefined,
        );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown devnet error",
      },
      { status: 409 },
    );
  }
}
