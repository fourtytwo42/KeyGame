import { NextResponse } from "next/server";
import { database } from "@/lib/server/db";
import { loadServerDeploymentWithKey } from "@/lib/server/deployment";
import { getProfile } from "@/lib/server/profiles";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ identity: string }> },
) {
  try {
    const { identity } = await params;
    const profile = await getProfile(identity);
    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "Profile not found." },
        { status: 404 },
      );
    }
    const { deploymentKey } = await loadServerDeploymentWithKey();
    const history = await database.query<{
      transaction_hash: string;
      block_number: string;
      contract_address: string;
      args: Record<string, string>;
    }>(
      `SELECT transaction_hash,block_number,contract_address,args
       FROM chain_events
       WHERE deployment_key=$1 AND event_name='BellClaimed'
         AND lower(args->>'player')=lower($2)
       ORDER BY block_number DESC,log_index DESC LIMIT 100`,
      [deploymentKey, profile.address],
    );
    return NextResponse.json({
      ok: true,
      profile: {
        address: profile.address,
        handle: profile.handle,
        displayName: profile.displayName,
      },
      calls: history.rows.map((row) => ({
        transactionHash: row.transaction_hash,
        blockNumber: Number(row.block_number),
        contractAddress: row.contract_address,
        tickerIndex: Number(row.args.ticker),
        sequence: Number(row.args.sequence),
        acceptedAt: Number(row.args.acceptedAt),
        multiplierBps: Number(row.args.multiplierBps),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "History unavailable.",
      },
      { status: 503 },
    );
  }
}
