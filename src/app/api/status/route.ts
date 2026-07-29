import { NextResponse } from "next/server";
import { devnetPublicClient } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const block = await devnetPublicClient.getBlockNumber();
    return NextResponse.json({
      ok: true,
      mode: process.env.NEXT_PUBLIC_GAME_MODE || "simulator",
      chainId: 31337,
      block: block.toString(),
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        mode: process.env.NEXT_PUBLIC_GAME_MODE || "simulator",
        chainId: 31337,
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
