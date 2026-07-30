# Last Bell privileged roles and incident procedures

Status: audit-candidate runbook. Mainnet remains broadcast-locked.

## Role matrix

| Role | Mainnet authority | Required owner |
|---|---|---|
| Manager admin | Manager configuration between rounds, keeper rotation, emergency cancellation | Dedicated 2-of-3 Safe |
| Verifier admin | Verifier and attestor rotation between rounds | Separate 2-of-3 Safe |
| Treasury | Withdraw the settled 5% protocol allocation | Separate 2-of-3 Safe |
| Keeper | Prepare, activate, settle, cancel, and roll rounds through narrow manager methods | Isolated encrypted operational key |
| Attestor | Sign domain-bound testnet DEX observations only | Isolated encrypted testnet operational key |

All three Safes must use the same three independently controlled, hardware-backed
or otherwise isolated owner wallets. The three Safe addresses must be different.
No private key, recovery phrase, or password belongs in the repository.

No privileged action may change a live round's roster, clock, scoring constants,
fee, or payout split.

## Before any mainnet release

1. Supply the three owner addresses and the three separately deployed Safe
   addresses.
2. Confirm each Safe is an audited deployment on Robinhood Chain, has exactly
   the common three owners, and has threshold two.
3. Run `pnpm exec tsx scripts/verify-mainnet-safes.ts` against the locked
   mainnet manifest with release-reviewed runtime bytecode hashes.
4. Archive the JSON evidence with the audit candidate.
5. Keep the compile-time mainnet broadcast lock in place until a separate,
   explicit release change is reviewed.

## Emergency cancellation

- The keeper may invoke only the published cancellation path while a round is
  active and the documented market-data outage condition is true.
- Cancellation never reallocates accepted fees. Each payer withdraws their own
  accepted fees through the refund path.
- Record the reason, transaction, canonical block, affected round, report age,
  and operator in the incident log.

## Compromised keeper

1. Remove keeper authorization through the Manager Admin Safe.
2. Stop the keeper service and preserve its logs, nonce state, and keystore.
3. Reconcile every pending transaction hash before authorizing a replacement.
4. Rotate to a new isolated encrypted key with only keeper permissions.
5. Cancel an affected active round only through the published cancellation path.

## Compromised attestor

1. Stop the DEX adapter. Claims with missing or invalid reports fail before the
   $1 transfer.
2. Rotate the attestor through the Verifier Admin Safe.
3. Preserve signed observations and source-block evidence for incident review.
4. Cancel any active testnet-style attested round if trustworthy reports remain
   unavailable for the published outage window.

## Safe signer loss or compromise

- One lost signer: the remaining two owners rotate the lost owner in each of
  the three Safes after identity verification.
- One compromised signer: the other two owners remove it immediately and add a
  clean replacement.
- Two unavailable or compromised signers: privileged changes stop. Do not
  deploy a custom recovery multisig or bypass the threshold.

## Treasury withdrawal

- Treasury withdrawals occur only after canonical settlement.
- Two Safe owners review the round event totals, Airtime Pool conservation,
  next-round seed transfer, and requested 5% amount before signing.
- The treasury cannot pull the holder or Airtime pools.

## Pause and recovery

There is no privileged live-round rewrite. Operational services may stop
submitting transactions, and the published cancellation path may refund fees.
Recovery requires canonical event reconciliation, service-health recovery, and
an incident owner before normal automation resumes.
