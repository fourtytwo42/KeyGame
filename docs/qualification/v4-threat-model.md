# Last Bell v4 threat model

Status: internal working threat model. **INTERNALLY REVIEWED · NO INDEPENDENT AUDIT.**

## Assets and invariants

- Player USDG may leave a wallet only when a complete contribution succeeds.
- Accounted Stock Token units must resolve exactly to Last Bell, Winning Stock,
  Lifetime, seed, protocol, refund, or still-claimable custody.
- Rejected swaps cannot change holder, timer, points, heat, or reward state.
- Lifetime points activate only after settlement, never on cancellation, never
  burn on claim, and never exceed accepted contribution points.
- A live round's roster, clock, heat target, scoring, and payout split are
  immutable.
- Database and API state are projections. Canonical contracts and logs remain
  authoritative.

## Trust boundaries

| Boundary | Trusted for | Not trusted for |
|---|---|---|
| Player wallet | Chosen ticker, amount, minimum output, deadline | Honest timing, UI use, or human control |
| Swap adapter | Approved direct-pool execution and exact deltas | Arbitrary tokens, routers, callbacks, or offchain price claims |
| Uniswap pool | Canonical direct execution and cumulative observations | Economic fairness when liquidity/safety gates fail |
| Robinhood metadata | Canonical identity, status, halt, corporate actions | Game scoring |
| Keeper | Narrow lifecycle calls and retry orchestration | Editing balances, rewards, or live-round economics |
| Indexer/database | Confirmed history, projections, leaderboards | Contract custody or payout authority |
| Single deployer EOA | Initial administration, keeper, conversion, and treasury | Live-round rewriting |
| Web client | Quote presentation and transaction construction | Eligibility enforcement on a permissionless contract |

## Primary threats and controls

- **Malicious or nonstandard token:** catalog allowlist, runtime bytecode review,
  exact input/output and recipient/pool balance deltas, fee-on-transfer and
  rebasing rejection, callback tests.
- **Pool substitution or multihop:** pinned factory, exact pool/token/fee
  identity, direct routes only, immutable market IDs.
- **Sandwich or price manipulation:** quote deadline, exact token accounting,
  and an optional caller-selected minimum output remain available. The default
  application path intentionally accepts any positive output and has no
  protocol-level price-impact or TWAP-deviation ceiling. Adverse execution and
  MEV extraction are accepted residual risks.
- **Reentrancy or callback spoofing:** adapter lock, exact expected pool callback
  sender, hostile callback and token tests, checks before state acceptance.
- **Dishonest adapter output:** round counts only exact authorized-adapter token
  balance deltas; transaction atomicity rolls back USDG and game state.
- **Roster race:** manager-backed configuration guard blocks catalog changes
  during active rounds; keeper serializes preparation with advisory locks and
  idempotency keys.
- **Keeper duplication or nonce loss:** transaction hash persisted before wait,
  pending nonce/receipt reconciliation, unique jobs, manager lifecycle guards.
- **Reorganization:** three-confirmation public history, canonical block hashes,
  deployment-scoped derived-state rebuild.
- **Reward rounding or claim-order extraction:** deterministic splits,
  final-eligible-claimant remainder, per-token conservation and fuzz coverage.
- **Seed/protocol conversion failure:** conversion occurs outside settlement;
  failures preserve recoverable assets and cannot block player withdrawals.
- **Compromised deployer:** encrypted external keystore, exact role verification,
  between-round change boundaries, two-step future role transfers, and complete
  event trails. Initial single-key concentration remains an accepted residual risk.
- **Frontend or RPC compromise:** wallet displays transaction, server-only
  fallback secrets, chain/source/bytecode preflight, no unlocked RPC accounts.
- **Automated Rug Zone competition:** intentionally FCFS and disclosed;
  monitoring does not throttle, cap, or change payouts.
- **Eligibility bypass:** documentation never claims frontend controls make a
  permissionless contract inaccessible. No legal review has been performed.

## Residual risks requiring explicit acceptance

- Canonical Stock Token and USDG contracts, Robinhood Chain, and approved pools
  remain external dependencies.
- An uncapped permissionless game can create large pots and strong MEV/bot
  incentives.
- Public AMM inventory may be depleted or repriced sharply. Contributions can
  receive very few Stock Tokens, and arbitrage replenishment is assumed rather
  than guaranteed.
- Lifetime rewards and game mechanics may receive different legal treatment by
  jurisdiction.
- Loss or compromise of the initial sole deployer key may be unrecoverable and
  can affect every privileged role until roles are migrated.

Internal findings, canonical contract changes, pool changes, or changed risk
assumptions must update this document and create a new frozen candidate.
