# PRD 08: Comprehensive User Stories

Status: Stage 0 and Milestone 1 backlog approved for implementation. Stories
still inherit the decision status of their source requirements and do not
approve an open or gated production behavior.

## Purpose

This document translates the Last Bell product, game, experience, technical,
risk, and measurement requirements into testable stories. It covers the full
journey from an anonymous spectator opening a shared receipt through entry,
live play, settlement, claims, replay, support, and operations.

## Story conventions

### Priority

| Priority | Meaning |
|---|---|
| `P0` | Required for the story's stated launch stage or milestone exit. |
| `P1` | Important for a complete and trustworthy experience; may follow the first vertical slice. |
| `P2` | Valuable optimization or extension that must not block a safer baseline. |

### Applicability

| Label | Meaning |
|---|---|
| `Stage 0+` | Local simulator and every later stage. |
| `Stage 1+` | Robinhood Chain testnet points and every later stage. |
| `Stage 2+ GATED` | Sponsor-funded USDG only after all Stage 2 gates pass. |
| `Stage 3 GATED` | Canonical Stock Token custody only after all Stage 3 gates pass. |
| `Decision` | Supports validation of an unresolved product decision; it is not approval of the outcome. |

### Shared acceptance rules

Unless a story explicitly says otherwise:

- Canonical chain events determine accepted gameplay state at Stage 1 and later.
- The UI may show an action as submitted, but never shows an unobserved holder
  or winner as accepted.
- A rejected action never charges the game fee. Network gas, when applicable,
  is described separately.
- Meme language is paired with a literal result.
- The flow remains keyboard-operable and understandable without sound.
- Stage 0 uses deterministic synthetic state with the same user-visible
  transitions expected from later canonical events.

## Approved initial implementation selection

The first build implements:

1. Every `P0` `Stage 0+` story.
2. Static, fixture-driven representations of the Stage 1 wallet/session,
   submitted, accepted, rejected, Weak Signal, cancellation, and proof states
   required to complete `UX-001` through `UX-012`.
3. The `P1` replay, receipt sharing, Trenches, desktop-rail, and visual
   trust-support stories needed for the complete Channel 4663 shell.
4. No live wallet, contract, indexer, USDG, prize, Stock Token custody, or
   eligibility integration.

Stage 1 states in the first build are demonstrations backed by typed fixtures.
They must not imply that a transaction, wallet permission, or value transfer
actually occurred.

## Epic and role coverage

| Epic | Primary roles | Outcome |
|---|---|---|
| Discovery and spectating | Visitor, spectator, raider | Understand and watch without a wallet. |
| Entry and faction selection | First-time player, returning player | Join one faction with understood terms. |
| Wallet and bounded session | Player | Authorize a known maximum without unlimited approval. |
| Live bell play | Player, spectator | See canonical state and make the `$1` action safely. |
| Rug Zone and finalization | Player, spectator | Understand the non-extendable ending and pending settlement. |
| Settlement, rewards, and principal | Winner, faction member, Stock Token holder | Verify and withdraw independently. |
| Replay, receipts, and sharing | Player, spectator, raider | Reconstruct and share deterministic outcomes. |
| Rules, assets, and transparency | Any visitor, auditor | Verify rules, addresses, and asset status. |
| Failure, cancellation, and recovery | Player, support user | Know what failed, what was charged, and how to recover. |
| Accessibility, responsive use, and performance | Mobile, desktop, keyboard, screen-reader, reduced-motion users | Complete the core journey across supported conditions. |
| Operator, support, and audit | Operator, support responder, auditor | Run and investigate without rewriting outcomes. |
| Eligibility, compliance, and privacy | Restricted visitor, eligible player, compliance reviewer | Enforce gated access and truthful disclosures. |
| Analytics and product learning | Product owner, researcher | Measure comprehension and reliability without blocking play. |

## Epic 1: Discovery and spectating

### `US-DISC-001`: Understand the game from the home screen

- **Story:** As a first-time visitor, I want to understand the action, price,
  and win condition before connecting a wallet so that I can decide whether to
  keep watching.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Given the home screen, when it finishes its initial render, then `PICK A
    BAG`, `PAY $1 TO STEAL THE BELL`, and `HOLD IT AT ZERO TO WIN 50%` are
    visible without opening another panel.
  - The screen exposes the current or next round and does not present a wallet
    connection as the primary action.
- **Trace:** `PRD-001`, `PRD-008`, `UX-001`.

### `US-DISC-002`: Spectate a live round without a wallet

- **Story:** As a spectator, I want to open a live round directly so that I can
  follow the countdown and holder without authorizing anything.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Given a live round URL, when an unconnected visitor opens it, then the pot,
    countdown, current holder, ticker faction, and win condition are visible.
  - Wallet-provider unavailability does not prevent spectating historical or
    live public state.
- **Trace:** `PRD-008`, `UX-003`, `TECH-PERF-006`.

### `US-DISC-003`: Arrive from a shared receipt

- **Story:** As a raider following a shared result, I want to see the settled
  outcome first and the next playable round second so that the link makes sense
  before asking me to join.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Given a canonical receipt URL, when it is opened, then the referenced round,
    player result, and replay identity render without a wallet.
  - The invitation to spectate or enter another round is secondary to the
    receipt's settled result.
