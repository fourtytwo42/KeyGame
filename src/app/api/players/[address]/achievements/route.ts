import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { database } from "@/lib/server/db";
import { loadServerDeploymentWithKey } from "@/lib/server/deployment";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!isAddress(address))
    return NextResponse.json(
      { ok: false, error: "Invalid player address." },
      { status: 400 },
    );
  try {
    const { deploymentKey } = await loadServerDeploymentWithKey();
    const rows = await database.query(
      `SELECT achievement_id AS id,kind,player_address AS player,ticker,title,detail,
              deployment_key AS "deploymentKey",round_id::text AS "roundId",
              block_number::text AS "blockNumber",log_index AS "logIndex",
              transaction_hash AS "transactionHash",contract_version AS "contractVersion"
       FROM player_achievements
       WHERE deployment_key=$1 AND lower(player_address)=lower($2) AND canonical=true
       ORDER BY round_id DESC,block_number DESC NULLS LAST,log_index DESC NULLS LAST`,
      [deploymentKey, address],
    );
    return NextResponse.json({ ok: true, address, achievements: rows.rows });
  } catch {
    return NextResponse.json({
      ok: true,
      address,
      achievements: [],
      note: "Achievement index is warming up.",
    });
  }
}
