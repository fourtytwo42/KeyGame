# Last Bell v4 privileged roles and incident procedures

Status: pre-audit runbook. Mainnet remains compile-time broadcast-locked.

## Role matrix

| Role | Mainnet authority | Required owner |
|---|---|---|
| Manager admin | Keeper rotation, between-round manager settings, emergency cancellation | Dedicated 2-of-3 Safe |
| Market/catalog admin | Approved Stock Token and direct-pool catalog changes between rounds | Separate 2-of-3 Safe |
| Treasury | Withdraw and convert the settled 5% protocol basket | Separate 2-of-3 Safe |
| Keeper | Prepare, activate, settle, cancel, rebalance seeds, and roll rounds through narrow manager methods | Isolated encrypted operational key |
| Conversion operator | Execute guarded post-settlement protocol conversion | Separate narrowly funded operational key |

All three Safes use the same three independently controlled, hardware-backed or
otherwise isolated owners. The Safe addresses are distinct. Private keys,
recovery phrases, and passwords never belong in the repository.

No privileged action may change a live round's roster, clock, heat target,
points, contribution minimum, or 50/30/10/5/5 payout split. The market adapter
queries the manager before accepting a catalog mutation.

## Before any mainnet release

1. Supply the three common owner addresses and three separately deployed Safe
   addresses.
2. Verify audited Safe runtime code, exactly those owners, threshold two, and
   three distinct addresses.
3. Run `pnpm release:verify-safes` and archive the JSON evidence.
4. Confirm keeper and conversion keys have only their documented permissions.
5. Keep the Solidity mainnet broadcast constant false until a dedicated,
   separately authorized release commit is reviewed.

## Unsafe market

1. Stop preparing new rounds when fewer than four approved direct markets pass
   canonical identity, history, depth, impact, TWAP-deviation, and halt checks.
2. Do not swap through a fallback market that failed a value-safety check.
3. A failure before activation leaves the round unprepared and charges nobody.
4. A live-round swap failure reverts the entire contribution before USDG is
   charged or the bell, timer, points, or rewards change.
5. Record the market, observations, block, exclusion reason, and incident owner.

## Stuck seed rebalance

1. Do not activate the prepared round.
2. Preserve the failed sell or rebuy transaction and current seed balances.
3. Requote through the same approved direct pools and adapter safety rules.
4. Retry through the keeper's idempotent job. Never edit seed accounting in
   PostgreSQL or transfer assets outside the manager's published path.
5. Escalate to the Manager Safe only if cancellation or a role rotation is
   required.

## Compromised keeper

1. Remove keeper authorization through the Manager Admin Safe.
2. Stop the service and preserve logs, nonces, pending hashes, and keystore.
3. Reconcile every persisted hash before authorizing a replacement.
4. Rotate to a new isolated encrypted key with only keeper permissions.
5. Cancel an affected round only through the published contract path.

## Compromised market admin

1. Remove the compromised Safe owner using the other two owners.
2. Stop future preparation until catalog and adapter events are reconciled.
3. Verify no catalog change occurred during an active round.
4. Re-run canonical registry, pool bytecode, and safety preflight before
   resuming.

## Safe signer loss or compromise

- One lost signer: the remaining two owners rotate it across all three Safes
  after identity verification.
- One compromised signer: the other two owners remove it immediately.
- Two unavailable or compromised signers: privileged changes stop. Do not
  deploy a custom recovery multisig or bypass the threshold.

## Treasury conversion

- The protocol basket is claimable only after canonical settlement.
- Two Safe owners review settlement allocation and token balances before
  authorizing withdrawal.
- Conversion uses the same approved direct pools, quote deadline, minimum
  output, exact balance deltas, and TWAP-deviation boundary as player swaps.
- Conversion failure cannot block settlement or any player withdrawal.

## RPC or indexer incident

1. The server may fail over from the LAN RPC to the configured server-only
   provider. Compare chain ID, canonical head, and block hash.
2. Stop keeper writes if providers disagree on canonical state.
3. The indexer deletes deployment-derived rows and rebuilds from deployment
   block after a detected reorganization.
4. Never repair player history, rewards, or leaderboards manually.

## Public incident communication

Assign one incident owner before launch. State the affected deployment, rounds,
assets, user action required, whether contributions are still possible, and
the canonical transactions. Do not claim a frontend restriction prevents
permissionless contract access. Promotion stays paused until exact
reconciliation and the incident owner approve recovery.
