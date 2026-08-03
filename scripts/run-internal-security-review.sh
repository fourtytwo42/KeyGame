#!/usr/bin/env bash
set -euo pipefail

export FOUNDRY_PROFILE=release

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
tool_root="${KEYGAME_SECURITY_TOOL_ROOT:-$HOME/.local/share/keygame-security}"
export PATH="$tool_root/bin:$PATH"
output="$(realpath -m "${INTERNAL_SECURITY_OUTPUT:-$project_root/artifacts/internal-security-review}")"
case "$output" in
  "$project_root"/artifacts/*) ;;
  *) echo "Security output must remain inside project artifacts/." >&2; exit 1 ;;
esac
mkdir -p "$output"
rm -f -- \
  "$output/slither.json" "$output/aderyn.md" "$output/aderyn.json" \
  "$output/aderyn.sarif" "$output/semgrep.json" "$output/semgrep.sarif" \
  "$output/solhint.json" "$output/gitleaks.json" \
  "$output/internal-security-report.json" "$output/internal-security-report.md" \
  "$output/SHA256SUMS"

for tool in slither aderyn semgrep solhint gitleaks; do
  command -v "$tool" >/dev/null || { echo "$tool is required by security/toolchain.lock.json" >&2; exit 1; }
done
if command -v echidna >/dev/null; then stateful_fuzzer=echidna
elif command -v medusa >/dev/null; then stateful_fuzzer=medusa
else echo "echidna or medusa is required." >&2; exit 1
fi

jq -n \
  --arg slither "$(slither --version 2>&1 | head -1)" \
  --arg aderyn "$(aderyn --version 2>&1 | head -1)" \
  --arg semgrep "$(semgrep --version 2>/dev/null | tail -1)" \
  --arg solhint "$(solhint --version 2>&1 | head -1)" \
  --arg gitleaks "$(gitleaks version 2>&1 | head -1)" \
  --arg statefulFuzzer "$($stateful_fuzzer --version 2>&1 | head -1)" \
  '{slither:$slither,aderyn:$aderyn,semgrep:$semgrep,solhint:$solhint,gitleaks:$gitleaks,statefulFuzzer:$statefulFuzzer}' \
  >"$output/tool-versions.json"
INTERNAL_SECURITY_OUTPUT="$output" pnpm exec tsx scripts/verify-security-tool-versions.ts \
  >"$output/tool-version-verification.json"

cp security/suppressions.json "$output/suppressions.json"
pnpm contracts:check-sizes
forge build
slither . --filter-paths 'contracts/(mocks|LastBellRound.sol|RoundManager.sol|DexTwapMarketDataVerifier.sol|TestnetAttestedMarketDataVerifier.sol)' --json "$output/slither.json" || test -s "$output/slither.json"
aderyn . -x 'contracts/mocks,contracts/LastBellRound.sol,contracts/RoundManager.sol,contracts/DexTwapMarketDataVerifier.sol,contracts/TestnetAttestedMarketDataVerifier.sol' -o "$output/aderyn.md"
aderyn . -x 'contracts/mocks,contracts/LastBellRound.sol,contracts/RoundManager.sol,contracts/DexTwapMarketDataVerifier.sol,contracts/TestnetAttestedMarketDataVerifier.sol' -o "$output/aderyn.json"
aderyn . -x 'contracts/mocks,contracts/LastBellRound.sol,contracts/RoundManager.sol,contracts/DexTwapMarketDataVerifier.sol,contracts/TestnetAttestedMarketDataVerifier.sol' -o "$output/aderyn.sarif"
semgrep scan --config security/semgrep.yml --json --output "$output/semgrep.json" contracts scripts services src
semgrep scan --config security/semgrep.yml --sarif --output "$output/semgrep.sarif" contracts scripts services src
NO_UPDATE_NOTIFIER=1 solhint 'contracts/**/*.sol' --formatter json >"$output/solhint.json" || test -s "$output/solhint.json"
source_snapshot="$(mktemp -d)"
trap 'rm -rf -- "$source_snapshot"' EXIT
(git ls-files -z | tar --null -T - -cf -) | tar -xf - -C "$source_snapshot"
gitleaks dir "$source_snapshot" --config security/gitleaks.toml --no-banner --redact --report-format json --report-path "$output/gitleaks.json" || test -s "$output/gitleaks.json"
test -s "$output/gitleaks.json" || printf '[]\n' >"$output/gitleaks.json"

FOUNDRY_PROFILE=v4-torture forge test --match-contract LastBellV4InvariantTest
bash scripts/run-security-negative-controls.sh
pnpm exec tsx scripts/compile-internal-security-report.ts
(cd "$output" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)
