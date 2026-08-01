# Last Bell v4 release runbook

Status: fail-closed. This runbook does not authorize a broadcast.

## 1. Build the internally reviewed candidate

1. Work only from the authoritative KeyGame VM.
2. Confirm the branch is clean and pushed. GitHub is source hosting only.
3. Run `pnpm security:review`, complete the manual checklist, then run `pnpm release:package:audit`.
4. Review the generated ABI, storage layout, bytecode hashes, mainnet-fork
   evidence, canonical-market preflight, torture baseline, and `SHA256SUMS`.
5. Freeze the exact commit. Contract or accounting changes invalidate the
   candidate until the torture campaign and release gates are rerun.

## 2. Two-round testnet smoke

Complete. The mock-only deployment from commit `2b4fcfa` settled exactly two
rounds with two players per round, exercised every reward class, reconciled all
eight token allocations, and left round three unstarted. The keeper is stopped
and this evidence must remain immutable.

## 3. Internal assurance, acknowledgement, and role setup

- Complete the pinned analyzer, manual review, negative-control, fork, invariant,
  hostile-token, protected-build, and full torture gates.
- Record the unsigned acknowledgement `No legal review or independent audit`.
- Derive the deployer from its encrypted external keystore and require manager
  admin, market admin, keeper, treasury, and conversion authority to match it.
- Run `pnpm release:verify-role-custody` and archive the evidence.
- Exercise independent manager, market, and treasury two-step transfers on a
  fork before returning custody to the deployer.

## 4. External-wallet UAT disposition

External-wallet UAT is `SKIPPED_BY_OPERATOR`. It remains false in the legacy
pass field and browser compatibility is `UNVERIFIED`. Injected connectors may
remain available with that disclosure. WalletConnect must be hidden when no
valid production Reown project is configured. This disposition is not evidence
that MetaMask, Rabby, Coinbase, Safe, WalletConnect, or EIP-6963 work.

The protected bundle must still exclude built-in wallets, generated keys,
faucets, mock adapters, test credentials, and torture controls.

## 5. Mainnet release and canary

Mainnet needs a second explicit authorization and a dedicated reviewed commit
that deliberately removes the Solidity compile-time broadcast lock.

Copy `docs/operations/mainnet-authorization.template.json` outside the
repository, replace every placeholder, and bind it to the exact release
commit, manifest hash, deployer, canary player, authorization time, and expiry.
The authorization must remain valid for at least two hours. The repository copy
is a schema example only and can never authorize deployment.

1. Re-run canonical registry, chain, sync, pool, bytecode, role-custody, source, and
   balance preflights immediately before broadcast.
   Run `mainnet-canary:budget` to record the live gas price, conservative
   deployment/canary/conversion envelopes, 25% margin, 0.005 ETH reserve, and
   ETH/USDG deficits for both scripted actors. Funding is a separately
   authorized mainnet transaction.
2. Deploy only the frozen internally reviewed commit and write the immutable manifest.
3. Verify runtime bytecode, roles, contract relationships, seed custody, and
   source on the explorer.
4. Configure one encrypted non-admin canary player outside the repository.
   The deployer and player must match the authorization and alternate calls.
5. Install `scripts/mainnet-canary-restart-service.sh` as the root-owned,
   non-writable `/usr/local/libexec/keygame-canary-restart`. Grant the service
   account passwordless sudo for only that helper with arguments `keeper` and
   `indexer`; never grant general `systemctl` or shell access.
6. Install and enable `keygame-mainnet-canary.service` and its timer. Run
   `mainnet-canary:start`; the timer invokes `mainnet-canary:run` every ten
   seconds. Keep discovery unlisted for one hour. The contract remains
   permissionless.
7. Require exactly ten settled rounds at minutes 0, 6, 12, 18, 24, 30, 36,
   42, 48, and 54, at least
   two callers per round, no more than 100 USDG of scripted contributions, all
   reward paths, protocol conversion, lifetime activation, rollover, and one
   keeper restart after round four plus one indexer restart after round seven.
8. Reconcile every Stock Token, point, seed movement, and reward after every
   round. Any discrepancy stops promotion and invokes the incident procedure.
9. At minute 60, require round eleven to be prepared with zero accepted calls
   and an unstarted timer. Run `mainnet-canary:report` and announce publicly only after its checksummed
   report is clean. Browser-wallet compatibility remains unverified.

## Stop conditions

- Wrong chain, lagging RPC, exposed unlocked accounts, dirty or unpushed source.
- Fewer than four safe approved direct markets.
- Canonical registry, factory, pool, token, Safe, or bytecode mismatch.
- Internal assurance, explicit wallet-UAT disposition, protected-build,
  monitoring, or role-custody gate missing.
- Any accounting difference, duplicate lifecycle transition, unsafe execution,
  stuck reward, or unrecovered service fault.

Never repair live accounting by editing the database. Reconstruct from
canonical events and use the published contract cancellation or withdrawal
paths.
