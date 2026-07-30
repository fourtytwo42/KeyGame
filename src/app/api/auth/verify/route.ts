import { NextResponse } from "next/server";
import { rateLimit, verifySiweChallenge } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const subject =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    await rateLimit("auth-verify", subject, 20, 60);
    const body = (await request.json()) as {
      message?: string;
      signature?: string;
    };
    if (!body.message || !body.signature) {
      throw new Error("Message and signature are required.");
    }
    const session = await verifySiweChallenge({
      request,
      message: body.message,
      signature: body.signature,
    });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sign-in failed.",
      },
      { status: 401 },
    );
  }
}
