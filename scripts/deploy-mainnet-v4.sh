#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

die() { echo "$*" >&2; exit 1; }
required=(
  ROBINHOOD_MAINNET_RPC_URL ROBINHOOD_MAINNET_FALLBACK_RPC_URL
  DEPLOYER_ADDRESS DEPLOYER_KEYSTORE DEPLOYER_PASSWORD_FILE
  RELEASE_UPSTREAM_REF MAINNET_RELEASE_AUTHORIZATION_FILE
  INITIAL_ROUND_ID INITIAL_STOCK_0 INITIAL_STOCK_1 INITIAL_STOCK_2 INITIAL_STOCK_3
  INITIAL_SYMBOL_0 INITIAL_SYMBOL_1 INITIAL_SYMBOL_2 INITIAL_SYMBOL_3
  ROBINHOOD_VERIFIER_TYPE ROBINHOOD_VERIFIER_URL
)
for name in "${required[@]}"; do [[ -n "${!name:-}" ]] || die "$name is required."; done
for legacy_role in KEEPER_ADDRESS FAUCET_ADDRESS TREASURY_ADDRESS \
  MANAGER_ADMIN_SAFE MARKET_ADMIN_SAFE TREASURY_SAFE; do
  if [[ -n "${!legacy_role:-}" ]] \
    && [[ "${!legacy_role,,}" != "${DEPLOYER_ADDRESS,,}" ]]; then
    die "$legacy_role conflicts with required single-deployer custody."
  fi
