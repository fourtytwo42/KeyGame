# Saved by the Bell: Ticker Royale

> Superseded product concept: permanent ticker factions were replaced by
> ticker-per-claim Closing Print gameplay. See
> [Closing Print PRD](./prd/10-closing-print-market-reactive.md).

Status: Product concept proposed on 2026-07-28. No implementation or economic design has been approved.

Selected frontend and visual direction: [Channel 4663 UI Design](channel-4663-ui-design.md).

Implementation-facing requirements: [Saved by the Bell PRD Suite](prd/README.md).

## One-sentence pitch

Pick a Stock Token faction, pay $1 to steal the bell, and hold it when the clock reaches zero to win the main prize.

## The five-second rules

The first screen, onboarding, and every round lobby should repeat the same three instructions:

1. **Pick a bag.**
2. **Pay $1 to steal the bell.**
3. **Hold the bell at zero to win 50% of the pot.**

The ticker faction with the most total control time splits a separate 30% team bonus. This is a secondary reward, not a competing headline objective.

Every important control should pair meme language with plain language. The main action is `APE FOR THE BELL · $1`, not an unexplained `APE` button.

## What the game is

`Saved by the Bell` is the product. `Ticker Royale` is its primary game mode.

It preserves the best parts of FoMo3D:

- A visible countdown.
- One instantly understandable action.
- A leader everyone can displace.
- A growing pot.
- A dramatic final transaction.
- Public onchain settlement.

It removes the parts that are too slow, opaque, dangerous, or dated:

- No bonding-curve key sale.
- No holder-dividend mask.
- No ICO.
- No affiliate tree.
- No random airdrop.
- No native game token.
- No unlimited timer extensions.
- No intentional exit-scam framing.
- No loss of the player's locked Stock Token principal to the prize pot.

## The core loop

### 1. Pick your bag

The round offers four canonical Robinhood Stock Token factions, for example:

- `$NVDA`
- `$AAPL`
- `$TSLA`
- `$SPY`

An eligible player chooses one faction and locks a minimum value of its Stock Token. The initial concept uses a $5 entry threshold. The player cannot switch factions during that round.

The contract returns the same token amount after settlement. This preserves token principal, not its fiat value; the market price can still change while the token is locked.

### 2. Ape for the bell

The round opens with 45 seconds on the clock.

Pressing `APE`:

1. Charges a fixed $1 USDG action fee.
2. Makes the accepted caller the new bell holder.
3. Assigns the bell to that player's chosen ticker faction.
4. Ends the previous holder's control interval.
5. Adds two seconds to the timer during the normal battle phase.

The same holder cannot pay to extend their own hold. Another wallet from the same faction may take the bell, so faction cooperation and individual rivalry coexist.

### 3. Keep it cooking

Control is measured by accepted onchain time, not click count or money deposited.

Whenever the bell changes hands:

- The previous holder earns the number of seconds they controlled it.
- Those seconds are also added to their faction's control total.
- The live interface updates the faction-control bar.

This makes the main state easy to read:

- Current bell holder.
- Current ticker faction.
- Time remaining.
- Each faction's percentage of total control.
- Current pot.

### 4. Enter the Rug Zone

The round has an absolute three-minute hard end.

The last ten seconds are the `RUG ZONE`:

- Claims still transfer the bell.
- Claims no longer extend the timer.
- The action confirmation changes from `APE` to `SEND IT`.
- A bell transfer in this phase is shown as a rug.
- A transfer in the final two seconds earns the `SNIPED` result.

There is no indefinite overtime. The displayed hard end cannot move.

### 5. Settle the round

The recommended starting split is:

| Share | Recipient |
|---:|---|
| 50% | Final bell holder |
| 30% | Winning faction pool |
| 15% | Next-round seed |
| 5% | Protocol operations |

The winning faction is the faction with the most cumulative bell-control time.

Its 30% pool is distributed among that faction's players in proportion to their personal bell-control time. Action count and locked principal do not increase the payout weight.

The final holder receives the headline 50% prize regardless of which faction won the control contest. A losing faction can therefore steal the main prize without rewriting the secondary team result.

If one player is the final holder and also contributed control time to the winning faction, they receive both entitlements.

All locked Stock Tokens become withdrawable after settlement.

## Example round

1. A player locks $5 worth of the canonical NVDA Stock Token.
2. They approve $100 play USDG once; each accepted bell claim consumes $1.
3. `$NVDA` controls the bell for 42% of the round and is shown as `COOKING`.
4. `$AAPL` takes the bell with 6.8 seconds remaining.
5. A final `$NVDA` claim loses the ordering race.
6. `$AAPL` holds the bell at zero and earns the 50% main prize.
7. `$NVDA` still wins the 30% team pool because it accumulated the most control time.
8. The app produces separate `BAG SECURED` and `SNIPED AT THE BELL` receipts.

## Mobile screen

The game should fit on one primary mobile screen:

1. Round number and pot.
2. Large countdown.
3. Current bell holder and ticker.
4. One faction-control bar.
5. The instruction `HOLD THE BELL AT 0 · WIN 50%`.
6. One dominant `APE FOR THE BELL · $1` button.
7. Remaining USDG allowance or `APES LEFT`.
8. A two-line `THE TRENCHES` activity feed.

