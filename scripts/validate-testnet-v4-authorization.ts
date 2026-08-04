import { readFile } from "node:fs/promises";
import { parseTestnetSmokeAuthorization } from "../src/lib/release/testnet-v4";

const file = process.env.TESTNET_RELEASE_AUTHORIZATION_FILE;
const expectedCommit = process.env.KEYGAME_EXPECTED_SOURCE_COMMIT;
if (!file || !expectedCommit) {
  throw new Error(
    "TESTNET_RELEASE_AUTHORIZATION_FILE and KEYGAME_EXPECTED_SOURCE_COMMIT are required.",
  );
}
const authorization = parseTestnetSmokeAuthorization(
  await readFile(file, "utf8"),
  expectedCommit,
);
process.stdout.write(`${JSON.stringify(authorization)}\n`);
