#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

[[ "${KEYGAME_TESTNET_V4_BROADCAST:-}" == "true" ]] || {
  echo "Testnet v4 broadcast is locked." >&2
  exit 1
}
[[ -n "${TESTNET_RELEASE_AUTHORIZATION_FILE:-}" ]] \
  && [[ -f "$TESTNET_RELEASE_AUTHORIZATION_FILE" ]] || {
  echo "A testnet release authorization file outside the repository is required." >&2
  exit 1
}

commit="$(git rev-parse HEAD)"
KEYGAME_EXPECTED_SOURCE_COMMIT="$commit" \
  pnpm exec tsx scripts/validate-testnet-v4-authorization.ts >/dev/null
for required in \
  ROBINHOOD_VERIFIER_TYPE ROBINHOOD_VERIFIER_URL DEPLOYER_ADDRESS \
  KEYGAME_DEPLOYER_KEYSTORE KEYGAME_DEPLOYER_PASSWORD_FILE \
  KEYGAME_RELEASE_UPSTREAM; do
  [[ -n "${!required:-}" ]] || {
    echo "$required is required." >&2
    exit 1
  }
done
for secret_file in \
  "$KEYGAME_DEPLOYER_KEYSTORE" "$KEYGAME_DEPLOYER_PASSWORD_FILE"; do
  [[ -f "$secret_file" && ! -L "$secret_file" ]] || {
    echo "Release credential file is missing or is a symlink: $secret_file" >&2
    exit 1
  }
done
derived_deployer="$(cast wallet address \
  --keystore "$KEYGAME_DEPLOYER_KEYSTORE" \
  --password-file "$KEYGAME_DEPLOYER_PASSWORD_FILE")"
[[ "${derived_deployer,,}" == "${DEPLOYER_ADDRESS,,}" ]] || {
  echo "Configured deployer does not match the encrypted keystore." >&2
  exit 1
}
for legacy_role in KEEPER_ADDRESS FAUCET_ADDRESS TREASURY_ADDRESS \
  MANAGER_ADMIN_SAFE MARKET_ADMIN_SAFE TREASURY_SAFE; do
  if [[ -n "${!legacy_role:-}" ]] \
    && [[ "${!legacy_role,,}" != "${DEPLOYER_ADDRESS,,}" ]]; then
    echo "$legacy_role conflicts with required single-deployer custody." >&2
    exit 1
  fi
done
[[ -z "$(git status --porcelain)" ]] || {
  echo "Refusing to deploy dirty or untracked source." >&2
  exit 1
}
if [[ -f deployments/46630.json ]] \
  && [[ "$(jq -r '.contractVersion // empty' deployments/46630.json)" == "last-bell-v4-stock-pot" ]]; then
  echo "A v4 testnet manifest already exists; refusing a duplicate deployment." >&2
  exit 1
fi
upstream_commit="$(git rev-parse "$KEYGAME_RELEASE_UPSTREAM" 2>/dev/null || true)"
[[ -n "$upstream_commit" && "$commit" == "$upstream_commit" ]] || {
  echo "Refusing to deploy source that is not pushed to its configured upstream." >&2
  exit 1
}

bash scripts/preflight-testnet-v4.sh
forge script script/DeployTestnetV4.s.sol:DeployTestnetV4 \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  --sender "$DEPLOYER_ADDRESS" \
  --keystore "$KEYGAME_DEPLOYER_KEYSTORE" \
  --password-file "$KEYGAME_DEPLOYER_PASSWORD_FILE" \
  --broadcast
KEYGAME_WRITE_MANIFEST_CHAIN_ID=46630 \
  pnpm exec tsx scripts/write-v4-deployment-manifest.ts
mkdir -p artifacts/deployment-verification
KEYGAME_DEPLOYMENT_MANIFEST="$project_root/deployments/46630.json" \
KEYGAME_ROLE_CUSTODY_EVIDENCE="$project_root/artifacts/deployment-verification/46630-role-custody.json" \
  pnpm release:verify-role-custody

verify_args=(
  --resume --verify
  --verifier "$ROBINHOOD_VERIFIER_TYPE"
  --verifier-url "$ROBINHOOD_VERIFIER_URL"
)
if [[ -n "${ROBINHOOD_VERIFIER_API_KEY:-}" ]]; then
  verify_args+=(--etherscan-api-key "$ROBINHOOD_VERIFIER_API_KEY")
fi
forge script script/DeployTestnetV4.s.sol:DeployTestnetV4 \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  --sender "$DEPLOYER_ADDRESS" \
  --keystore "$KEYGAME_DEPLOYER_KEYSTORE" \
  --password-file "$KEYGAME_DEPLOYER_PASSWORD_FILE" \
  "${verify_args[@]}" \
  | tee artifacts/deployment-verification/46630-v4.log
