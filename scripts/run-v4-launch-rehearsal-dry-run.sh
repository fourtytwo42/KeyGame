#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

# The rehearsal controller is hard-locked to chain 31337. The integration
# deployment proves the same approval, contribution, timer, settlement,
# rollover, and reward ABIs without spending testnet or mainnet funds.
NODE_ENV=test pnpm exec vitest run \
  src/lib/release/mainnet-v4.test.ts \
  src/lib/release/launch-rehearsal.test.ts
pnpm test:integration
pnpm test:migrations
grep -q 'MAINNET_BROADCAST_ENABLED = true' script/DeployMainnet.s.sol
grep -q 'verify-mainnet-planned-deployment.ts' scripts/deploy-mainnet-v4.sh
grep -q 'MAINNET_RELEASE_AUTHORIZATION_FILE.consumed' scripts/deploy-mainnet-v4.sh
echo "Devnet launch rehearsal model and Anvil transaction-path dry run passed."
