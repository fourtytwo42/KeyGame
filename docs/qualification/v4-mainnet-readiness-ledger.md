# Last Bell v4 mainnet-readiness ledger

Status: implementation candidate. No Robinhood testnet or mainnet v4 deployment
is authorized or claimed.

## Gate ledger

| Gate | State | Evidence or next authority |
|---|---|---|
| Accepted Anvil baseline | Passed | Commit-bound run `v4-torture-live-2026-07-31T07-10-55-856Z`: 1,000,000 state actions, 10,000 contributions, 500 settlements, 50 cancellations, exact reconciliation, and 11 restored faults |
| Direct production adapter | Implemented | `RobinhoodStockSwapAdapter.sol` |
| Dynamic safe roster | Implemented | market collector, v4 screener, keeper, catalog evidence |
| Mainnet-fork adapter tests | Passed locally | Five pinned pools; currently unsafe markets remain excluded at activation |
| Full release regression | Passed locally | 54 Foundry tests, 57 Vitest tests, four isolated integration tests, 20 applicable Playwright tests, mainnet protected build, live mainnet fork, and live mainnet preflight |
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
- Devnet transaction code is selected through a build-time alias and is absent
  from protected mainnet JavaScript bundles.
- PostgreSQL pool disconnects are non-fatal. The qualification controller
  resumes idempotently after transient shutdowns, and systemd-equivalent
  torture supervision relaunches exited services before accepting recovery.

## Current live market evidence

The 2026-07-31 mainnet preflight found AAPL, TSLA, SPY, and NVDA safe under the
prototype 10-minute TWAP, depth, history, and 1% execution checks. AMZN remained
in the approved catalog but was excluded from roster selection because its
simulated $1,000 buy exceeded the 1% impact limit. Market safety is revalidated
immediately before every production round; this result is evidence, not a
permanent approval.

## Candidate-change rule

Any contract or accounting change after the accepted baseline requires the
complete one-million-action torture campaign again. Service-only changes
require the affected live-devnet, restart, reorg, and reconciliation campaigns.
Any audit remediation creates a new candidate.
