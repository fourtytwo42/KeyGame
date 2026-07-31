# Last Bell v4 release runbook

Status: fail-closed. This runbook does not authorize a broadcast.

## 1. Build the audit candidate

1. Work only from the authoritative KeyGame VM.
2. Confirm the branch is clean and pushed. GitHub is source hosting only.
3. Run `pnpm release:package:audit`.
4. Review the generated ABI, storage layout, bytecode hashes, mainnet-fork
   evidence, canonical-market preflight, torture baseline, and `SHA256SUMS`.
5. Freeze the exact commit. Contract or accounting changes invalidate the
   candidate until the torture campaign and release gates are rerun.

## 2. Two-round testnet smoke

This step requires a new, explicit user authorization. It uses mock assets and
must display `TESTNET MOCK · NO VALUE`.

1. Create an authorization file outside the repository with the exact pushed
   `sourceCommit` and `twoRoundSmokeAuthorized=true`.
2. Run `pnpm release:preflight:testnet:v4`. This simulates deployment without
   broadcasting and checks the configured gas reserve.
3. Only after reviewing the estimate, run
   `TESTNET_RELEASE_AUTHORIZATION_FILE=... pnpm contracts:deploy:testnet:v4`.
4. Use two built-in session wallets. Complete exactly two representative
   rounds, including allowance reuse, rollover, and round-one lifetime-point
   eligibility in round two.
5. Withdraw Last Bell, Winning Stock, Lifetime, and batch rewards. Restart the
   keeper once after transaction-hash persistence and confirm recovery.
6. Run `pnpm release:reconcile:testnet:v4`. Archive its report, deployment
   manifest, transaction hashes, API snapshots, and explorer links.
7. Stop. Do not turn this into a soak or continue spending testnet gas.

## 3. Audit, legal, and role setup

- Commission an independent review of the v4 contracts, direct swap adapter,
  manager/keeper lifecycle, quotes, indexing, deployment controls, and reward
  reconstruction.
- Counsel must provide an approved jurisdiction and eligibility matrix covering
  age, identity, sanctions, Stock Token eligibility, gaming treatment,
  lifetime rewards, taxes, disclosures, and privacy.
- Deploy three separate audited 2-of-3 Safes using the same three independently
  controlled owners. Assign manager admin, market/catalog admin, and treasury.
- Run `pnpm release:verify-safes` with reviewed Safe runtime code hashes.
- Configure isolated keeper and conversion keys with only their narrow roles.

## 4. Deferred external-wallet UAT

After audit remediation and substantial legal approval, configure the
production Reown project and exact origins. Test MetaMask, Rabby, Coinbase,
Safe, WalletConnect QR, and EIP-6963 discovery. Cover chain switching,
rejection, gas failure, edited and reused approvals, quote expiry, failed
swaps, uncapped custom contributions, settlement, every reward, batch claims,
and replacement transactions at 1280x720 and 390x844.

The protected bundle scan must prove that built-in wallets, generated keys,
faucets, mock adapters, test credentials, and torture controls are absent.

## 5. Mainnet release and canary

Mainnet needs a second explicit authorization and a dedicated reviewed commit
that deliberately removes the Solidity compile-time broadcast lock.

1. Re-run canonical registry, chain, sync, pool, bytecode, Safe, source, and
   balance preflights immediately before broadcast.
2. Deploy only the frozen audited commit and write the immutable manifest.
3. Verify runtime bytecode, roles, contract relationships, seed custody, and
   source on the explorer.
4. Keep discovery unlisted for 24 hours. The contract remains permissionless.
5. Require at least ten settled rounds, all reward paths, protocol conversion,
   lifetime activation, rollover, and one controlled service restart.
6. Reconcile every Stock Token, point, seed movement, and reward after every
   round. Any discrepancy stops promotion and invokes the incident procedure.
7. Announce publicly only after the signed canary report is clean.

## Stop conditions

- Wrong chain, lagging RPC, exposed unlocked accounts, dirty or unpushed source.
- Fewer than four safe approved direct markets.
- Canonical registry, factory, pool, token, Safe, or bytecode mismatch.
- Audit, legal, wallet, protected-build, monitoring, or ownership gate missing.
- Any accounting difference, duplicate lifecycle transition, unsafe execution,
  stuck reward, or unrecovered service fault.

Never repair live accounting by editing the database. Reconstruct from
canonical events and use the published contract cancellation or withdrawal
paths.
