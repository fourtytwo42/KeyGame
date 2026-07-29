# Closing Print User Stories

Status: Current `closing-print-v1` backlog

Supersedes: permanent-faction stories in PRD 08

## Discovery and comprehension

### `CP-DISC-001` Understand the rule

As a first-time visitor, I can identify the clock, `$1` action, final-caller
prize, and market-weighted Closing Print contest within five seconds.

Acceptance:

- The literal rule appears before lore.
- The 50% final-caller result is visually primary.
- The 30% Closing Print result is visibly secondary.

### `CP-DISC-002` Inspect the selected roster

As a spectator, I can see exactly four automatically selected tickers, their
30-minute heat rank, current move, band, and multiplier.

### `CP-DISC-003` Distinguish verified and flat rounds

As a player, I can tell whether signed market reports are active or whether
this immutable round scores every ticker at `1.00×`.

### `CP-DISC-004` Understand the hard cap

As a risk-conscious player, I can see the current clock, Rug Zone boundary,
and 180-second hard stop before paying.

### `CP-DISC-005` Land directly in the game

As a visitor, `/` opens the one active Last Bell game without making me pass
through a marketing page or choose a game mode.

## Entry and allowance

### `CP-ENTRY-001` Choose a starter ticker

As a new player, I can select any of the four tickers locally without signing
a transaction.

### `CP-ENTRY-002` Enter with one paid claim

As a new player, pressing `ENTER WITH {TICKER} · $1` checks allowance and
submits the first bell claim without a separate entry transaction.

### `CP-ENTRY-003` Use one reusable approval

As a repeat player, I approve `$100` once and am prompted again only when the
remaining allowance is below `$10`.

### `CP-ENTRY-004` Edit or reject approval

As a wallet user, I can alter or reject the proposed approval in my wallet and
the game does not imply that approval itself spent funds.

### `CP-ENTRY-005` Revoke later

As a player, I can set the USDG allowance to zero from the session panel.

## Live claims

### `CP-LIVE-001` Put any ticker on air

As a caller, I have four one-tap `$1` controls and may choose a different
ticker on each accepted claim.

### `CP-LIVE-002` See scoring before submission

As a caller, each control shows the selected ticker's `GREEN`, `FLAT`, or
`RED` band and its multiplier before I submit.

### `CP-LIVE-003` Prevent self-claims

As the current holder, all four claim controls are disabled until another
wallet takes the bell.

### `CP-LIVE-004` Extend live time

As an accepted caller outside Rug Zone, my claim adds exactly two seconds
without crossing the hard cap.

### `CP-LIVE-005` Steal in Rug Zone

As a late caller, my accepted Rug Zone claim changes the holder but does not
extend the timer.

### `CP-LIVE-006` Avoid a charge on invalid data

As a caller, stale, missing, mismatched, expired, future, or replayed reports
revert before the `$1` fee moves.

### `CP-LIVE-007` Observe a ticker raid

As a spectator, I can see repeated ticker switches and Producer Pass activity
in an event-derived Trenches feed without open chat.

## Closing Print

### `CP-SCORE-001` See raw and weighted performance

As a spectator, I can see each ticker's raw seconds and weighted points without
confusing points with control time.

### `CP-SCORE-002` Lock a claim's multiplier

As a player, the band accepted with my claim applies to my entire holder
interval even if the market changes later.

### `CP-SCORE-003` Aggregate across wallets

As a ticker supporter, all wallets' weighted intervals for that ticker add to
one Closing Print score.

### `CP-SCORE-004` Contribute to multiple tickers

As a flexible player, I may earn scores for multiple tickers, but only my
winning-ticker score participates in the 30% pool.

### `CP-SCORE-005` Resolve ties deterministically

As an auditor, a weighted tie resolves by most recent acquisition and then
lower configured ticker index.

## Producer Pass

### `CP-PASS-001` Play open rounds without a token

As an ordinary wallet, I can play an open round without owning a Stock Token.

### `CP-PASS-002` Show verified holder identity

As a canonical token holder, I see `ACTUALLY HOLDS THE BAG` when putting that
token's ticker on air.

### `CP-PASS-003` Enter a special round

As a wallet holding a positive balance of any roster Stock Token, I can enter a
`PRODUCER_PASS_REQUIRED` round.

