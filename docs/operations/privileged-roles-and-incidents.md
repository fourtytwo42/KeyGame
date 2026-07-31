# Last Bell v4 privileged roles and incident procedures

Status: internal-assurance runbook. Mainnet remains compile-time broadcast-locked.

## Initial role custody

The encrypted deployer EOA initially holds manager admin, market/catalog admin,
keeper, treasury, protocol conversion, and testnet faucet authority. The private
key, password, and recovery material remain outside the repository and
application runtime.

This single-key design is an accepted concentration risk. Each authority can be
migrated later: manager admin, market admin, and treasury use two-step
proposal/acceptance; keeper uses explicit rotation. A future EOA, Safe, or other
authority contract may accept each role independently.

No privileged action may change a live round's roster, clock, heat target,
points, contribution minimum, or 50/30/10/5/5 payout split. Treasury changes
apply only to rounds prepared after acceptance. Active and already-prepared
rounds retain their original immutable treasury.

## Before any mainnet release

1. Derive the deployer address from its encrypted keystore.
2. Verify every initial privileged address resolves to that deployer and all
   pending transfers are empty with `pnpm release:verify-role-custody`.
3. Exercise every two-step role handoff on a fork and cancel it or return it to
   the deployer before packaging.
4. Keep the Solidity mainnet broadcast constant false until a dedicated,
   separately authorized release commit is reviewed.

## Unsafe market or stuck rebalance

- Stop preparing new rounds when fewer than four approved direct markets pass
  identity, history, depth, impact, TWAP-deviation, and halt checks.
- A failed contribution reverts before charging USDG or changing the game.
- A failed seed rebalance leaves assets recoverable and the next round
  unstarted. Reconcile and retry through the idempotent manager path; never edit
  database accounting manually.

## Compromised deployer or role

1. Stop new round preparation and public promotion.
2. Preserve logs, nonces, pending transaction hashes, and canonical balances.
3. If the deployer can still act, propose each affected role to a new isolated
   authority and require the new authority to accept it onchain.
4. Rotate keeper separately and fund it only as needed.
5. Reconcile every round and role event before resuming.

Loss of the sole deployer key can make administrative recovery impossible.
There is no hidden recovery key or custom bypass.

## Treasury conversion

- The protocol basket is claimable only after canonical settlement.
- Conversion uses approved direct pools, a quote deadline, minimum output,
  exact balance deltas, and the TWAP-deviation boundary.
- Conversion failure cannot block settlement or player withdrawals.

## RPC, indexer, and public incidents

- Fail over only after checking chain ID, synchronization, canonical head, and
  block hash. Stop writes if providers disagree.
- Rebuild derived state from canonical events after a reorganization. Never
  repair rewards or leaderboards manually.
- State the affected deployment and rounds, canonical transactions, user action
  required, and whether contributions remain possible. Promotion stays paused
  until exact reconciliation succeeds.