- **Trace:** `PRD-007`, `PRD-008`, `UX-008`, `TECH-051`, `TECH-052`.

### `US-DISC-004`: See whether a round is live or upcoming

- **Story:** As a visitor, I want clear broadcast status so that I do not
  confuse entry, live play, finalization, and a settled result.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - The interface labels scheduled or entry-open state as `OFF AIR`, active
    state as `LIVE`, final ten-second state as `RUG ZONE`, pending settlement as
    `FINALIZING`, and settled state as `FINAL`.
  - A direct URL to any known round resolves to that round's current phase
    rather than silently redirecting to the newest round.
- **Trace:** `UX-001`, `UX-002`, `UX-003`, `UX-004`, `UX-005`, `UX-006`.

### `US-DISC-005`: Open human-readable rules from any public state

- **Story:** As a cautious spectator, I want the exact rules available without
  connecting so that I can verify the headline explanation.
- **Priority / applicability:** `P1`, `Stage 0+`.
- **Acceptance criteria:**
  - Rules are reachable from home, live, replay, receipt, and supported-assets
    surfaces.
  - The rules page distinguishes the primary final-holder prize from the
    secondary faction airtime pool and displays current configured constants.
- **Trace:** `UX-009`, `UX-025`, `QA-011`.

## Epic 2: Entry and faction selection

### `US-ENTRY-001`: Choose one ticker faction

- **Story:** As a player, I want to choose one of four ticker factions so that
  my identity and airtime contribution are understandable.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Exactly four published factions are shown before entry, each identified by
    ticker text and a non-color pattern or mark.
  - Once entry is accepted, the wallet cannot switch factions for that round.
- **Trace:** `GAME-010`, `GAME-011`, `GAME-012`, `UX-A11Y-002`.

### `US-ENTRY-002`: Understand the entry approval

- **Story:** As a first-time player, I want to see my selected bag, $1 action
  price, reusable allowance, and revocation rule before authorizing so that I
  understand the commitment.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - The confirmation surface shows `YOUR BAG`, the $100 play-USDG approval,
    the $10 refresh threshold, entry mode, and whether network gas is sponsored.
  - Paid value, locked principal, token allowance, and round spend are separate
    concepts.
- **Trace:** `PRD-002`, `PRD-004`, `PRD-009`, `UX-002`, `TECH-036`.

### `US-ENTRY-003`: Control the reusable allowance

- **Story:** As a meme trader, I want the app to reuse one clear token approval
  while leaving final approval control in my wallet.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Entry requests a $100 play-USDG approval only when allowance is below $10.
  - The player can reject, change, or revoke approval in the wallet.
  - Each accepted claim consumes exactly $1 and allowance is never refreshed
    without another wallet confirmation.
- **Trace:** `PRD-002`, `PRD-004`, `TECH-030`, `TECH-033`, `QA-005`, `RISK-014`.

### `US-ENTRY-004`: Confirm an accepted entry

- **Story:** As a player, I want a clear confirmed entry state so that I know
  my faction and session are ready before the round begins.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Submitted, confirmed, rejected, and expired entry states use distinct
    language.
  - Faction and session controls become active only after the accepted entry is
    observed from authoritative state.
- **Trace:** `TECH-EVT-003`, `DATA-EVT-005`, `DATA-EVT-006`.

### `US-ENTRY-005`: Reject an unavailable faction asset safely

- **Story:** As a player, I want entry blocked when a required asset or feed is
  unavailable so that I do not enter under unverifiable terms.
- **Priority / applicability:** `P0`, `Stage 3 GATED`.
- **Acceptance criteria:**
  - A stale, halted, inactive, noncanonical, or unsupported Stock Token cannot
    accept a new entry.
  - The UI names the unavailable ticker, explains that entry is paused, and
    preserves recovery access for any prior deposit.
- **Trace:** `GAME-014`, `GAME-017`, `GAME-018`, `TECH-SEC-004`,
  `TECH-SEC-006`, `RISK-009`, `RISK-010`.

## Epic 3: Wallet and reusable allowance

### `US-SESS-001`: Connect only when participation requires it

- **Story:** As a spectator becoming a player, I want the wallet request to
  appear at the point of entry so that public browsing remains frictionless.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Home, live spectating, rules, replay, receipt, assets, and status remain
    usable without a connected wallet.
  - Selecting `ENTER ROUND` begins the appropriate connection and authorization
    flow with the selected round context preserved.
- **Trace:** `PRD-008`, `UX-001`, `TECH-PERF-006`.

### `US-SESS-002`: Authorize one reusable allowance

- **Story:** As a funded participant, I want one reusable token approval
  followed by one-tap claims so that normal play does not prompt on every call.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Approval is scoped to the configured chain, round contract, fee token, and
    $100 amount.
  - Above $10 remaining allowance, claims do not request another approval.
  - Below $10, the next claim requests a new $100 approval.
  - The normal path does not request unlimited token approval.
- **Trace:** `PRD-002`, `TECH-002`, `TECH-030`, `TECH-034`.

### `US-SESS-003`: Inspect the active session

- **Story:** As a player, I want to inspect the remaining allowance and round
  spend so that I can verify what the app can still do.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - The session panel displays wallet identity, round, approved allowance,
    round spend, remaining allowance and actions, expiry, and fee token.
  - Token allowance, wallet balance, locked principal, game fee, and network gas
    are not combined into one number.
