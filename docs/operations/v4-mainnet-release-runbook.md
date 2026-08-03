# Last Bell v4 release runbook

Status: fail-closed. This runbook does not authorize a broadcast.

## RPC operating rule

Use the Robinhood LAN RPC as the sole active provider. The Alchemy endpoint is
health-reference-only and may be checked for block height or canonical
agreement. Do not route reads, writes, keeper/indexer work, DEX observations,
or broadcasts through Alchemy automatically. If LAN is offline or more than
five blocks behind, mark the application connection degraded and pause
frontend actions/browser broadcast. Switching providers requires a separate explicit operator
instruction.

## 1. Build the internally reviewed candidate

1. Work only from the authoritative KeyGame VM.
2. Confirm the branch is clean and pushed. GitHub is source hosting only.
3. Run `pnpm contracts:check-sizes`. Require the release profile, a passing
   report for every deployable contract, and `RoundManagerV4` at or below
   23,000 bytes. Archive the JSON, Markdown, and checksums.
4. Run `pnpm security:review`, complete the manual checklist and chain-31337
   launch rehearsal, then obtain the current-bytecode testnet smoke evidence
   before running `pnpm release:package:audit`.
5. Review the generated ABI, storage layout, bytecode hashes, compiler and
   contract-size provenance, mainnet-fork
   evidence, canonical-market preflight, torture baseline, and `SHA256SUMS`.
6. Freeze the exact commit. Contract or accounting changes invalidate the
   candidate until the torture campaign and release gates are rerun.

## 2. Two-round testnet smoke

Completed 2026-08-01 from commit
`5955b3b8f47c6294bd7549215d0099741474ab23`. The mock-only deployment at block
`95922891` settled exactly two rounds with two players and four calls per round,
exercised every reward class, reconciled all eight token allocations, and left
round six prepared with zero calls and an unstarted timer. All eleven contracts
are explorer verified and direct LAN reads match the current runtime bytecode.
The one-shot authorization is consumed and cannot be reused. No further
testnet transaction is required while contract bytecode remains unchanged.

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

Completed 2026-08-01: deployment key
`31337:0x610178da211fef7d417bc0e6fed39f05609ad788:8` passed all five
requirements. The checksummed report SHA-256 is
`0da42b0f63bcedeb38e93eea2da2ca64c9753a8c9607743fcc4770606ce12ef2`.
The preparation command now refuses a database containing any previous
chain-31337 deployment or rehearsal run.

## 6. Mainnet deployment and read-only validation

The dedicated release commit opens only the Solidity compile-time path. It
cannot deploy without the nonce-bound plan, matching one-shot authorization,
external encrypted keystore, runtime broadcast flag, and every live preflight.

Before authorization, run `release:plan:mainnet`. It forks the LAN mainnet node
at a pinned block, preserves the deployer's current nonce, simulates the full
deployment without a key, and writes expected addresses, runtime hashes,
runtime sizes, compiler-profile hash, contract-size report hash, transaction
count, gas used, constructor configuration, and initial roster to an immutable
external planned manifest.

Copy `docs/operations/mainnet-authorization.template.json` outside the
repository, replace every placeholder, and bind it to the exact release
commit, planned-manifest hash, deployer, one deployment run, read-only
validation policy, unused state, authorization time, and expiry. The
authorization must remain valid for at least one hour.
Legacy canary-scoped authorizations are invalid.

1. Re-run canonical registry, chain, sync, pool, bytecode, role-custody, source, and
   balance preflights immediately before broadcast.
   Run `release:budget:mainnet` to record deployment gas, a 25% margin, the
   keeper reserve, and the deployer ETH deficit. No player wallet or pre-launch
   USDG is required.
2. Deploy only the frozen internally reviewed commit. The wrapper consumes the
   authorization before broadcasting, writes the immutable deployment
   manifest, and requires every address and runtime hash to match the plan.
3. Verify runtime bytecode, roles, contract relationships, seed custody, and
   source on the explorer.
4. Run `release:verify:mainnet:read-only`. It verifies bytecode, roles,
   relationships, the unstarted zero-call round, safe markets, LAN/reference
   agreement, the live `LAN_ONLY` and no-automatic-failover policy, indexer
   catch-up, API consistency, and zero unexpected custody.
5. The verifier must report `transactionsSubmitted: 0`. Do not approve, call,
   swap, settle, claim, rebalance, or convert before promotion.
6. Keep the application unlisted. Copy the promotion authorization template
   outside the repository and bind approval to the immutable deployment
   manifest and checksummed read-only report.
7. Run `release:verify:mainnet:promotion` before listing the application.
   The mainnet keeper additionally refuses to load its signing wallet until
   that promotion authorization and zero-transaction read-only report match.
   Browser-wallet compatibility and mainnet gameplay remain explicitly
   unverified; the first public users execute the first value-bearing paths.

## Stop conditions

- Wrong chain, lagging RPC, exposed unlocked accounts, dirty or unpushed source.
- Fewer than four safe approved direct markets.
- Canonical registry, factory, pool, token, role-custody, or bytecode mismatch.
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
