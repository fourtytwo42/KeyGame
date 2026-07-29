# PRD 01: Product Requirements

Status: Stage 0 implementation baseline approved. The first public MVP is
Robinhood Chain testnet points; value-bearing stages remain gated.

## Product summary

`Last Bell: Ticker Royale` is a short, mobile-first onchain game in which players choose a ticker faction and compete to hold a public bell when a visible countdown reaches zero.

The headline rule is:

> Pick a bag. Pay $1 to steal the bell. Hold it at zero to win 50%.

The faction with the most cumulative control time splits a separate 30% bonus. The product borrows FoMo3D's countdown tension and public last-action drama without reproducing its key curve, dividend accounting, unlimited overtime, misleading exit-scam framing, or historical vulnerabilities.

## Problem

Most DeFi interfaces require too much context before a user can act, while many onchain games hide simple economic behavior behind token emissions, large rule sets, or casino presentation.

Last Bell must create:

- A win condition understood in five seconds.
- A round short enough for a meme trader's attention window.
- A meaningful onchain action with visible ordering.
- A social faction identity connected to Stock Tokens.
- A result worth sharing whether the player won or got rugged.
- A transparent, revocable play-token allowance and public replay.

## Product hypothesis

If a trader can understand the game from one clock and one $1 action, then a three-minute maximum round with ticker factions and meme receipts can create more repeat play and social sharing than a conventional DeFi position-management experience.

## Target users

### Meme trader

Wants immediate stakes, fast feedback, visible rivalry, and a reason to post the result.

Jobs:

- Enter without reading a whitepaper.
- Know the exact cost of another attempt.
- See whether the action was accepted.
- Win or lose within minutes.
- Run it back instantly.

### Stock Token holder

Wants to represent a familiar ticker and make the holding socially meaningful without risking the deposited token amount to the prize pot.

Jobs:

- Prove membership in a ticker faction.
- Retain exposure to the selected Stock Token.
- Withdraw the same token quantity after settlement.

### Spectator or raider

Arrives through a receipt or faction link and may not have connected a wallet.

Jobs:

- Understand the live state without connecting.
- Watch the final seconds.
- Open a deterministic replay.
- Join the next round with minimal setup.

### Operator

Needs transparent round scheduling, supported-asset controls, incident visibility, replay evidence, and no ability to rewrite a live outcome.

## Goals

| ID | Goal |
|---|---|
| `PRD-001` | A first-time visitor can state the action cost, primary win condition, and current holder within five seconds. |
| `PRD-002` | A funded participant can enter with one reusable $100 play-USDG approval and make later round actions with one tap; approval is requested again only below a $10 allowance threshold. |
| `PRD-003` | Every accepted state transition is reconstructible from public events. |
| `PRD-004` | The player can inspect the remaining USDG allowance or equivalent number of actions in the session panel. |
| `PRD-005` | Every round ends no later than its published hard end. |
| `PRD-006` | The main mobile arena remains usable at 320 CSS pixels. |
| `PRD-007` | Wins, losses, rugs, snipes, and comebacks produce deterministic share receipts. |
| `PRD-008` | Spectators can view the arena, results, and replay without a wallet. |
| `PRD-009` | Stock Token principal and action-fee accounting are visibly and technically separate. |
| `PRD-010` | No privileged actor can change a live round's fee, payout split, factions, timer constants, or winner. |

## Non-goals

| ID | Exclusion |
|---|---|
| `PRD-OUT-001` | A native Last Bell token. |
| `PRD-OUT-002` | ICO, bonding curve, key sale, or key-holder dividend system. |
| `PRD-OUT-003` | Affiliate commissions or monetary referral tree. |
| `PRD-OUT-004` | Random airdrop or block-derived lottery. |
| `PRD-OUT-005` | Stock-price prediction determining a three-minute winner. |
| `PRD-OUT-006` | Unlimited timer extensions or an indefinite round. |
| `PRD-OUT-007` | A general-purpose trading terminal, portfolio manager, or exchange. |
| `PRD-OUT-008` | Claims that a Stock Token grants equity ownership in the underlying company. |
| `PRD-OUT-009` | Claims that bots, Sybil wallets, latency advantages, or sequencer risk are eliminated. |
| `PRD-OUT-010` | Real-money launch without legal, eligibility, security, operational, and economic gates. |

## Product principles

### Literal before meme

Slang decorates an already-understood event:

- `RUGGED` must include who stole the bell.
- `COOKING` must include why the faction leads.
- `BAG SECURED` must include the exact result.

### One primary winner

The final holder is the headline winner. The faction pool is visibly secondary.

### Explicit reusable allowance

