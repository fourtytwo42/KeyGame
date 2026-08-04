import { readFile } from "node:fs/promises";

const output =
  process.env.INTERNAL_SECURITY_OUTPUT ?? "artifacts/internal-security-review";
const expected = JSON.parse(
  await readFile("security/toolchain.lock.json", "utf8"),
) as Record<string, string>;
const actual = JSON.parse(
  await readFile(`${output}/tool-versions.json`, "utf8"),
) as Record<string, string>;
const checks: Array<[string, string]> = [
  ["slither", expected.slither],
  ["aderyn", expected.aderyn],
  ["semgrep", expected.semgrep],
  ["solhint", expected.solhint],
  ["gitleaks", expected.gitleaks],
  ["statefulFuzzer", "2.3.2"],
];
for (const [name, version] of checks) {
  if (!actual[name]?.includes(version)) {
    throw new Error(
      `${name} version mismatch: expected ${version}, got ${actual[name] ?? "missing"}`,
    );
  }
}
process.stdout.write(
  `${JSON.stringify({ verified: true, checks }, null, 2)}\n`,
);
