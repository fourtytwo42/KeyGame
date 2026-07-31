#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

# The production controller remains hard-locked to chain 4663. Its scheduling,
# actor, budget, and authorization model is tested directly, while the existing
# isolated v4 integration deployment proves the same approval, contribution,
# timer, settlement, rollover, and reward ABIs on Anvil.
pnpm exec vitest run \
  src/lib/release/mainnet-v4.test.ts \
  src/lib/release/mainnet-canary.test.ts
pnpm test:integration
grep -q 'MAINNET_BROADCAST_ENABLED = false' script/DeployMainnet.s.sol
echo "Mainnet canary model and Anvil transaction-path dry run passed."
