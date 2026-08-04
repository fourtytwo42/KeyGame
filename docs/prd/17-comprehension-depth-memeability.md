# PRD 17: Comprehension, Depth, and Memeability

Status: `AUTHORITATIVE V5 PRESENTATION`

Contract version: `saved-bell-v5-market-pot`

## Objective

Make the v5 Stock Pot understandable in five seconds, expose the consequence of
every contribution before submission, and build durable identity and history
from canonical events. This presentation layer does not change contracts,
economics, timers, contribution limits, approval behavior, or RPC policy.

## Live hierarchy and contribution flow

- The dominant live values are the five-minute clock, Stock Pot value, current
  holder, and estimated 50% Last Bell value.
- The primary rule is: `Pick a stock. Choose any amount. Take the bell. Hold it
  at zero to win 50%.`
- Supporting rules live in a collapsed `HOW IT WORKS` drawer.
- One shared composer owns ticker, amount, presets, quote, impact, Stock Token
  output, approval state, and submission. The mobile dock reuses that exact
  state rather than maintaining a second form.
- `MATCH LEADER`, `TAKE THE LEAD`, and `FLIP THE STOCK` calculate amounts from
  the current point deficit and locked multiplier. They never impose a maximum.
- Ticker cards show rank, total and player points, 30-second heat, multiplier,
  pot quantity, points needed to lead, and canonical ticker captain.
- Existing multiplier ranges are named `COLD`, `WARMING`, `COOKING`, and
  `NUCLEAR`.
- Transaction feedback is explicit: `READY`, `WAITING FOR WALLET`, `APPROVAL
  PENDING`, `CONTRIBUTION PENDING`, `ACCEPTED ONCHAIN`, or `REJECTED - NOTHING
  CHARGED`. Approval and contribution hashes remain separate.
- Waiting, live, final-minute, Rug Zone, settling, cancelled, and settled states
  use distinct treatments. Rug Zone continues to disclose FCFS competition and
  automated-wallet speed.
- Current v5 views contain no GREEN, RED, or DEX-price scoring language. Those
  labels remain only in versioned legacy replay adapters.

## Canonical identity and broadcast moments

- A ticker captain is the highest-points contributor for the ticker. Ties use
  the most recent accepted call and then lowercase address.
- Canonical, nonfinancial achievements are `FINAL CALLER`, `BELL SNIPER`, `RUG
  SURVIVOR`, `BIGGEST APE`, `STOCK CAPTAIN`, `FLIP ARTIST`, and `HEAT STARTER`.
- Highlights cover accepted calls, whales, ticker flips, heat changes, pot
  milestones, Rug Zone steals, settlement, and reward claims. They are rebuilt
  from canonical deployment-keyed logs after a reorg.
- Pot milestones are $1K, $10K, $25K, $50K, and $100K, once per round.
- Mascot states are normal host, ticker-flip shout, Rug Zone alarm, and
  settlement celebration.
- Broadcast stingers are muted by default, opt-in, local-only, and disabled for
  reduced-motion users. They never simulate activity.
- Receipts and share cards include the pot, final caller, winning stock, largest
  call, flip count, last-call timing, achievements, and canonical proof.

## Retention and trust

- Historical cards use factual story summaries with pot, winning stock, call
  count, last-call timing, largest call, flips, and achievements.
- Leaderboards support round, UTC calendar-month season, and lifetime scopes
  across points, settled volume, largest call, captain wins, flips, Final Bells,
  and claimed reward value. Status never changes game economics.
- Earnings separate claimable, claimed, and total-earned Stock Token baskets;
  expose reward categories, lifetime numerator and denominator math, canonical
  transactions, and one batch-claim plan.
- `VERIFY ONCHAIN` exposes chain, deployment, round contract, transactions,
  token quantities, payout numerator and denominator, and contract version.
- Degraded LAN RPC state disables value actions. Alchemy is never promoted to
  the active provider automatically.

## Data and indexing

- `RoundState` may include ticker captains, named heat levels, milestones,
  current verified headline, phase presentation, contribution impact,
  achievements, and highlights.
- Quote responses include current/projected rank, points to lead/flip, heat
  level, output bounds, and approval requirement.
- `player_achievements` and `round_highlights` include deployment key, round,
  canonical block/log provenance, transaction, and contract version.
- Reorg rollback deletes affected derived rows and deterministic replay rebuilds
  them from canonical contributions and settlements.
- Simulator controls and fabricated fixtures are simulator-only and absent from
  testnet and protected builds.

## Acceptance

- The primary rule is understood within five seconds and contribution impact is
  visible before submission.
- Desktop 1280x720 and mobile 390x844 have no horizontal overflow, clipped
  financial values, duplicate composer state, or interactive financial text
  below 11px.
- Audio never plays before opt-in; milestone stingers fire once; reduced motion
  removes nonessential animation and sound.
- Unit, migration, indexing, browser, accessibility, protected-build, secret,
  and existing contract regression gates pass locally on the VM.
- Devnet UAT covers variable contributions, flips, milestones, Rug Zone,
  settlement, achievements, rewards, history, and share cards.
- The existing testnet application receives only UI/service changes and submits
  no new gameplay transaction.
