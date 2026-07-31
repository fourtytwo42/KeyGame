import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getV4DevnetRewards } from "@/lib/web3/v4-devnet-runtime";
import { isV4DevnetRuntime } from "@/lib/server/runtime-deployment";
import { getV4ProductionRewards } from "@/lib/server/v4-production";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> },
) {
  const { address } = await context.params;
  if (!isAddress(address)) {
    return NextResponse.json(
      { ok: false, error: "Invalid address." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      ok: true,
      rewards: isV4DevnetRuntime()
        ? await getV4DevnetRewards(address as Address)
        : await getV4ProductionRewards(address as Address),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Rewards unavailable.",
      },
      { status: 503 },
    );
  }
}
