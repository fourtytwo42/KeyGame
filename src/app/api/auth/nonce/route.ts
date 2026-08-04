import { NextResponse } from "next/server";
import { createSiweChallenge, rateLimit } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      address?: string;
      chainId?: number;
    };
    const mode = process.env.NEXT_PUBLIC_GAME_MODE || "devnet";
    const expectedChainId =
      mode === "mainnet" ? 4663 : mode === "testnet" ? 46630 : 31337;
    if (Number(body.chainId) !== expectedChainId) {
      return NextResponse.json(
        {
          ok: false,
          error: `Switch to chain ${expectedChainId} before signing in.`,
        },
        { status: 400 },
      );
    }
    const subject =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    await rateLimit("auth-nonce", subject, 12, 60);
    const challenge = await createSiweChallenge({
      request,
      address: body.address ?? "",
      chainId: expectedChainId,
    });
    return NextResponse.json({ ok: true, ...challenge });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sign-in unavailable.",
      },
      { status: 400 },
    );
  }
}