- **Trace:** `UX-010`, `TECH-032`, `TECH-036`.

### `US-SESS-004`: Revoke a session

- **Story:** As a player, I want to revoke my active round authorization so that
  no later action can use its remaining budget.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Revocation is available from the wallet/session panel and its pending and
    confirmed states are visible.
  - After confirmed revocation, further claims using that session fail without
    charging the game fee.
- **Trace:** `TECH-032`, `DATA-EVT-020`, `RISK-004`.

### `US-SESS-005`: Expire authorization automatically

- **Story:** As a player, I want round authority to expire automatically so that
  forgotten permissions cannot persist into later rounds.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Authorization expires no later than settlement or cancellation and cannot
    be reused for a different round.
  - The interface replaces expired session actions with a literal expired state
    and never silently creates a new budget.
- **Trace:** `TECH-031`, `TECH-030`.

## Epic 4: Live bell play

### `US-LIVE-001`: Read the canonical live state at a glance

- **Story:** As a player or spectator, I want the timer, holder, ticker, pot,
  action price, and win condition prioritized so that I can understand the
  round in one second.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - The countdown is the largest numeric element and the current holder and
    ticker never rely on color alone.
  - The primary action and remaining budget are visible without activity,
    animation, or wallet details obscuring them.
- **Trace:** `PRD-001`, `PRD-004`, `UX-003`, `UX-020`, `UX-021`,
  `UX-022`, `UX-028`.

### `US-LIVE-002`: Attempt to take the bell for the displayed price

- **Story:** As a player, I want one obvious `$1` action so that I do not have to
  interpret variable key pricing or a trading form.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - The action reads `APE FOR THE BELL · $1` in the prototype configuration.
  - Deposit size, prior action count, gas price, and faction control do not
    change the configured action fee or claim priority.
- **Trace:** `GAME-CFG-003`, `GAME-013`, `GAME-024`, `UX-023`.

### `US-LIVE-003`: See submitted state without a false crown

- **Story:** As a player, I want immediate submission feedback without being
  falsely shown as holder so that I can distinguish intent from acceptance.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Pressing the action creates a local submitted state and local action
    identity without changing the canonical holder.
  - The holder changes only after the accepted event is observed in canonical
    order.
- **Trace:** `GAME-027`, `UX-027`, `TECH-001`, `QA-004`,
  `DATA-EVT-007`, `DATA-EVT-008`, `DATA-EVT-009`.

### `US-LIVE-004`: Understand an accepted claim

- **Story:** As a player, I want confirmation that my claim was accepted so that
  I know I hold the bell and how the timer changed.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Acceptance identifies the new holder, ticker, accepted timestamp or block,
    fee, previous holder, phase, and resulting deadline.
  - The arena updates within one second of the accepted event being delivered
    to the client.
- **Trace:** `TECH-EVT-004`, `TECH-PERF-003`, `GAME-025`.

### `US-LIVE-005`: Understand a rejected claim

- **Story:** As a player, I want a literal rejection reason and fee status so
  that I know whether I spent the game fee and whether I can try again.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Rejection distinguishes current-holder, budget, phase, expired session,
    unavailable asset, and dependency failures where known.
  - It explicitly states that the `$1` game fee was not charged; any network gas
    already spent is described separately.
- **Trace:** `GAME-020`, `GAME-021`, `GAME-026`, `DATA-010`,
  `DATA-EVT-010`, `RISK-015`, `QA-006`.

### `US-LIVE-006`: Track faction airtime as the secondary contest

- **Story:** As a faction member, I want to see cumulative airtime so that I
  understand the 30% team bonus without confusing it with the headline winner.
- **Priority / applicability:** `P1`, `Stage 0+`.
- **Acceptance criteria:**
  - The board is labeled `TEAM AIRTIME · 30% BONUS` and appears below the
    primary holder, timer, and action.
  - Displayed totals reproduce settled control intervals for the configured
    scoring model.
- **Trace:** `GAME-031`, `GAME-033`, `GAME-034`, `UX-025`.

### `US-LIVE-007`: Follow readable Trenches activity

- **Story:** As a spectator, I want a concise sequence of accepted events so
  that rivalry remains understandable without watching a transaction explorer.
- **Priority / applicability:** `P1`, `Stage 0+`.
- **Acceptance criteria:**
  - The Trenches shows discrete accepted claims, rugs, and phase changes in
    canonical order.
  - Essential activity does not auto-scroll too quickly to read and does not
    replace the canonical holder panel.
- **Trace:** `UX-026`, `GAME-023`, `TECH-043`.

## Epic 5: Rug Zone and finalization

### `US-RUG-001`: Recognize entry into Rug Zone

- **Story:** As a player, I want an unmistakable final-ten-second state so that
  I understand the action is now non-extendable.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Rug Zone is derived from authoritative timestamps even if no boundary event
    has been observed.
  - The screen shows `RUG ZONE`, `NO EXTENSIONS`, exact remaining time, current
    holder, price, and remaining budget without flashing the whole viewport.
- **Trace:** `GAME-002`, `GAME-007`, `UX-004`, `UX-047`.

### `US-RUG-002`: Submit a final-seconds claim

