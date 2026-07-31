# Last Bell v4 mainnet-readiness ledger

Status: implementation candidate. No Robinhood testnet or mainnet v4 deployment
is authorized or claimed.

## Gate ledger

| Gate | State | Evidence or next authority |
|---|---|---|
| Accepted Anvil baseline | Passed | `v4-torture-baseline.json` and checksummed torture archive |
| Direct production adapter | Implemented | `RobinhoodStockSwapAdapter.sol` |
| Dynamic safe roster | Implemented | market collector, v4 screener, keeper, catalog evidence |
| Mainnet-fork adapter tests | Passed locally | Five pinned pools; currently unsafe markets remain excluded at activation |
| Full release regression | Pending final clean run | Audit-package command |
| Two-round Robinhood testnet smoke | Blocked | Separate written user authorization |
| Independent audit | Blocked | External auditor and frozen candidate required |
| Legal/eligibility matrix | Blocked | Counsel approval required |
| Three 2-of-3 Safes | Blocked | Three owners and verified Safe deployments required |
| External-wallet UAT | Deferred | Runs after audit remediation and before mainnet |
| Mainnet broadcast | Compile-time locked | Separate reviewed release commit and user authorization |
| Unlisted mainnet canary | Blocked | All preceding gates plus explicit broadcast authorization |

## Implemented release controls

- Mainnet chain and broadcast restrictions exist in both the Solidity script and
  shell wrapper. An environment variable alone cannot remove the compile-time
  lock.
- Testnet deployment requires an authorization file outside the repository,
  matching the exact pushed commit, plus an explicit two-round-smoke grant.
- Mainnet preflight verifies chain synchronization, canonical contracts, direct
  pools, bytecode, token decimals, safety observations, and at least four safe
  catalog markets.
- Production catalog changes are Safe-controlled and rejected while a round is
  live.
- The production keeper delays preparation when fewer than four markets pass
  every execution gate. It never substitutes an unsafe value-bearing market.
- The indexer rebuilds deployment-derived state after a reorganization and
  materializes contributions, settlement baskets, lifetime epochs, and claims
  from canonical logs.
- Protected builds reject mock adapters, generated wallets, faucets, torture
  controls, and test attestors.

## Candidate-change rule

Any contract or accounting change after the accepted baseline requires the
complete one-million-action torture campaign again. Service-only changes
require the affected live-devnet, restart, reorg, and reconciliation campaigns.
Any audit remediation creates a new candidate.
