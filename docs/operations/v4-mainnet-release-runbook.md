# Last Bell v4 release runbook

Status: fail-closed. This runbook does not authorize a broadcast.

## 1. Build the internally reviewed candidate

1. Work only from the authoritative KeyGame VM.
2. Confirm the branch is clean and pushed. GitHub is source hosting only.
3. Run `pnpm security:review`, complete the manual checklist, and complete the
   chain-31337 launch rehearsal before running `pnpm release:package:audit`.
4. Review the generated ABI, storage layout, bytecode hashes, mainnet-fork
   evidence, canonical-market preflight, torture baseline, and `SHA256SUMS`.
5. Freeze the exact commit. Contract or accounting changes invalidate the
   candidate until the torture campaign and release gates are rerun.

## 2. Two-round testnet smoke

Complete. The mock-only deployment from commit `2b4fcfa` settled exactly two
rounds with two players per round, exercised every reward class, reconciled all
eight token allocations, and left round three unstarted. The keeper is stopped
and this evidence must remain immutable.
Run `release:verify:testnet:v4-bytecode` against the immutable runtime manifest.
The smoke remains valid only when normalized deployed bytecode matches the
current contract artifacts exactly. This check is read-only and must not submit
another testnet transaction.

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

## 5. One-hour devnet launch rehearsal

1. Start the isolated Anvil service on `127.0.0.1:9546`, create the separate
   `keygame_v4_rehearsal` database, and run `v4-launch-rehearsal:prepare`.
2. Run `pnpm v4-launch-rehearsal:install` to install the rehearsal keeper,
   indexer, runner, timer, isolated Status app, root-owned restart helper, and
   exact two-command sudo allowlist. The runner must reject every chain except
   31337. Build the Status app into `.next-rehearsal` and expose it only on the
   rehearsal port.
3. Run `v4-launch-rehearsal:start`. The timer invokes the controller every ten
   seconds for one real hour without advancing chain time.
4. Require ten rounds at minutes 0 through 54, two non-admin callers per round,
   82 mock USDG spent, keeper restart after round four, indexer restart after
   round seven, all reward paths, seed movement, conversion, and exact
   reconciliation.
5. At minute 60, require round eleven prepared with zero calls and an unstarted
   timer. Generate and checksum the rehearsal report.

## 6. Mainnet deployment and read-only validation

Mainnet needs a second explicit authorization and a dedicated reviewed commit
that deliberately removes the Solidity compile-time broadcast lock.

Copy `docs/operations/mainnet-authorization.template.json` outside the
repository, replace every placeholder, and bind it to the exact release
commit, manifest hash, deployer, read-only validation policy, authorization
time, and expiry. The authorization must remain valid for at least one hour.
Legacy canary-scoped authorizations are invalid.

1. Re-run canonical registry, chain, sync, pool, bytecode, role-custody, source, and
   balance preflights immediately before broadcast.
   Run `release:budget:mainnet` to record deployment gas, a 25% margin, the
   keeper reserve, and the deployer ETH deficit. No player wallet or pre-launch
   USDG is required.
2. Deploy only the frozen internally reviewed commit and write the immutable manifest.
3. Verify runtime bytecode, roles, contract relationships, seed custody, and
   source on the explorer.
4. Run `release:verify:mainnet:read-only`. It verifies bytecode, roles,
   relationships, the unstarted zero-call round, safe markets, RPC agreement,
   indexer catch-up, API consistency, and zero unexpected custody.
5. The verifier must report `transactionsSubmitted: 0`. Do not approve, call,
   swap, settle, claim, rebalance, or convert before promotion.
6. Keep the application unlisted. Copy the promotion authorization template
   outside the repository and bind approval to the immutable deployment
   manifest and checksummed read-only report.
7. Run `release:verify:mainnet:promotion` before listing the application.
   Browser-wallet compatibility and mainnet gameplay remain explicitly
   unverified; the first public users execute the first value-bearing paths.

## Stop conditions

- Wrong chain, lagging RPC, exposed unlocked accounts, dirty or unpushed source.
- Fewer than four safe approved direct markets.
- Canonical registry, factory, pool, token, Safe, or bytecode mismatch.
- Internal assurance, devnet rehearsal, testnet bytecode match, explicit
  wallet-UAT disposition, protected build, monitoring, or role-custody gate
  missing.
- Any attempt to use a legacy canary authorization or to transact during the
  read-only mainnet validation stage.
- Any accounting difference, duplicate lifecycle transition, unsafe execution,
  stuck reward, or unrecovered service fault.

Never repair live accounting by editing the database. Reconstruct from
canonical events and use the published contract cancellation or withdrawal
paths.