- **Story:** As a player, I want to take the bell during Rug Zone for the same
  displayed action price so that late play remains simple and transparent.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - A valid Rug Zone claim can change the holder but never extends the deadline.
  - A claim accepted at or after the effective end is impossible.
- **Trace:** `GAME-003`, `GAME-INV-005`, `GAME-INV-006`.

### `US-RUG-003`: See the round freeze at zero

- **Story:** As a spectator, I want the countdown to freeze at zero and claims
  to close so that the end is unambiguous.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - The round ends at the published effective end even if settlement has not
    yet been submitted.
  - The interface stops presenting an enabled claim action and transitions to
    `FINALIZING TRANSMISSION`.
- **Trace:** `GAME-004`, `PRD-005`, `UX-005`.

### `US-RUG-004`: Avoid declaring an unsettled winner

- **Story:** As a player, I want finalization to distinguish the last observed
  holder from the settled winner so that the app never fabricates certainty.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Pending settlement may show `LAST SEEN ON THE BELL` but not `BAG SECURED`,
    a winner crown, or claimable balances.
  - Another eligible address can submit settlement if the first settlement
    attempt is delayed or fails.
- **Trace:** `UX-005`, `UX-048`, `TECH-PERF-007`, `RISK-016`.

## Epic 6: Settlement, rewards, and principal

### `US-SETTLE-001`: See the settled final holder

- **Story:** As a participant, I want the final holder and exact headline reward
  shown first so that the primary outcome is unmistakable.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - After settlement, the screen shows the final holder, faction, exact amount,
    round identity, and `BAG SECURED`.
  - The settlement caller cannot become the winner unless that address was the
    accepted holder at the effective end.
- **Trace:** `GAME-005`, `GAME-050`, `GAME-051`, `UX-006`.

### `US-SETTLE-002`: See faction reward separately

- **Story:** As a faction member, I want the winning faction and my faction
  reward shown separately from the final-holder prize so that I understand both
  outcomes.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - The 30% faction pool appears below the 50% final-holder result.
  - A player eligible for both pools sees two separately identified balances.
- **Trace:** `GAME-CFG-009`, `GAME-CFG-010`, `GAME-052`, `UX-006`.

### `US-SETTLE-003`: Claim rewards with pull payments

- **Story:** As a winner or eligible faction member, I want to claim my reward
  independently so that another recipient cannot block me.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Each reward type shows available, submitted, claimed, and failed states.
  - A failed transfer to one recipient does not block settlement or another
    player's claim.
- **Trace:** `GAME-054`, `GAME-056`, `TECH-SEC-001`, `TECH-SEC-002`,
  `TECH-EVT-009`.

### `US-SETTLE-004`: Withdraw locked Stock Token principal separately

- **Story:** As a Stock Token holder, I want to withdraw the same deposited
  token quantity independently of rewards so that game winnings and principal
  custody remain separate.
- **Priority / applicability:** `P0`, `Stage 3 GATED`.
- **Acceptance criteria:**
  - Settlement or cancellation makes the same deposited token quantity
    withdrawable, subject only to explicitly modeled token behavior.
  - The user may withdraw principal without claiming a prize in the same
    transaction, and the UI does not promise the same fiat value.
- **Trace:** `GAME-015`, `GAME-016`, `GAME-055`, `TECH-EVT-008`,
  `RISK-COMP-002`.

### `US-SETTLE-005`: Verify the pot allocation

- **Story:** As an auditor or skeptical player, I want to reconstruct pot
  sources and allocations so that the displayed rewards do not depend on an
  operator spreadsheet.
- **Priority / applicability:** `P1`, `Stage 1+`.
- **Acceptance criteria:**
  - The final state identifies whether the pot was sponsored, carried,
    player-funded, or mixed.
  - Events reproduce gross pot, final-holder pool, faction pool, next seed,
    operations pool, and deterministic rounding.
- **Trace:** `GAME-041`, `GAME-042`, `GAME-043`, `GAME-INV-002`,
  `TECH-004`.

## Epic 7: Replay, receipts, and sharing

### `US-SOCIAL-001`: Replay accepted claims in canonical order

- **Story:** As a spectator, I want to step through the round so that I can see
  how each accepted claim changed the holder and timer.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Replay orders events by canonical block, transaction, and log order at
    Stage 1+, or by the equivalent deterministic order in Stage 0.
  - Each step can show previous holder, new holder, faction, phase, resulting
    deadline, and transaction link when one exists.
- **Trace:** `UX-007`, `GAME-023`, `TECH-043`.

### `US-SOCIAL-002`: Verify replay against settlement

- **Story:** As an auditor, I want replay totals and final state to match
  settlement so that a polished animation cannot rewrite history.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Replay reproduces the settled final holder, faction totals, player control
    intervals, and pool allocations.
  - A direct-read mismatch marks derived replay data degraded and raises an
    operator alert.
- **Trace:** `GAME-034`, `TECH-044`, `TECH-045`, `TECH-053`,
  `QA-003`.

### `US-SOCIAL-003`: Receive a deterministic result receipt

- **Story:** As a player, I want a receipt for a win, loss, rug, or snipe so
  that the result is worth saving and sharing.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Receipt content is generated from round and player result inputs, with a
    literal outcome plus the approved meme phrase.
  - Re-rendering identical canonical inputs produces the same factual result,
    round identity, and replay link.
