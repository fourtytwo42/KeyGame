#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf -- "$temporary"' EXIT
(
  cd "$project_root"
  git ls-files --cached --others --exclude-standard -z \
    | tar --null -T - -cf -
) | tar -xf - -C "$temporary"

# Remove the manager authorization guard. The focused regression must fail.
perl -0pi -e 's/function setKeeper\(address nextKeeper\) external onlyAdmin/function setKeeper(address nextKeeper) external/' "$temporary/contracts/RoundManagerV4.sol"
if (cd "$temporary" && forge test --match-test test_OnlyAdminCanRotateKeeper >/dev/null 2>&1); then
  echo "Negative control failed: keeper authorization mutation survived." >&2
  exit 1
fi

# Remove callback caller authentication. The spoofed-callback regression must fail.
perl -0pi -e 's/msg\.sender != activePool \|\| msg\.sender != data\.pool/false/' "$temporary/contracts/RobinhoodStockSwapAdapter.sol"
if (cd "$temporary" && forge test --match-test test_CallbackCannotBeSpoofed >/dev/null 2>&1); then
  echo "Negative control failed: callback authentication mutation survived." >&2
  exit 1
fi
echo "Security negative controls detected both intentional mutations."