### `CP-PASS-004` Reject zero balance

As an operator, I can rely on the contract to reject a special-round claim
after the wallet transfers away its qualifying balance.

### `CP-PASS-005` Prevent pay-to-win weighting

As a player, one token unit and a large token balance confer identical access
and no score or payout advantage.

## Settlement and claims

### `CP-SETTLE-001` See final caller first

As a spectator, Final Transmission names the final caller and exact 50% pool
before showing the Closing Print result.

### `CP-SETTLE-002` See the winning ticker

As a contributor, I can see the winning ticker, frozen weighted score, my
eligible score, and proportional 30% share.

### `CP-SETTLE-003` Pull rewards independently

As an eligible wallet, I claim final-holder, Closing Print, or refund balances
independently and cannot claim any twice.

### `CP-SETTLE-004` Conserve the pot

As an auditor, the four configured pools add exactly to the gross pot.

### `CP-SETTLE-005` Receive emergency refunds

As a player in a cancelled round, I can pull all accepted game fees I paid;
network gas remains separate.

## Replay, proof, and compatibility

### `CP-PROOF-001` Replay every accepted claim

As a spectator, I can replay ticker, price, report time, band, multiplier,
holder switch, resulting clock, transaction, and block.

### `CP-PROOF-002` Inspect completed intervals

As an auditor, replay shows interval bounds, raw seconds, and weighted points
from `ControlCredited` events.

### `CP-PROOF-003` Share a verified receipt

As a winner or contributor, I can share a receipt containing round, chain,
contract, version, ticker, report, score, and payout identity.

### `CP-PROOF-004` Read legacy tapes safely

As a returning user, I can view `faction-v0` replays through an explicit
read-only version parser without those fields entering current state.

### `CP-PROOF-005` Browse completed runs

As a returning player, I can browse real completed runs beneath the main game,
see each peak pot, final caller, Closing Print ticker, and call count, then open
one run to inspect its full event-derived details.

Acceptance:

- No fake historical runs are displayed.
- A settled devnet run is archived on the VM and survives an Anvil reset.
- The Final Transmission does not duplicate archive navigation with receipt or
  replay buttons.

## Operator and market data

### `CP-OPS-001` Run the automatic screen

As an operator, I can run the deterministic completeness, eligibility,
movement, volume, and symbol rules without manual roster selection.

### `CP-OPS-002` Delay an invalid broadcast

As an operator, the round is not configured when fewer than four active,
canonical, non-halted assets remain.

### `CP-OPS-003` Keep credentials server-side

As a security owner, Data Streams credentials never enter client bundles or
wallet parameters; only signed report bytes and public metadata reach clients.

### `CP-OPS-004` Cancel a sustained outage

As an operator, I can invoke the existing emergency cancellation after all
four verified feeds remain unavailable for 15 seconds.

### `CP-OPS-005` Configure verifier per deployment

As a deployer, I supply the verifier proxy and canonical token/feed mapping for
each network and do not depend on a hardcoded mainnet address.

### `CP-OPS-006` Keep broadcasts running

As a player, I see an eight-second Final Transmission and then the next
numbered round starts automatically with the prior round's 15% seed.

Acceptance:

- Finalization and rollover continue when no browser is open.
- The completed run is archived before the deployment pointer changes.
- Only one rollover can run for a settled contract.
- A partial rollover resumes without duplicating a round or losing the seed.
- The player keeps one reusable payment-router approval across rounds.
- The studio changes contract, round number, pot, and session state without an
  application rebuild or restart.

## Accessibility and viewport

### `CP-A11Y-001` Play without color perception

As a color-blind player, ticker text, band text, multiplier text, and patterns
convey every state represented by color.

### `CP-A11Y-002` Play with a keyboard

As a keyboard-only player, I can select a starter ticker, operate all live
claim controls, revoke approval, and claim rewards with visible focus.

### `CP-A11Y-003` Avoid desktop page scroll

As a desktop player, Entry, Live, Rug, Final, Replay, and Producer Pass states
fit the viewport-constrained studio without document scrolling.

### `CP-A11Y-004` Use mobile controls

As a mobile player, all four ticker actions remain readable and tappable
without horizontal overflow or obscuring the clock.