- **Trace:** `PRD-007`, `UX-008`, `TECH-050`, `RISK-019`.

### `US-SOCIAL-004`: Share a receipt safely

- **Story:** As a player, I want native share and copy-link actions so that I
  can post a result without exposing wallet-session secrets.
- **Priority / applicability:** `P1`, `Stage 0+`.
- **Acceptance criteria:**
  - The URL contains round and player identity but no secret, signature,
    session token, or private authorization material.
  - Shared media includes plain-text alternative content and works without a
    wallet connection.
- **Trace:** `TECH-051`, `TECH-052`, `TECH-054`.

### `US-SOCIAL-005`: Run it back from a settled result

- **Story:** As a returning player, I want to spectate or enter the next round
  from my result so that the short loop continues without losing context.
- **Priority / applicability:** `P1`, `Stage 0+`.
- **Acceptance criteria:**
  - `RUN IT BACK` resolves to the next scheduled, entry-open, or live round with
    its actual phase visible.
  - No prior faction, budget, or authorization is silently carried into the new
    round.
- **Trace:** `DATA-007`, `TECH-030`.

## Epic 8: Rules, assets, and transparency

### `US-TRUST-001`: Inspect deployed game constants

- **Story:** As a player, I want the rules page to match the active round
  configuration so that I know the actual price, timer, Rug Zone, and payout
  split.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - The page displays the current round's configured action fee, initial
    deadline, extension, hard end, Rug Zone duration, and pool shares.
  - A deployed environment fails release acceptance if public rules do not
    match its configuration.
- **Trace:** `UX-009`, `TECH-EVT-001`, `QA-011`.

### `US-TRUST-002`: Inspect supported canonical assets

- **Story:** As a prospective Stock Token participant, I want an allowlist with
  address, token status, feed status, and entry status so that a ticker name
  alone cannot deceive me.
- **Priority / applicability:** `P0`, `Stage 3 GATED`.
- **Acceptance criteria:**
  - Each supported bag exposes its canonical token address and independently
    labeled token, feed, and entry health.
  - Arbitrary ticker-named assets are rejected even if their symbol matches a
    supported bag.
- **Trace:** `UX-011`, `GAME-014`, `TECH-SEC-004`.

### `US-TRUST-003`: Understand what a Stock Token represents

- **Story:** As a visitor, I want literal Stock Token language so that I do not
  mistake tokenised debt exposure for equity ownership.
- **Priority / applicability:** `P0`, `Stage 2+ GATED`.
- **Acceptance criteria:**
  - Official copy uses `Stock Token`, not `wrapped share`, and states that the
    instrument does not grant underlying-company ownership.
  - Marketing and rules do not promise returns or a guaranteed fiat value.
- **Trace:** `PRD-OUT-008`, `RISK-COMP-001`, `RISK-COMP-002`,
  `RISK-COMP-010`.

### `US-TRUST-004`: Verify contracts and transactions

- **Story:** As a technical player, I want direct explorer and contract links so
  that I can independently verify rules, claims, settlement, and withdrawals.
- **Priority / applicability:** `P1`, `Stage 1+`.
- **Acceptance criteria:**
  - Rules, replay, receipt, final result, and incident surfaces expose the
    relevant chain, contract, round, block, or transaction identity.
  - Links are constructed from configured canonical addresses rather than
    user-supplied display content.
- **Trace:** `PRD-003`, `TECH-003`, `TECH-SEC-012`.

## Epic 9: Failure, cancellation, and recovery

### `US-INC-001`: Recognize weak live data

- **Story:** As a player, I want a visible lag state so that I do not mistake
  stale local data for the canonical holder.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - The interface shows last verified block or update age and identifies
    `WEAK SIGNAL` when configured freshness limits are exceeded.
  - The app uses direct RPC fallback where safe or pauses submission with a
    literal explanation.
- **Trace:** `UX-012`, `UX-029`, `TECH-042`, `TECH-PERF-005`,
  `DATA-EVT-021`, `RISK-007`.

### `US-INC-002`: Avoid acting on an unknown holder

- **Story:** As a player, I want claims paused when the app cannot reliably
  establish current state so that I am not invited to act on a fabricated
  crown.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - When neither indexed state nor direct-read fallback is sufficiently fresh,
    the action is disabled and the current holder is marked unverified.
  - The incident surface says whether a game fee was charged and offers retry,
    status, and explorer actions.
- **Trace:** `UX-012`, `TECH-005`, `TECH-045`, `QA-004`.

### `US-INC-003`: Recover from gas-sponsorship failure

- **Story:** As a player, I want a truthful alternative when sponsored gas is
  unavailable so that the app does not submit under different cost terms
  without my consent.
- **Priority / applicability:** `P1`, `Stage 1+`.
- **Acceptance criteria:**
  - The flow either explains a user-paid gas alternative before submission or
    stops submission.
  - The token allowance, round spend, and `$1` game fee remain distinct from network gas.
- **Trace:** `TECH-037`, `TECH-036`.

### `US-INC-004`: Recover from round cancellation

- **Story:** As a participant in a cancelled round, I want the reason and exact
  refundable balances so that I can recover without waiting for every other
  player.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - A cancelled live round has no winner and exposes its reason code, fee
    refund, and principal recovery separately.
  - Refunds use pull-based claims, and an operator cannot redirect the
    cancelled pot.
