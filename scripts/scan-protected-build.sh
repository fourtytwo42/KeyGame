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
forbidden='keygame:uat-testnet-wallet|Built-in Testnet Wallet|FUND TEST WALLET|Test ETH and mock USDG funded'
if [[ "${NEXT_PUBLIC_GAME_MODE:-}" == "mainnet" ]]; then
  forbidden="${forbidden}|TestnetAttestedMarketDataVerifier|testnet-attested"
fi
if grep -R -a -n -E "$forbidden" .next/static .next/server; then
  echo "Protected bundle contains forbidden UAT/testnet-only code." >&2
  exit 1
fi
echo "Protected bundle scan passed."
