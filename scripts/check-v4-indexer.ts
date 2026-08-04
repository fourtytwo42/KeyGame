import { createPublicClient, http, type Address } from "viem";
import { lastBellV4Abi } from "../src/lib/web3/last-bell-abi";
import { localDevnet } from "../src/lib/web3/chains";
import { deploymentKeyFor, loadManifest, pool } from "../services/common";

process.env.KEYGAME_CHAIN_ID ??= "31337";
const manifest = await loadManifest();
if (manifest.chainId !== 31337) throw new Error("Devnet only.");
const deploymentKey = deploymentKeyFor(manifest);
const client = createPublicClient({
  chain: localDevnet,
  transport: http(manifest.rpc.primary),
});
const rounds = await pool.query<{
  round_id: string;
  contract_address: Address;
}>(
  `SELECT round_id::text,contract_address FROM rounds
   WHERE deployment_key=$1 ORDER BY round_id`,
  [deploymentKey],
);

let chainClaims = 0;
let chainSettlements = 0;
const missing: Array<Record<string, unknown>> = [];
for (const round of rounds.rows) {
  const [claims, settlements, indexed] = await Promise.all([
    client.getContractEvents({
      address: round.contract_address,
      abi: lastBellV4Abi,
      eventName: "BellClaimed",
      fromBlock: BigInt(manifest.deploymentBlock),
    }),
    client.getContractEvents({
      address: round.contract_address,
      abi: lastBellV4Abi,
      eventName: "RoundSettled",
      fromBlock: BigInt(manifest.deploymentBlock),
    }),
    pool.query<{ claims: string; settlements: string }>(
      `SELECT
         count(*) FILTER (WHERE event_name='BellClaimed')::text AS claims,
         count(*) FILTER (WHERE event_name='RoundSettled')::text AS settlements
       FROM chain_events
       WHERE deployment_key=$1 AND lower(contract_address)=lower($2)`,
      [deploymentKey, round.contract_address],
    ),
  ]);
  chainClaims += claims.length;
  chainSettlements += settlements.length;
  const indexedClaims = Number(indexed.rows[0]?.claims ?? 0);
  const indexedSettlements = Number(indexed.rows[0]?.settlements ?? 0);
  if (
    indexedClaims !== claims.length ||
    indexedSettlements !== settlements.length
  ) {
    missing.push({
      roundId: round.round_id,
      address: round.contract_address,
      chainClaims: claims.length,
      indexedClaims,
      chainSettlements: settlements.length,
      indexedSettlements,
    });
  }
}

const result = {
  rounds: rounds.rowCount,
  chainClaims,
  chainSettlements,
  missingRounds: missing.length,
  missing: missing.slice(0, 20),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (missing.length) process.exitCode = 1;
await pool.end();