- **Trace:** `GAME-061`, `GAME-062`, `GAME-063`, `GAME-064`,
  `TECH-EVT-010`, `TECH-EVT-011`.

### `US-INC-005`: Recover principal despite later asset inactivity

- **Story:** As a Stock Token depositor, I want withdrawal to remain available
  if the asset becomes halted or inactive after entry so that status changes do
  not trap principal.
- **Priority / applicability:** `P0`, `Stage 3 GATED`.
- **Acceptance criteria:**
  - New entries fail closed for the affected asset while existing principal
    remains withdrawable.
  - Incident and supported-assets screens explain the distinction between
    paused entry and recovery access.
- **Trace:** `GAME-017`, `GAME-018`, `RISK-009`, `QA-008`.

## Epic 10: Accessibility, responsive use, and performance

### `US-A11Y-001`: Complete the core journey by keyboard

- **Story:** As a keyboard-only player, I want to spectate, select a faction,
  set a budget, enter, claim, inspect status, and claim a result without a
  pointer.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Focus order follows rule, state, primary action, budget, and secondary
    information.
  - All interactive controls have visible focus and pass the keyboard core-flow
    acceptance test.
- **Trace:** `UX-A11Y-003`, `UX-A11Y-004`, `DATA-011`, `QA-010`.

### `US-A11Y-002`: Use a screen reader during rapid gameplay

- **Story:** As a screen-reader user, I want restrained announcements so that I
  receive material state changes without hearing every timer tick.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Holder changes, phase changes, acceptance, rejection, finalization, and
    settlement are announced through controlled live regions.
  - Timer frames and rapid feed updates do not overwhelm the announcement
    queue.
- **Trace:** `UX-A11Y-006`, `UX-A11Y-007`.

### `US-A11Y-003`: Use reduced motion

- **Story:** As a motion-sensitive user, I want decorative broadcast movement
  removed so that gameplay remains comfortable without losing state.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - `prefers-reduced-motion` disables digit rolls, signal tears, lower-third
    wipes, and looping celebration.
  - Phase, timer, holder, and result remain clear through static changes.
- **Trace:** `UX-A11Y-005`, `UX-046`, `UX-048`, `QA-010`.

### `US-A11Y-004`: Play on a narrow mobile viewport

- **Story:** As a mobile player at 320 CSS pixels, I want the core arena to fit
  without horizontal scrolling so that the primary loop remains usable.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Pot, timer, holder, action, and remaining budget remain available on narrow
    and short-height mobile layouts.
  - Secondary activity may collapse, but the primary action remains within
    practical thumb reach and no horizontal overflow occurs.
- **Trace:** `PRD-006`, `UX-050`, `UX-054`, `QA-009`.

### `US-A11Y-005`: Use desktop without receiving a trading dashboard

- **Story:** As a desktop spectator, I want the arena to stay visually dominant
  while side rails add context so that the game does not turn into a terminal.
- **Priority / applicability:** `P1`, `Stage 0+`.
- **Acceptance criteria:**
  - At 768-1199 pixels, the portrait arena remains dominant with at most one
    adjacent activity rail.
  - At 1200 pixels and wider, side rails may show rules, airtime, Trenches,
    replay, or session detail but not charts, order books, or portfolio data.
- **Trace:** `PRD-OUT-007`, `UX-051`, `UX-052`, `UX-053`.

### `US-A11Y-006`: Reach the primary action quickly

- **Story:** As a player on a representative mobile connection, I want the
  arena and claim control ready before nonessential replay or receipt code so
  that I do not miss a short round.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Mobile largest-contentful paint targets under 2.5 seconds at the 75th
    percentile on the defined representative 4G profile.
  - The main action becomes interactive without waiting for historical replay,
    receipt rendering, or wallet-independent share modules.
- **Trace:** `TECH-PERF-001`, `TECH-PERF-002`.

## Epic 11: Operator, support, and audit

### `US-OPS-001`: Schedule and configure a future round

- **Story:** As an operator, I want to publish a future round's factions,
  constants, assets, and payout shares so that players can inspect immutable
  terms before play.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Configuration emits a complete public event and appears on the rules and
    entry surfaces before the round starts.
  - Once live, no privileged function can change the round's winner, fee,
    factions, timer constants, or payout split.
- **Trace:** `PRD-010`, `TECH-EVT-001`, `TECH-SEC-009`, `RISK-003`.

### `US-OPS-002`: Rebuild a round projection

- **Story:** As an operator, I want to rebuild indexed state from the configured
  start block so that a database failure does not destroy replay history.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Indexing is idempotent and reorg-aware, and repeated rebuilds converge on
    the same canonical projection.
  - The rebuilt holder, timer, control totals, settlement, and claims match
    direct contract state.
- **Trace:** `TECH-040`, `TECH-041`, `TECH-044`.

### `US-OPS-003`: Detect a projection mismatch

- **Story:** As an operator, I want alerts when indexed and contract state
  diverge so that derived displays can be degraded before misleading users.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Continuous comparisons cover holder, deadlines, control totals, settlement,
    and claimable balances.
  - A mismatch records the round, field, observed values, and freshness without
    altering canonical contract state.
