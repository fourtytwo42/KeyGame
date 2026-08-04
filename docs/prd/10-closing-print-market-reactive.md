# Closing Print Market-Reactive Specification

> `D-022` override: PRD 13 replaces Chainlink Data Streams with direct
> ten-minute DEX TWAPs and replaces weighted contributor shares with raw
> winning-ticker airtime. All unaffected timer and payout percentages remain.

Status: Implemented Stage 1 specification

Decision: `D-020`

Contract version: `closing-print-v1`

This document replaces every permanent-faction, separate-entry, asset-lock,
and `joinFaction` requirement in the earlier PRD set.

## Five-second rule

> Pick a stock. Pay $1 to put it on air and steal the bell. Market momentum
> boosts its airtime. Hold the bell at zero to win 50%.

The contests remain separate:

- The final caller receives 50% of the gross pot.
- The ticker with the most weighted Closing Print points receives a 30% pool,
  divided among wallets by their weighted contribution to that ticker.
- 15% seeds the next round.
- 5% funds protocol operations.

Market state never changes the `$1` fee, timer extension, final-caller result,
or size of any payout pool.

## Automatic roster

Each round has exactly four ordered ticker slots with a symbol, canonical
Robinhood Chain Stock Token address, Chainlink Data Streams feed ID, opening
reference price, and visual treatment.

The screen runs 60 seconds before configuration over the prior 30 minutes:

1. Exclude inactive, halted, non-canonical assets, assets without a configured
   feed, and feeds with fewer than 100 of the expected 120 samples.
2. Rank by summed absolute sample-to-sample basis-point returns.
3. Break ties by daily underlying volume descending, then ticker ascending.
4. Select four and label the broadcast `HEAT CHECK`.
5. If fewer than four verified feeds qualify, select active canonical assets
   by volume and create an immutable `FLAT` `VOLUME CHECK` round.
6. If fewer than four canonical assets remain, delay the broadcast.

No operator manually picks the top four.

## Entry and claims

Entry ticker selection is local UI state. `ENTER WITH NVDA · $1` performs the
reusable USDG allowance check and first paid `claimBell` transaction. There is
no free entry transaction or permanent team. The configured round waits with
no running deadline until this first valid paid claim starts the 45-second
clock and 180-second hard cap.

```solidity
claimBell(uint8 tickerIndex, bytes signedMarketReport, uint8 passTokenIndex)
```

A wallet may select a different ticker on every accepted claim. The current
holder cannot claim again until another wallet steals the bell.

Before transferring the fee, the contract validates phase, ticker, Producer
Pass when required, report presence, verifier result, feed match, positive
price, time ordering, freshness, expiry, and replay status.

## Immutable market modes

`VERIFIED`

- `start()` verifies four opening reports, stores immutable references, and
  funds the seed pot without starting the timer.
- Every claim requires a signed report for its selected feed.
- Production reports are at most three seconds old and cannot predate that
  ticker's last accepted report or be replayed.
- A live round never downgrades to flat.
- A sustained all-stream outage uses cancellation and fee refunds.

`FLAT`

- Claims omit reports and every interval scores `1.00×`.
- The mode is fixed before start.

Anvil and Robinhood testnet use deterministic reports and a mock verifier until
an official testnet verifier is confirmed. Verifier proxies are deployment
configuration, never hardcoded.

## Score rules

| Band | Verified price versus opening | Multiplier |
| --- | --- | ---: |
| `GREEN` | at least +5 bps | `1.25×` |
| `FLAT` | between -5 and +5 bps | `1.00×` |
| `RED` | at most -5 bps | `0.75×` |

The accepted claim locks its band for the whole holder interval:

```text
rawSeconds = intervalEnd - intervalStart
weightedScoreBps = rawSeconds * lockedMultiplierBps
```

The contract tracks raw and weighted totals by player and ticker. Winner:
greatest weighted score, then most recent acquisition, then lowest configured
ticker index.

Only score contributed to the winning ticker receives the 30% pool:

```text
playerReward =
  closingPrintPool * playerWinningTickerScore / winningTickerScore
```

Payout allocation must conserve the gross pot.

## Timer and economy

- `$1` accepted-claim fee.
- `$100` reusable allowance to the permanent payment router, refreshed only
  below `$10`; changing round contracts does not require another approval.
- First valid paid claim starts the 45-second opening clock and 180-second hard
  cap. Waiting for that claim has no timeout.
