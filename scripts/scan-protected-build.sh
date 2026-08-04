#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if [[ "${NEXT_PUBLIC_UAT_WALLET_ENABLED:-false}" == "true" ]] \
  || [[ "${KEYGAME_UAT_ENABLED:-false}" == "true" ]]; then
  echo "Protected builds refuse UAT wallet or faucet flags." >&2
  exit 1
fi
if [[ "${NEXT_PUBLIC_GAME_MODE:-}" == "mainnet" ]] \
  && [[ -n "${TESTNET_ATTESTOR_ADDRESS:-}" ]]; then
  echo "Mainnet build contains a testnet attestor configuration." >&2
  exit 1
fi

pnpm build
dist_dir="${NEXT_DIST_DIR:-.next}"
forbidden='keygame:uat-testnet-wallet|Built-in Testnet Wallet|FUND TEST WALLET|Test ETH and mock USDG funded|Injected testnet-only stale DEX observation fault|SOAK_CONTROL_TOKEN'
if [[ "${NEXT_PUBLIC_GAME_MODE:-}" == "mainnet" ]]; then
  forbidden="${forbidden}|TestnetAttestedMarketDataVerifier|testnet-dex-attested|MockStockSwapAdapter|TestnetMockUSDG|mock-stock-swap-adapter|v4-torture:"
fi
if find "$dist_dir/static" "$dist_dir/server" -type f \
  -name '*.js' -print0 \
  | xargs -0 -r grep -a -n -E "$forbidden"; then
  echo "Protected bundle contains forbidden UAT/testnet-only code." >&2
  exit 1
fi
echo "Protected bundle scan passed."