- **Trace:** `TECH-044`, `TECH-045`, `DATA-012`.

### `US-OPS-004`: Investigate a player transaction

- **Story:** As a support responder, I want to determine whether an entry,
  claim, settlement, reward, principal, or refund action was submitted,
  accepted, rejected, or reverted so that I can answer fee and recovery
  questions accurately.
- **Priority / applicability:** `P1`, `Stage 1+`.
- **Acceptance criteria:**
  - Support can search by round and transaction or wallet identity without
    requiring a seed phrase, signature, or session secret.
  - The evidence distinguishes network gas from game fees and identifies the
    canonical event or revert outcome.
- **Trace:** `TECH-EVT-003` through `TECH-EVT-011`, `DATA-020`.

### `US-OPS-005`: Reconcile value-bearing balances

- **Story:** As a treasury or financial operator, I want principal, pot, seed,
  operations, refunds, and claimed balances reconciled separately so that value
  cannot be silently double-counted.
- **Priority / applicability:** `P0`, `Stage 2+ GATED`.
- **Acceptance criteria:**
  - Reconciliation derives balances from contract state and events and proves
    the accounting invariant for each settled or cancelled round.
  - No operator withdrawal can touch unsettled principal or winner allocations.
- **Trace:** `GAME-044`, `GAME-INV-009`, `TECH-004`, `TECH-SEC-003`,
  `RISK-017`.

### `US-OPS-006`: Exercise incident and cancellation procedures

- **Story:** As an operator, I want rehearsed Weak Signal, Signal Lost, Dead Air,
  contract-incident, and cancellation procedures so that the public state and
  recovery path remain truthful under failure.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Each drill records detection, public status, action gating, fee treatment,
    recovery, and closure evidence.
  - No value-bearing stage exits its launch gate without the applicable
    incident and cancellation drill.
- **Trace:** `UX-012`, `RISK-016`, `QA-012`.

## Epic 12: Eligibility, compliance, and privacy

### `US-COMP-001`: See value-bearing terms before authorization

- **Story:** As a prospective participant, I want exact cost, pot source, payout
  shares, eligibility, and withdrawal terms before authorization so that I can
  make an informed choice.
- **Priority / applicability:** `P0`, `Stage 2+ GATED`.
- **Acceptance criteria:**
  - Terms shown before authorization match the deployed configuration and
    current launch mode.
  - Copy does not promise returns, guaranteed winnings, risk-free play, or
    absolute bot fairness.
- **Trace:** `RISK-COMP-004`, `RISK-COMP-005`, `RISK-COMP-009`,
  `PRD-OUT-009`.

### `US-COMP-002`: Stop an ineligible value-bearing entry

- **Story:** As a restricted visitor, I want a clear ineligible state before
  value is authorized so that I am not taken into a flow I cannot complete.
- **Priority / applicability:** `P0`, `Stage 2+ GATED`.
- **Acceptance criteria:**
  - Required jurisdiction, age, sanctions, or product eligibility is enforced
    according to the approved launch matrix rather than by frontend
    geolocation alone.
  - The screen explains that entry is unavailable without exposing sensitive
    rule logic or storing unnecessary identity data.
- **Trace:** `RISK-COMP-006`, `RISK-COMP-007`, `RISK-COMP-008`,
  `RISK-OPEN-001`, `RISK-OPEN-002`, `RISK-OPEN-006`.

### `US-COMP-003`: Enforce Stock Token eligibility

- **Story:** As an eligible Stage 3 participant, I want the contract to accept
  only a valid eligibility attestation and canonical asset so that frontend
  bypass cannot create an unsupported custody position.
- **Priority / applicability:** `P0`, `Stage 3 GATED`.
- **Acceptance criteria:**
  - Eligibility and canonical-asset checks are enforced onchain or by the
    approved contract-verifiable design.
  - Expired, invalid, or wrong-jurisdiction attestations fail before principal
    is accepted.
- **Trace:** `TECH-OPEN-009`, `RISK-009`, `RISK-COMP-008`.

### `US-COMP-004`: Protect analytics privacy

- **Story:** As a player, I want product analytics to exclude secrets and
  sensitive eligibility data so that measurement does not create a new custody
  or privacy risk.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Private keys, session secrets, signatures, identity documents, and full
    wallet-provider payloads are never collected.
  - Sensitive eligibility results stay outside general product analytics, and
    wallet addresses are treated as potentially personal data.
- **Trace:** `DATA-020`, `DATA-021`, `DATA-022`, `DATA-023`.

### `US-COMP-005`: Preserve core functionality when analytics fail

- **Story:** As a player, I want analytics outages to be invisible to the game
  path so that tracking cannot block play, settlement, withdrawal, or replay
  verification.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - Analytics calls are nonblocking and failure-tolerant.
  - An analytics outage does not change canonical state, disable withdrawal, or
    alter the displayed winner.
- **Trace:** `DATA-025`, `TECH-005`.

## Epic 13: Analytics and product learning

### `US-DATA-001`: Measure five-second comprehension

- **Story:** As a product owner, I want moderated and instrumented evidence that
  first-time users understand the action, price, win condition, budget, and
  holder so that visual personality does not outrank comprehension.
