# FoMo3D and “The Key” Game: Complete Logic Research

**Research date:** 2026-07-28  
**Scope:** The original 2018 Ethereum FoMo3D contracts and their game logic, not later projects reusing the FoMo3D name.

## Executive summary

FoMo3D was an Ethereum last-buyer game built by Team JUST. Players sent ETH to buy non-transferable, round-specific accounting units called **keys**. Buying keys distributed most of the ETH immediately among existing key holders, an affiliate, external recipients, a side airdrop pot, and the round jackpot. A purchase that created at least one whole key also made that buyer the current leader and extended the countdown. When the timer expired, the current leader received 48% of the recorded round pot.

It was not a conventional investment or an ERC-20 token sale:

- Keys could not be transferred, sold, or redeemed for principal.
- Returns came from later purchases, referrals, the side airdrop, or being the final qualifying buyer.
- The displayed jackpot was only one accounting pool. Affiliate balances, dividend balances, and the airdrop pot were separate liabilities.
- A round did not settle automatically when its timer reached zero. A later Ethereum transaction had to execute the settlement code.
- A sub-key purchase still participated economically, but it did not extend the timer or replace the leader.

The canonical, source-verified editions reconstructed here are:

1. **FoMo3D Long**, the well-known hour/day-scale game at [`0xA62142888ABa8370742bE823c1782D17A0389Da1`](https://etherscan.io/address/0xa62142888aba8370742be823c1782d17a0389da1#code).
2. **FoMo3D Soon**, a source-verified original short-cycle edition at [`0x4e8ecF79AdE5e2C49B9e30D795517A81e0Bf00B8`](https://etherscan.io/address/0x4e8ecf79ade5e2c49b9e30d795517a81e0bf00b8#code). Secondary accounts sometimes use “quick,” “fast,” and “soon” loosely; this document uses the deployed contract names to avoid conflating separate addresses.

Long also points on-chain to a separate official contract at [`0xF9bA0955b0509AC6138908cCc50d5Bd296E48D7D`](https://etherscan.io/address/0xf9ba0955b0509ac6138908ccc50d5bd296e48d7d). Last verified 2026-07-28, Long storage slot 0 contains that Fast address, and Fast storage slot 0 points back to Long. Etherscan currently labels it “FoMo3D Fast,” but its source is not verified there. This document therefore does not pretend that its complete internal logic can be recovered with the same confidence as the verified Long and Soon contracts.

This is historical and technical research, not an endorsement. A production adaptation involving real money would need current legal review, security redesign, transparent odds, and safer randomness.

## Source and confidence model

The reconstruction uses the following priority:

1. Verified deployed contract source and deployed bytecode/storage.
2. Original or contemporary Team JUST descriptions.
3. Contemporary independent code analysis.
4. Transaction-level postmortems of the first Long round.

The main source set is:

- [Verified FoMo3D Long source on Etherscan](https://etherscan.io/address/0xa62142888aba8370742be823c1782d17a0389da1#code), version `FoMo-3D v0.7.1`, Solidity 0.4.24.
- [Readable mirror of the verified Long source](https://gist.github.com/hayeah/20a1fa15d5f24c293e9961187f357dde).
- [Verified FoMo3D Soon source on Etherscan](https://etherscan.io/address/0x4e8ecf79ade5e2c49b9e30d795517a81e0bf00b8#code), Solidity 0.4.24.
- [FoMo3D Soon source and compiler metadata on Blockscout](https://eth.blockscout.com/api/v2/smart-contracts/0x4e8ecf79ade5e2c49b9e30d795517a81e0bf00b8).
- [Original Team JUST announcement thread](https://bitcointalk.org/index.php?topic=4706983.0).
- [Contemporary Soon rules discussion](https://bitcointalk.org/index.php?topic=4604958.60).
- [Contemporary contract-level analysis and fee tables](https://cloud.tencent.com/developer/article/1413232).
- [SECBIT’s transaction-level analysis of the first-round win](https://secbit.io/blog/en/2018/08/23/how-the-winner-got-fomo3d-prize-a-detailed-explanation/).
- [Independent block-stuffing reconstruction](https://solmaz.io/2018/10/18/anatomy-block-stuffing/).
- [Quantstamp’s analysis of the airdrop exploit](https://medium.com/quantstamp/what-we-learned-from-fomo3d-part-1-2c316db3d1e1).

Modern sites at the old product name are excluded unless independently tied to the original deployed contracts. A current site, fork, or clone is not evidence of the 2018 rules.

## Contract and dependency map

| Component | Address | Role |
|---|---|---|
| FoMo3D Long | `0xA62142888ABa8370742bE823c1782D17A0389Da1` | Long-round game and canonical first-round jackpot |
| FoMo3D Soon | `0x4e8ecF79AdE5e2C49B9e30D795517A81e0Bf00B8` | Verified short-cycle game with a 60-second ICO phase |
| Linked FoMo3D Fast | `0xF9bA0955b0509AC6138908cCc50d5Bd296E48D7D` | Long’s configured 1% cross-game pot recipient; source currently unverified |
| PlayerBook | External contract | Assigns player IDs, names, and affiliate-name lookups |
| Divies/P3D | External contract | Receives the fee labeled “P3D” or dividend-token share |
| Community forwarder | External contract | Receives the community share |
| External settings | [`0x32967D6c142c2F38AB39235994e2DDF11c37d590`](https://etherscan.io/address/0x32967d6c142c2f38ab39235994e2ddf11c37d590) | One-time Long/Fast timing configuration used during deployment |

Long’s deployed settings resolve to:

- Long extra delay: 15 seconds
- Long inter-round gap: 3,600 seconds
- Fast extra: 120 seconds
- Fast gap: 60 seconds

The games were not entirely self-contained. Player identity, name resolution, some outgoing distributions, and Long’s 1% pot swap depended on other deployed contracts.

## Core state model

### Player state

Each player is identified by a numeric PlayerBook ID and has:

- Ethereum address
- Optional registered name
- `win` vault: round-winner and airdrop prizes
- `gen` vault: general key-holder dividends and refunded/unspent value
- `aff` vault: affiliate rewards
- Last round played
- Last valid affiliate

Per round, the player also has:

- Effective ETH contributed
- Key balance
- Dividend-mask correction
- In Soon, unconverted ICO contribution fields

### Round state

Each round records:

- Current leader’s player ID
- Current leader’s selected team
- Start and end timestamps
- Ended flag
- Total keys
- Effective ETH accepted
- Pot balance
- Global dividend mask
- Team-by-team ETH totals
- In Soon, ICO ETH, ICO-generated dividends, and the final average ICO key price

### Keys are internal accounting units

Keys use 18 decimal places, but they are not ERC-20 tokens:

- They exist only inside a specific game round.
- They cannot be transferred.
- They cannot be sold back.
- They cannot be redeemed for the ETH used to buy them.
- They earn only distributions assigned to round key holders.

The source contains ETH/key quote functions, but there is no sell path. The reverse-looking math is pricing support, not a redemption promise.

## Common player actions

Both verified editions expose the same broad actions:

- Buy with an affiliate expressed as a player ID.
- Buy with an affiliate address.
- Buy with an affiliate name.
- Reload: spend funds already present in the player’s vaults.
- Withdraw: crystallize pending key dividends and transfer the sum of the player’s vaults.
- Register a name, with or without an accompanying purchase.
- Call the payable fallback, which performs an emergency/default buy.
- Call the payable `potSwap()` entry point, which credits ETH directly to the next round’s pot.
- Read current round, player, vault, time, and price information.

The payable fallback reuses the player’s last valid affiliate and selects **Sneks** as the team.

`potSwap()` is not restricted to the companion game. Any address can donate ETH to `round[current + 1].pot`; it mints no keys and creates no player credit.

### Transaction limits

The public entry points in both verified editions enforce:

- Minimum: 1 gwei
- Maximum: 100,000 ETH

Long then applies a stricter internal **greater than** 1 gwei test. Consequently, an exact 1 gwei Long buy can pass the outer check yet fail to create keys or receive an accounting credit; its value becomes unassigned contract balance. An exact 1 gwei Long reload similarly deducts the amount from the available vault total without processing it as a purchase. Soon does not repeat this stricter internal test and processes an exact 1 gwei input.

### Human-only restrictions

Long uses an `extcodesize(msg.sender) == 0` check. That rejects ordinary calls from deployed contracts and contract wallets but can be bypassed by calling during a contract’s constructor, because the constructor address has no runtime code yet.

Soon adds `msg.sender == tx.origin` to the empty-code check. That closes the constructor-call route used against Long, but it also excludes all smart-contract wallets and is not a general security primitive.

### Player names and affiliates

A name is not required to buy. First interaction can assign a player ID without a name.

PlayerBook names are normalized to lowercase and validated. The name filter allows letters, numbers, and spaces, with a length limit of 32 characters. It rejects leading/trailing spaces, consecutive spaces, numeric-only names, and names beginning with `0x`.

An affiliate reward is paid only when the resolved affiliate:

- Is a real player with a registered name, and
- Is not the buyer.

If the affiliate is missing, unnamed, invalid, or self-referring, the nominal affiliate share is sent to the P3D/Divies route instead. A valid affiliate becomes the buyer’s remembered affiliate for fallback buys.

## The four teams

The buyer chooses one of four teams on every purchase:

| Team ID | Name |
|---:|---|
| 0 | Whales |
| 1 | Bears |
| 2 | Sneks |
| 3 | Bulls |

The team is selected per transaction, not permanently assigned to the player. An invalid team ID falls back to Sneks. The source also compares the unsigned team value with zero; that branch can never be true and has no practical effect.

Team choice controls two different tables:

1. How the current purchase is distributed.
2. How the pot is distributed if that purchase leaves the buyer as final leader.

## Key pricing

The contracts implement bonding-curve-style cumulative price functions. A purchase receives the difference between the key total implied by all prior accepted ETH plus the new ETH and the key total implied by prior accepted ETH.

In other words:

```text
new keys = keys(total round ETH + effective purchase ETH)
           - keys(total round ETH)
```

This makes the marginal price rise as the round accumulates ETH.

### Long exact curve

Let `K` be the key amount in 18-decimal fixed-point units. The cumulative Long cost in wei is:

```text
E_long(K) =
  [78,125,000 × K²
   + (149,999,843,750,000 × K × 10¹⁸) / 2]
  / (10¹⁸)²
```

If `k` is a whole-key count, the same curve in ETH is:

```text
E_long(k) =
  0.000074999921875 × k
  + 0.000000000078125 × k²
```

Therefore:

- The first whole key costs exactly 0.000075 ETH.
- After `k` whole keys exist, the approximate marginal cost of the next whole key is:

```text
0.000075 + 0.00000000015625 × k ETH
```

The Solidity inverse used to derive keys from ETH is:

```text
keys(eth) =
  (
    sqrt(
      eth × 10¹⁸ × 312,500,000,000,000,000,000,000,000
      + 5,624,988,281,256,103,515,625,000,000,000,000,000,
        000,000,000,000,000,000,000,000,000
    )
    - 74,999,921,875,000,000,000,000,000,000,000
  )
  / 156,250,000
```

Integer arithmetic floors intermediate results. A faithful implementation must reproduce the Solidity order of operations and flooring, not just evaluate a floating-point approximation.

### Soon exact curve

FoMo3D Soon uses a deliberately much steeper “Fast” curve:

```text
E_soon(K) =
  [50,000,000,000,000 × K²
   + (100,000,000,000,000 × K × 10¹⁸) / 2]
  / (10¹⁸)² wei
```

For whole keys:

```text
E_soon(k) = 0.00005 × k² + 0.00005 × k ETH
```

Therefore:

- The first key costs 0.0001 ETH.
- After `k` whole keys exist, the next whole key costs approximately:

```text
0.0001 × (k + 1) ETH
```

Soon’s inverse is:

```text
keys(eth) =
  (
    sqrt(
      eth × 10¹⁸ × 200,000,000,000,000,000,000,000,000,000,000
      + 2,500,000,000,000,000,000,000,000,000,000,000,000,
        000,000,000,000,000,000,000,000,000,000,000
    )
    - 50,000,000,000,000,000,000,000,000,000,000
  )
  / 100,000,000,000,000
```

## FoMo3D Long: complete round logic

### Timing

Long’s timing constants are:

| Parameter | Value |
|---|---:|
| First activation delay | 15 seconds |
| Frozen inter-round gap | 1 hour |
| Initial playable countdown | 1 hour |
| Extension per whole key | 30 seconds |
| Maximum remaining countdown | 24 hours |

The first round is initialized with a timestamp offset so that activation makes it playable after the 15-second extra delay. Later rounds are created with:

```text
round.start = settlement time
round.end   = settlement time + 1-hour gap + 1-hour initial timer
```

Purchases are disabled until:

```text
now > round.start + 1 hour
```

The practical result is a one-hour frozen gap followed by a one-hour playable countdown.

### What extends the timer

Fractional keys exist, but timer and leadership logic use the number of **whole** keys created by the purchase:

```text
whole keys = floor(new fixed-point keys / 10¹⁸)
```

If at least one whole key is created:

- The buyer becomes the leader.
- The buyer’s team becomes the round’s current winner team.
- The end time is extended by 30 seconds for each whole key.
- The resulting end time is capped at `now + 24 hours`.

Conceptually:

```text
candidate end = old end + whole keys × 30 seconds
new end       = min(candidate end, now + 24 hours)
```

If there has never been a whole-key leader and the nominal timer is already past, the code uses the current timestamp as its extension base. This lets the first qualifying purchase revive an otherwise dormant leaderless round.

A purchase that creates less than one whole key still:

- Receives fractional keys.
- Contributes to the pot and external allocations.
- Pays existing key holders.
- May qualify for the airdrop.

It does **not** change the leader or end time.

### Early-round per-player cap

While the round’s effective ETH total is below 100 ETH, each player may contribute at most 1 ETH of effective round ETH.

If a purchase would take that player over the 1 ETH limit:

- Only the remaining amount up to 1 ETH is processed as the purchase.
- The excess is credited to the player’s general vault.

Once the round has reached 100 ETH, the cap no longer applies.

The airdrop check and all purchase distributions operate on the effective post-cap amount, not the original transaction value.

### Purchase distribution

Every effective Long purchase has the following fixed 14% allocation:

| Destination | Share |
|---|---:|
| Valid affiliate | 10% |
| Community forwarder | 2% |
| Linked FoMo3D Fast next pot through `potSwap()` | 1% |
| Airdrop side pot | 1% |

The remaining 86% is divided according to the selected team:

| Team | Existing round keys | P3D/Divies | Current pot |
|---|---:|---:|---:|
| Whales | 30% | 6% | 50% |
| Bears | 43% | 0% | 43% |
| Sneks | 56% | 10% | 20% |
| Bulls | 43% | 8% | 35% |

Each row plus the fixed 14% equals 100%.

If the affiliate is invalid, its 10% is assigned to the P3D allocation. If the low-level community-forwarding call fails, its 2% is intended to be rerouted to P3D. There is a combined-failure bug: the invalid-affiliate branch uses assignment rather than addition, so it overwrites a previously staged 2% community fallback. When both conditions occur, the affiliate 10% reaches P3D but the failed 2% community share remains as unassigned contract balance. The direct P3D deposit and linked Fast `potSwap()` are external calls whose failure can revert the purchase.

### Dividend-mask accounting

The “existing round keys” share is distributed with a cumulative profit-per-key mask:

1. Add the new keys to the round’s total key supply.
2. Divide the purchase’s key-holder allocation by total keys at 18-decimal precision.
3. Add that profit-per-key amount to the round’s global mask.
4. Add a correction to the buyer’s personal mask so the keys just purchased do not earn the dividend created by their own purchase.
5. Move division dust into the pot.

The buyer’s keys held before this purchase still receive their proportional dividend. Only newly created keys are excluded from self-paying on that transaction.

Pending unmasked earnings are:

```text
pending general earnings =
  round global mask × player round keys / 10¹⁸
  - player round mask
```

Before another buy, reload, or withdrawal, the contract crystallizes this pending amount into the player’s `gen` vault and updates the personal mask.

### Airdrop side game

One percent of every effective purchase is added to a global airdrop pot.

Only an effective purchase of at least 0.1 ETH:

- Increments the airdrop tracker.
- Performs an airdrop draw.

The tracker increments before the test. The contract constructs a deterministic seed from block and transaction values including:

- Timestamp
- Difficulty
- Miner/coinbase
- Gas limit
- Sender
- Block number

The purchase wins if:

```text
seed mod 1000 < airdrop tracker
```

Under an ideal uniform-seed assumption, each qualifying purchase adds 0.1 percentage point to the next draw:

```text
nominal chance = tracker / 1000
```

At a tracker value of 1,000 or more, the comparison is necessarily true. A win resets the tracker to zero.

The winner receives a percentage of the airdrop pot based on that qualifying purchase:

| Effective qualifying purchase | Airdrop-pot award |
|---|---:|
| 0.1 ETH to less than 1 ETH | 25% |
| 1 ETH to less than 10 ETH | 50% |
| 10 ETH or more | 75% |

The award is credited to the player’s `win` vault. The remainder stays in the airdrop pot.

Long has an event-encoding bug in the lowest tier: the paid amount is correctly 25%, but the emitted tier marker duplicates the top-tier marker. The money calculation is unaffected.

This randomness was exploitable. Because the seed was predictable and Long’s human check could be bypassed from a contract constructor, attackers could deploy only when the next transaction was guaranteed to satisfy the draw. [Quantstamp’s reconstruction](https://medium.com/quantstamp/what-we-learned-from-fomo3d-part-1-2c316db3d1e1) documents that path. This attacked the side airdrop, not the main end-of-round pot.

### Long purchase state machine

In simplified form:

```text
BUY(value, affiliate, team):
  require game activated
  require playable inter-round gap has passed
  require sender appears human
  require 1 gwei <= value <= 100,000 ETH

  assign or recover player ID
  crystallize player's pending key dividends

  if now <= current round end OR no whole-key leader exists:
      apply early-round player cap
      mint fractional keys from effective ETH
      if floor(new keys) >= 1:
          extend timer
          replace leader and leader team
      if effective ETH >= 0.1:
          increment and test airdrop
      allocate affiliate, community, Fast, airdrop,
        key-holder, P3D, and pot shares
      record player, round, and per-team totals
  else:
      settle expired round
      credit the entire attempted purchase to player's general vault
      do not buy keys in the new round
```

That last branch is important: the transaction that discovers an expired Long round does not automatically enter the next round. The player must wait through the next frozen gap and then reload or send another buy.

### Settlement is transaction-driven

Ethereum does not wake a contract when a timestamp passes. Long settles only when a later:

- Buy,
- Reload, or
- Withdrawal

executes the expired-round check.

The round is settled only if it has a leader. A leaderless expired round remains available for a first whole-key purchase.

### End-of-round pot distribution

The current leader receives 48% of the recorded round pot. The community allocation is 2%. The leader’s most recent team selects the remainder:

| Final leader team | Winner | Community | All round keys | P3D/Divies | Next round pot |
|---|---:|---:|---:|---:|---:|
| Whales | 48% | 2% | 15% | 10% | 25% |
| Bears | 48% | 2% | 25% | 0% | 25% |
| Sneks | 48% | 2% | 20% | 20% | 10% |
| Bulls | 48% | 2% | 30% | 10% | 10% |

The key-holder end distribution uses the same global-mask mechanism. Integer division dust is added to the next-round pot.

The winner receives 48% of `round.pot`, not 48% of the entire ETH balance at the contract. The balance also backs player vaults, unwithdrawn dividends, the airdrop pot, and other accounting.

The new round inherits its next-pot allocation and begins its one-hour frozen gap.

### Reload and withdrawal

Withdrawal:

1. If the round is expired and eligible, settle it.
2. Crystallize the player’s unmasked key dividends.
3. Sum `win + gen + aff`.
4. Zero the three vault balances before transfer.
5. Transfer ETH to the player address.

Reload:

1. If needed, settle and crystallize earnings.
2. Sum the player’s available vault value.
3. Require the requested reload amount to be available and within limits.
4. Zero/adjust vault accounting.
5. Process the requested amount as a new buy when the round is playable.
6. Leave unused available value in the general vault.

No key principal is returned by either path.

## FoMo3D Soon: complete differences

Soon retains the same player-vault model, team selection, purchase allocation table, end-pot allocation table, affiliate rules, airdrop percentages, and normal-purchase dividend mask. Its price curve, timing, opening ICO, and rollover behavior differ.

### Soon timing

| Parameter | Value |
|---|---:|
| ICO/opening phase | 60 seconds |
| Initial post-ICO countdown | 5 minutes |
| Extension per whole key | 5 minutes |
| Maximum remaining countdown | 5 minutes |

A newly initialized round ends six minutes after initialization:

```text
60-second ICO + 5-minute normal countdown
```

During normal play, one whole key is enough to drive the timer to the cap:

```text
new end = min(old end + whole keys × 5 minutes, now + 5 minutes)
```

Thus any normal purchase creating at least one whole key effectively resets the countdown to five minutes from the current block timestamp. A fractional-only purchase does not.

### The 60-second ICO

Every Soon round begins with a one-minute pooled opening phase. “ICO” here is contract terminology; it does not create a transferable token.

During the ICO:

- ETH contributions are pooled.
- Normal key-holder shares accumulate in an `icoGen` pool.
- Pot, affiliate, community, P3D, and airdrop allocations are recorded.
- The 1% airdrop contribution is collected, but no airdrop draw is run.
- The leader/team can update when the contribution’s marginal curve amount represents at least one whole key, or when no leader exists.

At the end of the ICO, all ICO participants receive the same final average key price:

```text
total ICO keys = keys(total ICO ETH)

average price =
  total ICO ETH × 10¹⁸ / total ICO keys

player ICO keys =
  player ICO ETH × 10¹⁸ / average price
```

This conversion is lazy:

- The first post-ICO normal purchase calls the round-level ICO conversion.
- A player’s individual ICO allocation is added to their round balance when that player next participates.
- View/helper calculations still include the unconverted entitlement.
- If the round expires without a normal post-ICO purchase, settlement first performs the ICO conversion.

The pooled ICO general dividend is distributed across all ICO keys. Unlike an ordinary purchase, an ICO participant’s pro-rata keys share the ICO-generated dividend pool that includes their own contribution.

### Soon rollover behavior

At the start of each buy or reload, Soon checks whether the old round is expired. If so, it:

1. Settles the old round.
2. Increments the round ID.
3. Initializes the new six-minute round.
4. Continues the same transaction into the new round’s ICO.

This differs from Long. An expiry-discovering Soon purchase can become a contribution to the new round immediately; Long credits that attempted purchase to the general vault instead.

### Soon purchase allocations

Normal and ICO purchases use the same economic percentage tables shown for Long.

One implementation detail differs from the Long cross-game behavior: Soon’s source labels a 1% variable as the “long” share, but the deployed verified code adds that amount to **Soon’s own next-round pot** instead of calling another contract. The code behavior, not the comment or variable name, is authoritative.

Soon also exposes `potSwap()` so another configured game can credit its next-round pot.

### Soon airdrop and human check

Normal post-ICO purchases use the same:

- 1% side-pot contribution,
- 0.1 ETH qualifying threshold,
- Tracker increment,
- Modulo-1000 test, and
- 25%/50%/75% prize tiers.

ICO contributions do not trigger draws.

Soon’s `tx.origin` requirement blocks the Long constructor-based contract exploit, although its block-derived randomness is still unsuitable for a modern secure game.

### No Long-style early contribution cap

Soon does not apply Long’s “1 ETH per player until the round reaches 100 ETH” cap.

## Exact definition of the winner

The winner is not necessarily:

- The last transaction sender.
- The last address to buy any fractional amount.
- The last person whose transaction was seen by a website.

The winner is the player ID currently stored as round leader when settlement executes. The leader changes only when a purchase satisfies that edition’s leadership condition, normally creation of at least one whole key.

For Long, the leader’s team at that last qualifying purchase selects the final-pot split table.

## First Long round and the block-stuffing win

FoMo3D Long’s first major round ended in August 2018. The winner received approximately **10,469.66 ETH**, visible in the [winning withdrawal transaction](https://etherscan.io/tx/0xe08a519c03cb0aed0e04b33104112d65fa1d3a48cd3aeab65f047b2abce9d508).

The win was not simply a user waiting for a quiet timer. The winning operation:

1. Became the last qualifying key buyer.
2. Sent transactions through an attack contract that consumed nearly the full block gas limit and intentionally failed late.
3. Offered miners economically attractive fees to include those transactions.
4. Repeated the technique across the countdown window, making competing key transactions difficult to include before expiry.
5. Allowed a later transaction to settle and withdraw the winner’s vault.

[SECBIT’s block-by-block reconstruction](https://secbit.io/blog/en/2018/08/23/how-the-winner-got-fomo3d-prize-a-detailed-explanation/) identifies the last key activity and the sequence of stuffed blocks. [Serhat Solmaz’s analysis](https://solmaz.io/2018/10/18/anatomy-block-stuffing/) estimates about 175 seconds of blockage and explains the economics of filling an approximately 8 million gas block.

This was an incentive and transaction-inclusion failure:

- Contract time used block timestamps, but completion depended on transaction inclusion.
- A visible pending purchase was not guaranteed to be mined before expiry.
- High-fee, high-gas transactions could crowd out honest buys.
- No privileged contract call was required to become final leader.

A faithful clone would reproduce this failure surface. A modern redesign should not.

## Edge cases, bugs, and non-obvious behavior

### Economic and state-machine edge cases

- Keys are fractional, but timer control is whole-key gated.
- The key curve uses integer flooring at several stages.
- A qualifying buyer’s new keys do not receive that same normal purchase’s general dividend.
- Previously owned keys do receive it.
- Distribution dust goes to the current or next pot, depending on the distribution.
- A Long round with no leader can remain buyable after its nominal end.
- Long’s expiry-triggering buy is refunded to the player’s general vault rather than automatically entering the next round.
- Soon’s expiry-triggering buy does enter the next round’s ICO.
- If an initialized Soon round receives no contributions at all, the next buy or withdrawal attempts to settle a round with zero keys. The end-mask division by zero reverts, so the original contract has no clean empty-round rollover path.
- Soon’s public ICO-key helper uses an `OR` condition that can select division by `icoAvg == 0` for an empty ICO and revert.
- Long’s early cap refunds only the excess to the general vault.
- The airdrop tier uses effective post-cap ETH.
- Team is selected per buy, and only the stored final leader team governs settlement.
- An invalid affiliate redirects value to P3D rather than leaving it in the pot.
- A failed low-level community payment redirects to P3D when the affiliate is valid. If the affiliate is also invalid, an assignment bug overwrites that community fallback and leaves the 2% unassigned.
- Some other external-call failures revert.
- An exact 1 gwei input exposes an outer/inner comparison mismatch in Long and can become unassigned balance.

### Security and implementation defects

- Long’s `extcodesize` human check is constructor-bypassable.
- Soon’s `tx.origin` check is composability-hostile and does not make block-derived randomness secure.
- The airdrop seed is predictable/manipulable enough for adversarial selection.
- The main timer game is vulnerable to gas-market and transaction-inclusion attacks.
- External calls introduce availability and revert dependencies.
- Long’s low-tier airdrop event marker is wrong even though the payout is right.
- Long’s player-info view contains a zero-address defaulting typo: it compares instead of assigning, so passing the zero address does not substitute `msg.sender` as intended.
- The unsigned team lower-bound comparison is dead code.
- Packed event data is easy for a frontend or indexer to decode incorrectly.

### Privileged setup versus ongoing control

The verified games contain one-time activation/setup gates restricted to a small list of Team JUST addresses. In Long, those authorized addresses could configure the companion FoMo3D contract once and activate the game once. After activation, the core timing and payout constants were not exposed as ordinary owner-tunable parameters.

That does not mean the system was trustless in every dimension. It retained external dependencies, and its security also depended on Ethereum’s mempool, miners/builders, gas market, and the behavior of recipient contracts.

## Read API and frontend-visible state

The verified Long source exposes read functions for:

- Current buy price
- Time remaining
- Player vault totals
- Current round summary
- Player information by address
- Keys received for a proposed ETH amount
- ETH required for a requested number of keys

The source emits events for:

- New player/name registration
- Buy and distribution
- Reload and distribution
- Withdrawal
- Affiliate payout
- End-of-transaction summaries
- Round settlement

Several event fields are densely packed into decimal positions. A correct indexer should validate decoded event data against storage/view results, especially around the known airdrop-tier marker defect and round rollover.

## Implementation-oriented pseudocode

The following captures the economic state transition without copying the original source:

```text
PROCESS_NORMAL_PURCHASE(player, eth, affiliate, team):
  effective_eth = apply_edition_specific_cap(player, eth)
  excess        = eth - effective_eth
  player.gen   += excess

  old_round_eth  = round.eth
  new_keys       = curve_keys(old_round_eth + effective_eth)
                   - curve_keys(old_round_eth)
  whole_new_keys = floor(new_keys / 10^18)

  if whole_new_keys >= 1:
      round.end    = edition_timer_update(round.end, whole_new_keys, now)
      round.leader = player.id
      round.team   = normalize_team(team)

  if normal_phase AND effective_eth >= 0.1 ETH:
      airdrop_tracker += 1
      if deterministic_draw_wins(airdrop_tracker):
          credit tier percentage of airdrop pot to player.win
          airdrop_tracker = 0

  calculate:
      affiliate_share
      community_share
      cross_game_or_next_round_share
      airdrop_share
      general_key_share
      p3d_share
      current_pot_share

  pay or redirect affiliate/community/external shares
  airdrop_pot += airdrop_share

  round.keys += new_keys
  player.round.keys += new_keys
  distribute_general_with_mask_excluding_new_keys_from_self_payment()
  round.pot += current_pot_share + rounding_dust

  round.eth += effective_eth
  player.round.eth += effective_eth
  round.team_eth[team] += effective_eth
```

Settlement:

```text
SETTLE(round):
  require now > round.end
  require round.leader exists
  require round not already ended

  if edition is Soon and ICO not converted:
      convert pooled ICO at final average price

  mark round ended
  table = final_split_for(round.team)

  leader.win += round.pot × 48%
  forward community share or redirect according to source behavior
  distribute final key-holder share through round mask
  deposit P3D share
  next_round.pot += next-pot share + division dust

  initialize next round with edition-specific timing
```

## Fidelity test checklist

A reimplementation claiming original-rule fidelity should test at least:

### Pricing

- First Long key costs exactly 0.000075 ETH.
- First Soon key costs exactly 0.0001 ETH.
- `keysRec(old, new)` equals `keys(old + new) - keys(old)` under integer arithmetic.
- Quote functions and executed purchases agree at rounding boundaries.
- Very small purchases mint fractional keys without accidentally becoming timer-qualified.

### Timer and leadership

- Long extends 30 seconds per whole key and never beyond `now + 24 hours`.
- Soon resets to no more than `now + 5 minutes`.
- Fractional-only buys do not replace the leader.
- A large purchase records one leader update, not one per key.
- A leaderless expired Long round can be revived.
- Equality at the exact stored end timestamp follows the source’s `<=`/`>` boundary.

### Accounting

- Every team’s buy allocation totals 100%.
- Every team’s final pot allocation totals 100%.
- Newly purchased keys are masked out of their own normal-purchase dividend.
- Preexisting keys receive the correct share.
- Integer dust lands in the correct pot.
- Affiliate failure paths redirect exactly as specified.
- Vault crystallization cannot double-count.
- Withdrawal zeros state before transferring.
- Reload cannot spend more than available vault value.

### Long-specific

- The one-hour gap prevents purchases.
- The early 1 ETH/player cap operates only while round ETH is below 100 ETH.
- Cap excess returns to `gen`.
- An expiry-discovering buy settles, then credits its entire value to `gen`.
- The first qualifying post-dormancy key uses `now` as the extension base.

### Soon-specific

- The ICO lasts exactly 60 seconds.
- ICO participants receive the same final average key price.
- ICO general dividends include every ICO key pro rata.
- No airdrop draw occurs during the ICO.
- Lazy ICO conversion and settlement-time conversion produce identical entitlements.
- An expiry-discovering buy continues into the next round’s ICO.

### Airdrop

- Tracker increments before the comparison.
- The threshold is effective ETH greater than or equal to 0.1 ETH.
- Tiers switch exactly at 1 ETH and 10 ETH.
- The tracker resets only after a win.
- Unawarded pot value rolls forward.
- A compatibility test captures Long’s incorrect low-tier event marker separately from its correct payment.

### Adversarial

- Reentrancy and failed-recipient behavior are explicitly defined.
- A timer outcome is tested under delayed/censored transaction inclusion.
- Randomness cannot be selected by constructor deployment, sender selection, or block producer influence in a secure redesign.
- Smart-contract wallets are either deliberately supported or deliberately rejected.

## What to preserve versus redesign

If the goal is historical simulation, preserve:

- The key curves.
- Whole-key leadership threshold.
- Team tables.
- Vault and dividend-mask accounting.
- Long and Soon timing differences.
- ICO average-price behavior.
- Transaction-triggered settlement as a simulation event.

If the goal is a new real-money deployment, redesign:

- Randomness using a commit/reveal protocol or a verifiable randomness service.
- End-game selection so block stuffing and transaction censorship cannot decide the jackpot.
- Wallet checks so contract wallets are supported safely.
- External payments using pull-based accounting.
- Upgrade/governance and emergency behavior with explicit, limited controls.
- User disclosures, odds, accounting, and regulatory compliance.

The original quirks and vulnerabilities should be compatibility options in a simulator, not default production behavior.

## Bottom line

FoMo3D’s essential loop was:

```text
later purchase
  -> increasingly expensive keys
  -> most ETH redistributed immediately
  -> qualifying buyer becomes leader and adds time
  -> timer eventually survives without a qualifying replacement
  -> next transaction settles
  -> leader receives 48% of the recorded pot
```

Long made that loop slow, added a frozen inter-round gap and an early contribution cap, and forwarded 1% to a companion Fast game. Soon made it extremely short, opened every round with a pooled 60-second ICO, used a much steeper curve, and rolled an expiry-triggering purchase directly into the next round.

The game’s real logic cannot be understood from the countdown alone. Its outcome depended equally on fixed-point key thresholds, per-team distribution choices, dividend masks, vault accounting, external contracts, integer rounding, transaction-triggered settlement, and the Ethereum block-inclusion market.
