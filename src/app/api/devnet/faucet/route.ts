import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { fundDevnetWallet } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_GAME_MODE !== "devnet") {
    return NextResponse.json(
      { ok: false, error: "The local faucet is disabled." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { address?: string };
  if (!body.address || !isAddress(body.address)) {
    return NextResponse.json(
      { ok: false, error: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  try {
    const hash = await fundDevnetWallet(body.address);
    return NextResponse.json({ ok: true, hash, amountUsd: 25 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Faucet failed.",
      },
      { status: 409 },
    );
  }
}