- **Priority / applicability:** `P0`, `Stage 0+`.
- **Acceptance criteria:**
  - The test records whether participants answer all five questions correctly
    after the defined exposure.
  - Milestone exit uses the current `DATA-001` target and retains failed-answer
    categories for redesign.
- **Trace:** `PRD-001`, `DATA-001`, `UX-060`.

### `US-DATA-002`: Measure entry and budget comprehension

- **Story:** As a product owner, I want to know whether players complete bounded
  entry and understand remaining spend so that one-tap play does not hide risk.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Entry start, budget selection, confirmed entry, elapsed time, and remaining
    actions are measured without collecting secrets.
  - The review reports `DATA-002` entry completion and `DATA-004` budget
    comprehension against their stated targets.
- **Trace:** `DATA-002`, `DATA-004`, `DATA-EVT-003` through
  `DATA-EVT-006`.

### `US-DATA-003`: Measure canonical-state reliability

- **Story:** As a product owner, I want accepted-state accuracy, replay parity,
  rejection clarity, and index discrepancies measured so that growth metrics
  cannot hide trust failures.
- **Priority / applicability:** `P0`, `Stage 1+`.
- **Acceptance criteria:**
  - Reports place `DATA-003`, `DATA-006`, `DATA-010`, and `DATA-012` ahead of
    runback or sharing metrics.
  - Any false holder crown, replay mismatch, charged rejected-game fee, or
    unresolved projection discrepancy blocks the applicable milestone exit.
- **Trace:** `DATA-003`, `DATA-006`, `DATA-010`, `DATA-012`,
  `QA-003`, `QA-004`, `QA-006`.

### `US-DATA-004`: Measure the repeat and share loop

- **Story:** As a product owner, I want to measure runback, receipt sharing, and
  shared-link conversion so that memeability is evaluated without monetary
  referrals.
- **Priority / applicability:** `P1`, `Stage 0+`.
- **Acceptance criteria:**
  - Measurement distinguishes receipt opened, share initiated, replay opened,
    next round spectated, and next round entered.
  - No affiliate commission, referral tree, or random reward is introduced to
    improve the metric.
- **Trace:** `PRD-OUT-003`, `PRD-OUT-004`, `DATA-007`, `DATA-008`,
  `DATA-009`, `DATA-EVT-016` through `DATA-EVT-019`.

## Decision-validation stories

The following open decisions must be resolved through simulation, prototype
testing, legal review, or operational design before the related behavior is
treated as final:

| Decision area | Validation outcome required | Source |
|---|---|---|
| Timer constants | Simulate comprehension, extension behavior, hard-end pressure, and Rug Zone before approval. | `GAME-OPEN-001` |
| Payout split | Model incentives and player comprehension before approving 50/30/15/5 for value-bearing play. | `GAME-OPEN-002` |
| Stock Token threshold | Validate eligibility, price pipeline, custody burden, and user comprehension. | `GAME-OPEN-003` |
| Same-faction theft | Test whether faction identity remains legible when teammates can take the bell. | `GAME-OPEN-004` |
| Control-time precision | Select timestamp, block, or hybrid scoring and define rapid zero-duration holds. | `GAME-OPEN-005`, `TECH-OPEN-005` |
| Faction ties | Publish and test a deterministic tie rule. | `GAME-OPEN-006` |
| Late entry | Decide whether players may enter during `Live` and define the fair cutoff. | `GAME-OPEN-007` |
| Empty rounds and seed | Define minimum seed, empty-round settlement, and next-round behavior. | `GAME-OPEN-008` |
| Account abstraction | Select and threat-model the session authorization and paymaster design. | `TECH-OPEN-002`, `TECH-OPEN-003` |
| Reorg policy | Define confirmations and reorg handling for holder display, replay, settlement, and withdrawal. | `TECH-OPEN-010` |
| Jurisdiction and identity | Obtain the Stage 2 and Stage 3 counsel decisions before enabling value-bearing entry. | `RISK-OPEN-001`, `RISK-OPEN-002`, `RISK-OPEN-003` |
| Emergency authority | Define cancellation powers, refund policy, controls, and public evidence. | `RISK-OPEN-007` |

## Definition of ready for an implementation story

A story is ready only when:

1. Its applicable stage and source requirement status are known.
2. Any referenced open decision has an owner or is explicitly simulated as a
   parameter rather than hard-coded.
3. UX copy and visual state can be mapped to the screen concepts in
   [PRD 03](03-experience-and-interface.md#visual-screen-specifications).
4. Canonical source, loading, submitted, accepted, rejected, degraded,
   settlement, and cancellation states are identified where applicable.
5. Analytics do not collect secrets or block the core path.
6. Acceptance criteria can be automated, observed in moderated testing, or
   verified through an explicit operational drill.

## Definition of done for an implementation story

A story is done only when:

1. Its acceptance criteria pass in the applicable simulator, testnet, or gated
   environment.
2. Related requirement IDs and tests are linked in the implementation change.
3. Keyboard, narrow-mobile, reduced-motion, and truthful failure states are
   covered where relevant.
4. No optimistic holder or winner state was introduced.
5. Any user-visible rule or constant matches deployed configuration.
6. The story's telemetry is privacy-safe and nonblocking, if telemetry applies.
7. Documentation and operator or support evidence are updated when the story
   changes a public or recoverable state.