- Later accepted live claims add two seconds.
- Ten-second Rug Zone with no extension.
- 180-second hard cap.
- Pull payments and cancellation refunds.
- No Stock Token custody or locking.

## Continuous broadcasts

A settled round never leaves the main game idle:

1. Record the final event-derived snapshot in Historical Runs.
2. Hold Final Transmission for eight seconds so the result is readable.
3. Transfer the settled round's 15% `nextRoundPool` into the next round.
4. Configure and fund the next numbered round automatically, leaving its timer
   stopped on the Entry Desk.
5. Move the studio to the waiting round without a page rebuild or app restart.
6. Start its timer only when a player makes the first valid `$1` claim.

The rollover is single-flight and resumable. A partial operator transaction
sequence must not duplicate a round, lose the seed, or leave the public
deployment pointer between contracts. Rewards remain pull payments in their
original round contracts after the next broadcast starts.

Players approve one permanent payment router rather than each round contract.
Only operator-authorized round contracts may pull the exact accepted-claim fee.
The local devnet uses an unattended keeper process. Testnet and production
require an authenticated, monitored keeper with the same deterministic state
machine.

## Producer Pass

Open rounds require no Stock Token balance. The interface shows `ACTUALLY HOLDS
THE BAG` when the claimant holds the canonical token being put on air.

`PRODUCER_PASS_REQUIRED` special rounds accept any positive roster-token
balance. Balance size never changes score, fee, timer, or payout. Pass holders
unlock verified-holder receipts, ticker raid activity, a Producer Booth, and
special-round access. Open chat is out of scope.

## Interface

Main route:

- `/` opens directly into the one active game; there is no separate marketing
  landing page or game picker;
- legacy `/play/{roundId}` links redirect to the main route;
- a Historical Runs section follows the studio and lists only completed,
  event-derived runs;
- each run shows its peak pot, final caller, Closing Print ticker, and call
  count, then opens the complete replay/details view.

Entry Desk:

- automatic four-stock roster;
- 30-minute rank, move, band, multiplier, and pass badge;
- local starter selection;
- `ENTER WITH {TICKER} · $1`.
- explicit notice that the first `$1` claim starts the timer.
- a dominant `00:45` armed-clock display that remains fixed while waiting and
  visually hands off to the live countdown after the first accepted claim.

Live Studio:

- clock, pot, holder ticker, locked band, and multiplier;
- `THE CLOSING PRINT` raw and weighted board;
- four one-tap `PUT {TICKER} ON AIR · $1` buttons;
- all buttons disabled for the current holder or unavailable data;
- viewport-contained desktop and usable mobile layouts.

Final Transmission:

- final caller and 50% reward first;
- Closing Print ticker and score second;
- contributor score and claimable share;
- separate pull-payment actions;
- no standalone receipt or replay buttons; completed-run discovery lives in
  Historical Runs.

## Events, replay, and receipts

`BellClaimed` includes ticker, prior holder/ticker, fee, timestamps, deadline,
pot, Rug state, verified price, report timestamp, band, multiplier, and pass.

`ControlCredited` includes ticker, interval bounds, raw duration, locked
multiplier, and weighted score.

`RoundSettled` includes final holder, winning ticker/score, pot, and all pools.

Replay and receipts show report, band, multiplier, interval, switch, raw
seconds, weighted points, transaction, block, chain, contract, and version.
Legacy `faction-v0` parsing is read-only behind an explicit version branch.
Devnet archives settled snapshots on the VM and keeps them across Anvil resets.
Production history must come from the canonical event indexer.

## Acceptance

Contract:

- switching, self-rejection, timer, Rug Zone, hard cap, settlement;
- valid, stale, mismatched, omitted, future, expired, replayed reports;
- exact boundaries and locked multipliers;
- aggregation, ties, rounding, refunds, conservation;
- flat mode and binary Producer Pass;
- fuzz score conservation.

Domain/integration:

- sample completeness, exclusions, ranking, ties, fallback, delay;
- signed report endpoint through wallet submission and verification;
- first claim with allowance, later switching, rewards, refunds;
- entry, bands, raid, Rug, settlement, flat, stale, and special fixtures.

Browser:

- rule understood within five seconds;
- one visible `$1` action per switch;
- band visible before submission;
- invalid data never charges;
- entry, live, Rug, final, replay, and pass fit desktop and mobile.

## Production gates

Launch remains blocked until Data Streams access and canonical mappings are
verified, economic simulation is approved, contracts are audited, eligibility
is implemented, and current legal review is complete.