The player approves $100 of play USDG once. Each accepted action consumes $1. When the allowance falls below $10, the next action asks the player to refresh it to $100. The player may reject, change, or revoke the approval through the wallet.

### Public truth

Accepted chain events, not optimistic animation or server state, determine the holder, timer, control totals, pot, and result.

### Strange appearance, ordinary comprehension

Channel 4663 may be visually unconventional. The action label, cost, remaining budget, countdown, and win condition must remain conventional and explicit.

### Principal is not prize

If Stock Token entry is enabled, the deposited token amount is not used to fund the winner pool. This does not guarantee its fiat value.

## MVP scope

### MVP-0: Product shell and deterministic simulator

- Next.js Channel 4663 lobby, arena, Rug Zone, final, receipt, and replay views.
- Deterministic local round simulator.
- Synthetic ticker factions.
- Wallet-free spectator experience.
- Responsive and accessibility validation.

### MVP-1: Robinhood Chain testnet

- Testnet round contract.
- Points or non-transferable test rewards.
- Faucet-issued or non-transferable test action units mirroring the $1 production interaction.
- Sponsored test gas.
- Reusable $100 play-USDG approval with a $10 refresh threshold and explicit revocation.
- Live event ingestion and replay.
- No canonical Stock Token custody.
- No player-funded prize.

### Gated later stages

- Sponsor-funded USDG.
- Player-paid $1 USDG claims.
- Canonical Stock Token entry.
- Eligibility attestation.
- Value-bearing settlement.

## Core product requirements

| ID | Requirement | Priority |
|---|---|---|
| `PRD-011` | The first arena viewport must show the rule, pot, countdown, holder, ticker, and action price; remaining allowance is available in the session panel. | P0 |
| `PRD-012` | The user must be able to choose one of exactly four factions offered by the round. | P0 |
| `PRD-013` | A user's faction cannot change after the round entry is accepted. | P0 |
| `PRD-014` | The action control must show `APE FOR THE BELL` and the exact charge before submission. | P0 |
| `PRD-015` | Submitted, accepted, rejected, replaced, rugged, ended, and network-degraded states must be visually distinct. | P0 |
| `PRD-016` | The interface must not present the player as holder until the accepted event is observed. | P0 |
| `PRD-017` | The final results view must show the final-holder result before the faction result. | P0 |
| `PRD-018` | A round replay must reconstruct accepted claims in canonical order. | P0 |
| `PRD-019` | The receipt must link to that exact round replay. | P0 |
| `PRD-020` | Failed or expired actions must state whether the $1 game fee was charged; network gas must be explained separately if applicable. | P0 |
| `PRD-021` | Spectator views must not request a wallet connection automatically. | P1 |
| `PRD-022` | A raid link may preselect a faction for the next round but must not create a monetary referral reward. | P1 |
| `PRD-023` | Sound must remain off until the user enables it. | P1 |
| `PRD-024` | Results and replay pages must be server-renderable for link previews and discovery. | P1 |
| `PRD-025` | The system must expose round configuration and contract addresses in a human-readable rules view. | P1 |

## Product success criteria

The testnet MVP is ready for a limited pilot when:

- At least 85% of moderated first-time testers answer the five comprehension questions correctly without coaching.
- At least 95% of observed accepted claims appear in the correct UI order during load testing.
- The user never sees a false accepted-holder state in end-to-end tests.
- At least 90% of test participants can explain the reusable allowance, $1 consumption, refresh threshold, and revocation.
- All P0 acceptance tests in PRD 06 pass.

Retention and sharing targets are hypotheses, not launch blockers, and are defined in PRD 06.

## Dependencies

- Exact round and settlement rules in PRD 02.
- Channel 4663 experience requirements in PRD 03.
- Contract, session, event, and frontend architecture in PRD 04.
- Launch gates in PRD 05.
- Instrumentation and release tests in PRD 06.

## Open product decisions

| ID | Decision needed |
|---|---|
| `PRD-OPEN-001` | Explicitly approve the 50/30/15/5 production payout split. |
| `PRD-OPEN-002` | Approve $5 as the minimum Stock Token entry value. |
| `PRD-OPEN-004` | Decide when actual Stock Token locking enters scope. |
| `PRD-OPEN-005` | Select eligible jurisdictions and identity or attestation requirements. |
| `PRD-OPEN-006` | Decide whether same-faction players may steal the bell from one another; current proposal allows it. |

## Resolved product decisions

| ID | Resolution |
|---|---|
| `PRD-OPEN-003` | Resolved 2026-07-28: the first public MVP is Robinhood Chain testnet points after the Stage 0 shell and simulator. Sponsor-funded USDG remains Stage 2 gated scope. |