Portfolio analytics, token price charts, leaderboards, rules, and transaction history belong behind secondary views. They should not compete with the main action.

The selected visual world is `Channel 4663`, a fictional public-access market game show based on Robinhood Chain's chain ID. It uses broadcast clocks, teletext-density score strips, station identifiers, a studio-switch action, and transmission receipts instead of a conventional crypto dashboard. The complete palette, typography, layout, motion, accessibility, and Next.js decisions are defined in `docs/channel-4663-ui-design.md`.

## Comprehension rules

The product fails its usability test if a new player cannot answer these questions within five seconds:

- What do I press? `APE FOR THE BELL · $1`.
- How do I win? Hold the bell when the clock reaches zero.
- What do I win? 50% of the displayed pot.
- What does my ticker do? It is my team for the separate 30% control bonus.
- What is approved? $100 play USDG, refreshed only with wallet confirmation when allowance is below $10.

Slang should confirm an event after the plain-language rule is already clear:

- `RUGGED` is paired with `@name stole your bell`.
- `COOKING` is paired with `leads faction control`.
- `SNIPED` is paired with `bell stolen with 0.7s left`.
- `BAG SECURED` is paired with the exact prize won.

## Meme language

Each term has one stable semantic job:

| Term | Game meaning |
|---|---|
| `BAG` | The ticker faction selected for the round |
| `APE` | Pay the fixed fee and attempt to claim the bell |
| `COOKING` | A ticker is building meaningful control momentum |
| `RUGGED` | A player lost the bell to another accepted claim |
| `COOKED` | A player or faction is losing badly |
| `RUG ZONE` | The non-extendable final ten seconds |
| `SNIPED` | The bell was stolen in the final two seconds |
| `BAG SECURED` | A winning result |
| `THE TRENCHES` | The live activity feed |
| `SEND IT` | The final-phase claim confirmation |

Slang should describe game events, not contract behavior. Official copy should not imply that the protocol can steal deposits or refuse withdrawals.

## The share loop

Every notable event can generate a deterministic vertical receipt:

- `YOU GOT RUGGED`
- `LET HIM COOK`
- `COMEBACK OF THE ROUND`
- `SNIPED WITH 0.7S LEFT`
- `BAG SECURED`
- `ABSOLUTELY COOKED`

A receipt contains:

- Ticker and faction mascot.
- Player display name or shortened address.
- Round number.
- Hold time.
- Final control percentage.
- Pot or prize amount.
- A replay link with the exact onchain event sequence.

Raid links may recruit players into a faction, but they should not pay referral commissions.

## How Stock Tokens matter

The Stock Tokens are not merely decorative names.

They provide:

- The faction membership asset.
- Proof that the player holds the bag they represent.
- Recognizable communities and rivalries.
- An asset returned after the short lock period.
- A rotating roster for themed rounds, earnings events, and market narratives.

The underlying price should not determine a three-minute winner. That would add oracle latency, market-hours problems, manipulation concerns, and confusing rules. Price feeds should initially be used only to:

- Verify the minimum entry value.
- Display the locked bag's current value.
- Handle supported-asset status.

The game must use Robinhood's canonical registry rather than accepting arbitrary ticker-named ERC-20 tokens.

## One-tap transaction experience

The game will not retain low-attention traders if every ape requires a wallet popup.

The intended flow is:

1. Connect or create a smart account.
2. Select the ticker.
3. Approve $100 play USDG if the current allowance is below $10.
4. Make subsequent actions with one tap while allowance is sufficient.
5. Ask for a new $100 approval only after allowance drops below $10.
6. Show remaining allowance and round spend in the session panel.
7. Let the player reject, change, or revoke approval in the wallet.

The entry screen therefore presents one choice, `YOUR BAG`, followed by `ENTER ROUND`. Approval remains a wallet-owned decision and is never silently increased.

Gas sponsorship or USDG-denominated gas abstraction should be evaluated so the player sees one comprehensible action price.

## Fairness and abuse boundary

The design can reduce automation advantages but cannot honestly promise to eliminate bots or Sybil wallets.

Initial controls should include:

- No self-extension by the current holder.
- At most one accepted claim per wallet per block.
- A visible hard end.
- First-accepted onchain ordering.
- Explicit transaction rejection when the round has ended.
- A session spending cap chosen by the user.
- Complete post-round replay from contract events.

Deposited principal and action fees must be accounted for separately.

## Launch ladder

### Stage 1: Testnet points

- Synthetic ticker factions.
- Sponsored gas.
- No transferable prizes.
- Validate comprehension, latency, replay accuracy, and retention.

### Stage 2: Sponsor-funded USDG

- Real ticker themes and price displays.
- Sponsor-funded pot.
- Free or limited actions.
- No Stock Token custody requirement.

### Stage 3: Eligible Stock Token mode

- Canonical Stock Token lock for faction entry.
- USDG action fees and prizes.
- Eligibility and jurisdiction controls designed with product counsel.
- Independent smart-contract review before value-bearing launch.

## The intended feeling

This should feel like watching a final-seconds sports possession, not managing a DeFi position.

The player makes one choice, sees one clock, understands one button, and immediately knows whether they are cooking, got rugged, or secured the bag.