done
[[ "$DEPLOYER_KEYSTORE" = /* && -f "$DEPLOYER_KEYSTORE" ]] || die "DEPLOYER_KEYSTORE must be an existing absolute path."
[[ "$DEPLOYER_PASSWORD_FILE" = /* && -f "$DEPLOYER_PASSWORD_FILE" ]] || die "DEPLOYER_PASSWORD_FILE must be an existing absolute path."
case "$DEPLOYER_KEYSTORE:$DEPLOYER_PASSWORD_FILE:$MAINNET_RELEASE_AUTHORIZATION_FILE" in
  *"$project_root"*) die "Keys, passwords, and authorization must remain outside the repository." ;;
esac

commit="$(git rev-parse HEAD)"
[[ -z "$(git status --porcelain)" ]] || die "Refusing dirty or untracked source."
[[ "$commit" == "$(git rev-parse "$RELEASE_UPSTREAM_REF")" ]] || die "Release commit does not exactly match RELEASE_UPSTREAM_REF."
if [[ -f deployments/4663.json ]] && [[ "$(jq -r '.contractVersion // empty' deployments/4663.json)" == "last-bell-v4-stock-pot" ]]; then
  die "A v4 mainnet manifest already exists; refusing a duplicate deployment."
fi

keystore_address="$(cast wallet address --keystore "$DEPLOYER_KEYSTORE" --password-file "$DEPLOYER_PASSWORD_FILE")"
[[ "${keystore_address,,}" == "${DEPLOYER_ADDRESS,,}" ]] || die "Encrypted keystore does not match DEPLOYER_ADDRESS."

check_rpc() {
  local url="$1"
  [[ "$(cast chain-id --rpc-url "$url")" == "4663" ]] || die "RPC is not chain 4663."
  [[ "$(cast rpc --rpc-url "$url" eth_syncing | tr -d '[:space:]')" == "false" ]] || die "RPC is not synchronized."
  [[ "$(cast rpc --rpc-url "$url" eth_accounts | tr -d '[:space:]')" == "[]" ]] || die "RPC exposes unlocked accounts."
}
check_rpc "$ROBINHOOD_MAINNET_RPC_URL"
check_rpc "$ROBINHOOD_MAINNET_FALLBACK_RPC_URL"
primary_head="$(cast block-number --rpc-url "$ROBINHOOD_MAINNET_RPC_URL")"
fallback_head="$(cast block-number --rpc-url "$ROBINHOOD_MAINNET_FALLBACK_RPC_URL")"
delta=$(( primary_head > fallback_head ? primary_head - fallback_head : fallback_head - primary_head ))
(( delta <= 5 )) || die "RPC providers differ by more than five blocks."
common_head=$(( primary_head < fallback_head ? primary_head : fallback_head ))
primary_hash="$(cast block "$common_head" --field hash --rpc-url "$ROBINHOOD_MAINNET_RPC_URL")"
fallback_hash="$(cast block "$common_head" --field hash --rpc-url "$ROBINHOOD_MAINNET_FALLBACK_RPC_URL")"
[[ "$primary_hash" == "$fallback_hash" ]] || die "RPC providers disagree on the canonical common block."

export SOURCE_COMMIT="$commit"
export MAINNET_MANIFEST_PATH="$project_root/deployments/4663.template.json"
pnpm exec tsx scripts/verify-mainnet-authorization.ts > /tmp/keygame-mainnet-authorization.json
jq -e '.walletUatDisposition == "SKIPPED_BY_OPERATOR"
  and .browserWalletCompatibility == "UNVERIFIED"
  and .launchValidation == "READ_ONLY"
  and .promotionRequiresSeparateAuthorization == true
  and (.authorizedAt | type == "string")
  and .maximumDeployments == 1' /tmp/keygame-mainnet-authorization.json >/dev/null \
  || die "Mainnet authorization does not match the approved wallet waiver and read-only launch scope."

preflight_file="$(mktemp)"
trap 'rm -f "$preflight_file" /tmp/keygame-mainnet-authorization.json' EXIT
pnpm exec tsx scripts/preflight-mainnet-v4.ts >"$preflight_file"
for index in 0 1 2 3; do
  variable="INITIAL_SYMBOL_${index}"
  jq -e --arg symbol "${!variable}" '.safeSymbols | index($symbol) != null' "$preflight_file" >/dev/null || die "Initial roster symbol ${!variable} is not currently safe."
done

pnpm release:scan:mainnet
pnpm security:review
forge fmt --check
forge test
RUN_ROBINHOOD_MAINNET_FORK=true ROBINHOOD_MAINNET_FORK_RPC_URL="$ROBINHOOD_MAINNET_RPC_URL" forge test --match-contract RobinhoodMainnetForkTest

[[ "${KEYGAME_MAINNET_V4_BROADCAST:-}" == "true" ]] || die "Mainnet broadcast remains locked."
# DeployMainnetV4 has a second compile-time false lock. Only a dedicated reviewed
# release commit may deliberately change it.
forge script script/DeployMainnet.s.sol:DeployMainnetV4 \
  --rpc-url "$ROBINHOOD_MAINNET_RPC_URL" \
  --sender "$DEPLOYER_ADDRESS" \
  --keystore "$DEPLOYER_KEYSTORE" \
  --password-file "$DEPLOYER_PASSWORD_FILE" \
  --broadcast

KEYGAME_WRITE_MANIFEST_CHAIN_ID=4663 pnpm exec tsx scripts/write-v4-deployment-manifest.ts
mkdir -p artifacts/deployment-verification
KEYGAME_DEPLOYMENT_MANIFEST="$project_root/deployments/4663.json" \
KEYGAME_ROLE_CUSTODY_EVIDENCE="$project_root/artifacts/deployment-verification/4663-role-custody.json" \
  pnpm release:verify-role-custody
verify_args=(--resume --broadcast --verify --verifier "$ROBINHOOD_VERIFIER_TYPE" --verifier-url "$ROBINHOOD_VERIFIER_URL")
if [[ -n "${ROBINHOOD_VERIFIER_API_KEY:-}" ]]; then verify_args+=(--etherscan-api-key "$ROBINHOOD_VERIFIER_API_KEY"); fi
forge script script/DeployMainnet.s.sol:DeployMainnetV4 \
  --rpc-url "$ROBINHOOD_MAINNET_RPC_URL" \
  --sender "$DEPLOYER_ADDRESS" \
  --keystore "$DEPLOYER_KEYSTORE" \
  --password-file "$DEPLOYER_PASSWORD_FILE" \
  "${verify_args[@]}" | tee artifacts/deployment-verification/4663-v4.log
