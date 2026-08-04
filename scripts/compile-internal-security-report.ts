import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Suppression = Record<
  | "tool"
  | "rule"
  | "sourceLocation"
  | "rationale"
  | "reviewer"
  | "regressionTest",
  string
>;
type SlitherOutput = {
  results?: {
    detectors?: Array<{
      check?: string;
      impact?: string;
      elements?: Array<{ source_mapping?: { filename_relative?: string } }>;
    }>;
  };
};
type SemgrepOutput = {
  results?: Array<{
    check_id?: string;
    path?: string;
    start?: { line?: number };
    extra?: { severity?: string };
  }>;
};
type SolhintOutput = Array<{
  filePath?: string;
  ruleId?: string;
  severity?: string;
  line?: number;
}>;
type GitleaksOutput = Array<{
  RuleID?: string;
  File?: string;
  StartLine?: number;
}>;
type SuppressionOutput = { suppressions?: Suppression[] };
type AderynOutput = {
  high_issues?: {
    issues?: Array<{
      detector_name?: string;
      instances?: Array<{ contract_path?: string; line_no?: number }>;
    }>;
  };
};

const output =
  process.env.INTERNAL_SECURITY_OUTPUT ?? "artifacts/internal-security-review";
await mkdir(output, { recursive: true });

async function json<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(output, name), "utf8")) as T;
}
const slither = await json<SlitherOutput>("slither.json");
const aderyn = await json<AderynOutput>("aderyn.json");
const semgrep = await json<SemgrepOutput>("semgrep.json");
const solhint = await json<SolhintOutput>("solhint.json");
const gitleaks = await json<GitleaksOutput>("gitleaks.json");
const suppressions = await json<SuppressionOutput>("suppressions.json");
const requiredSuppressionFields: Array<keyof Suppression> = [
  "tool",
  "rule",
  "sourceLocation",
  "rationale",
  "reviewer",
  "regressionTest",
];
for (const suppression of suppressions.suppressions ?? []) {
  for (const field of requiredSuppressionFields) {
    if (!suppression[field]) {
      throw new Error(`Suppression is missing ${field}.`);
    }
  }
}

const findings = [
  ...(slither.results?.detectors ?? []).map((item) => ({
    tool: "slither",
    rule: item.check,
    severity: item.impact,
    source: item.elements?.[0]?.source_mapping?.filename_relative ?? "unknown",
  })),
  ...(semgrep.results ?? []).map((item) => ({
    tool: "semgrep",
    rule: item.check_id,
    severity: item.extra?.severity,
    source: `${item.path}:${item.start?.line ?? 0}`,
  })),
  ...(aderyn.high_issues?.issues ?? []).flatMap((issue) =>
    (issue.instances ?? []).map((instance) => ({
      tool: "aderyn",
      rule: issue.detector_name,
      severity: "High",
      source: `${instance.contract_path}:${instance.line_no ?? 0}`,
    })),
  ),
  ...solhint
    .filter((item) => item.ruleId)
    .map((item) => ({
      tool: "solhint",
      rule: item.ruleId,
      severity: item.severity === "Error" ? "High" : "Low",
      source: `${item.filePath}:${item.line ?? 0}`,
    })),
  ...gitleaks.map((item) => ({
    tool: "gitleaks",
    rule: item.RuleID,
    severity: "High",
    source: `${item.File}:${item.StartLine ?? 0}`,
  })),
];
function isSuppressed(item: (typeof findings)[number]) {
  return (suppressions.suppressions ?? []).some(
    (suppression) =>
      suppression.tool === item.tool &&
      suppression.rule === item.rule &&
      String(item.source).startsWith(suppression.sourceLocation),
  );
}
const unresolved = findings.filter(
  (item) =>
    ["critical", "high", "error"].includes(
      String(item.severity).toLowerCase(),
    ) && !isSuppressed(item),
);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const toolVersions = await json<Record<string, string>>("tool-versions.json");
const contracts = [
  "LastBellRoundV4",
  "RoundManagerV4",
  "RoundFactoryV5",
  "LifetimePointsVault",
  "RewardRouterV4",
  "RobinhoodStockSwapAdapter",
  "PaymentRouter",
];
const bytecodeHashes: Record<string, string> = {};
for (const contract of contracts) {
  const bytecode = execFileSync("forge", ["inspect", contract, "bytecode"], {
    encoding: "utf8",
  }).trim();
  bytecodeHashes[contract] = createHash("sha256")
    .update(bytecode)
    .digest("hex");
}
const report = {
  label: "INTERNALLY REVIEWED \u00b7 NO INDEPENDENT AUDIT",
  generatedAt: new Date().toISOString(),
  sourceCommit,
  toolVersions,
  findingCount: findings.length,
  unresolvedCriticalOrHigh: unresolved,
  suppressions: suppressions.suppressions ?? [],
  bytecodeHashes,
  passed: unresolved.length === 0,
  residualRisks: [
    "No external legal review was performed.",
    "No independent smart-contract audit was performed.",
    "Permissionless uncapped play and FCFS Rug Zone retain economic and automation risk.",
    "Internal review cannot establish regulatory eligibility or eliminate undiscovered defects.",
  ],
};
const reportJson = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(path.join(output, "internal-security-report.json"), reportJson);
await writeFile(
  path.join(output, "internal-security-report.md"),
  `# Saved by the Bell v4 Internal Security Review\n\n**${report.label}**\n\n- Source commit: \`${sourceCommit}\`\n- Findings: ${findings.length}\n- Unresolved critical/high: ${unresolved.length}\n- Passed: ${report.passed}\n\n## Residual risks\n\n${report.residualRisks.map((risk) => `- ${risk}`).join("\n")}\n`,
);
process.stdout.write(reportJson);
if (!report.passed) process.exitCode = 1;
