import { NextResponse } from "next/server";
import type { FactionId } from "@/lib/game/types";
import { factions } from "@/lib/game/constants";
import { sendDevnetAction, type DevnetAction } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_GAME_MODE !== "devnet") {
    return NextResponse.json(
      { ok: false, error: "Local devnet controls are disabled." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      faction?: string;
    };
    const supported: DevnetAction[] = [
      "enter",
      "claim",
      "demo-claim",
      "finalize",
      "revoke",
      "claim-holder",
      "claim-faction",
      "claim-refund",
    ];
    if (!supported.includes(body.action as DevnetAction)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported devnet action." },
        { status: 400 },
      );
    }
    if (
      (body.action === "enter" || body.action === "demo-claim") &&
      !factions.some((faction) => faction.id === body.faction)
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid faction." },
        { status: 400 },
      );
    }
    const result = await sendDevnetAction(
      body.action as DevnetAction,
      body.faction as FactionId | undefined,
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
