# Channel 4663 ImageGen Prompt Set

## Generation mode

Each distinct screen was produced with one built-in ImageGen call in UI mockup
mode. The generated file was copied into this directory while the original
ImageGen output was left intact.

The first home concept received one precise text-edit pass to remove invented
timer copy. All later calls used the locked reference image and one completed
screen as style-only inputs.

## Shared prompt

The following direction was included in every screen prompt:

> Create a high-fidelity mobile app screen concept in a portrait 9:16 full app
> viewport with no phone hardware and no surrounding presentation board.
> Preserve the exact Channel 4663 visual language: an offbeat 1980s late-night
> public-access market game show, square broadcast bands, clipped corners, thin
> registration borders, teletext labels, analog print texture, stencil display
> type, and highly readable monospaced utility type. Use flat colors only.
> Avoid gradients, glassmorphism, rounded SaaS cards, generic crypto
> dashboards, cyberpunk neon, casino imagery, 3D coins, stock candlestick
> charts, corporate logos, and drop shadows. Render only the supplied product
> copy and do not invent mechanics.

Locked palette:

| Token | Hex |
|---|---|
| Dead Air | `#F3E7C7` |
| Night Desk | `#241B32` |
| Hot Mic | `#F15D4C` |
| Green Room | `#55C6A9` |
| Prize Tape | `#E1B83E` |
| Late Feed | `#5261A8` |
| Caller Lilac | `#B5A6D8` |
| Tube White | `#FFF9EB` |

## Desktop Live / On Air

Create a high-fidelity `16:9` desktop version at a `1440 px`-class viewport.
Keep the narrow live arena dominant in the center instead of stretching the
mobile composition. Put `HOW TO PLAY` and `TEAM AIRTIME · 30% BONUS` in a
subordinate left station-rundown rail. Put `THE TRENCHES`, the bounded
`ROUND 0042 SESSION`, `LINE CHECK`, and secondary navigation in a subordinate
right transmission-tape rail. The center retains `POT $1,284`, giant timer
`00:23.4`, `@WIFSTREET`, `$NVDA`, `APE FOR THE BELL · $1`, and
`8 APES LEFT`. Use empty Night Desk space to separate the three zones and
explicitly avoid a symmetric SaaS dashboard, trading terminal, charts, order
books, or financial analytics.

## Screen-specific prompt briefs

### 01. Home / Next Broadcast

Show `CH 4663`, `LAST BELL`, `NEXT BROADCAST`, `ROUND 0043`,
`STARTS IN 01:42`, and `POT SEED $500`. Teach only:

1. `PICK A BAG.`
2. `PAY $1 TO STEAL THE BELL.`
3. `HOLD IT AT ZERO TO WIN 50%.`

Add a `LIVE NOW` panel for `ROUND 0042`, timer `00:23.4`,
`@WIFSTREET`, and `$NVDA`, followed by `SPECTATE LIVE`,
`ENTER NEXT ROUND`, and `NO WALLET REQUIRED TO WATCH`.

### 02. Entry / Off Air

Show `OFF AIR`, `ROUND 0043`, `ENTRY OPEN`, and `PICK YOUR BAG`.
Offer `$NVDA`, `$AAPL`, `$TSLA`, and `$SPY`, with `$NVDA` selected.
Show `YOUR BAG $NVDA`, `ONE APPROVAL $100 · 100 CALLS`,
`REFRESH BELOW $10`, `ENTRY LOCK $5 OF $NVDA`, and
`YOUR STOCK TOKEN UNLOCKS AFTER SETTLEMENT`. End with `ENTER ROUND`
and `VIEW RULES`.

### 03. Live / On Air

Show `LIVE`, `HOLD THE BELL AT 0 · WIN 50%`, `ROUND 0042`,
`POT $1,284`, giant timer `00:23.4`, and the holder card
`ON THE BELL`, `@WIFSTREET`, `HOLDING FOR $NVDA`. Show
`TEAM AIRTIME · 30% BONUS` with `$NVDA 42%`, `$AAPL 27%`,
`$TSLA 18%`, and `$SPY 13%`. End with
`APE FOR THE BELL · $1`, `8 APES LEFT`, and one
`THE TRENCHES` row: `@BAGHOLDER APED · +2S`.

### 04. Rug Zone

Show `RUG ZONE`, `NO EXTENSIONS`, `ROUND 0042`, `POT $1,422`,
giant timer `00:06.8`, `@PAPERHANDS`, `HOLDING FOR $AAPL`, and
`HOLD 6.8S · WIN 50%`. Show airtime values `$NVDA 40%`,
`$AAPL 30%`, `$TSLA 18%`, and `$SPY 12%`. End with
`SEND IT FOR THE BELL · $1`, `6 APES LEFT`, and
`@PAPERHANDS RUGGED $NVDA`.

### 05. Finalizing

Show `FINALIZING`, `FINALIZING TRANSMISSION`, `ROUND 0042`,
`POT $1,463`, frozen clock `00:00.0`, `LAST SEEN ON THE BELL`,
`@PAPERHANDS`, and `HOLDING FOR $AAPL`. Make
`WAITING FOR ONCHAIN SETTLEMENT` dominant. Add `CLAIMS CLOSED`,
`LAST ACCEPTED TX 0x4E21...9A7C`, `BLOCK 9182042`,
`CONFIRMATIONS 2 / 3`, and `DO NOT SHOW A WINNER YET`.

### 06. Final Transmission

Show `FINAL`, `BAG SECURED`, `ROUND 0042`, `FINAL HOLDER`,
`@PAPERHANDS`, `$AAPL`, and `WON $731.50 · 50%`. Show
`TEAM BONUS`, `$NVDA · 40% AIRTIME`, and `SPLIT 30%`. The claim
ledger reads `FINAL HOLDER $731.50`, `TEAM BONUS $0.00`, and
`PRINCIPAL 5.00 AAPL UNLOCKED`. End with `CLAIM REWARDS`,
`SHARE TRANSMISSION`, `RUN IT BACK`, and
`SETTLED AT BLOCK 9182045`.

### 07. Replay

Show `REPLAY`, `ROUND 0042 REPLAY`, a frozen `00:06.8` frame,
`@PAPERHANDS`, and `$AAPL`. Add a timeline from `00:45` to `00:00`
with the playhead at `00:06.8`. Event rows:

- `00:23.4 @WIFSTREET $NVDA`
- `00:06.8 @PAPERHANDS RUGGED $NVDA`
- `00:00.7 FINAL CLAIM ACCEPTED`
- `FINAL @PAPERHANDS $AAPL`

End with `PREV`, `PLAY`, `NEXT`, `VERIFY ONCHAIN`, and
`SETTLED AT BLOCK 9182045`.

### 08. Receipt

Show `RECEIPT` and a large shareable card containing `CHANNEL 4663`,
`TRANSMISSION RECEIPT`, `SNIPED WITH 0.7S LEFT`, `@PAPERHANDS`,
`$AAPL`, `WON $731.50`, `ROUND 0042 · FINAL HOLDER`, and
`REPLAY VERIFIED ONCHAIN`. End with `SHARE`, `COPY REPLAY`, and
`SETTLED AT BLOCK 9182045`.

### 09. Rules

Show `RULES`, `HOW TO PLAY`, and the three core rules. Add a
`ROUND RULES` board with `APE $1`, `START 45S`, `EACH APE +2S`,
`MAX CLOCK 3:00`, `RUG ZONE LAST 10S`, and
`RUG ZONE NO EXTENSIONS`. Add `POT SPLIT` rows:
`50% FINAL HOLDER`, `30% TEAM AIRTIME`, `15% NEXT ROUND`,
and `5% OPERATIONS`. End with
`ENTRY STOCK TOKENS UNLOCK AFTER SETTLEMENT`,
`CANONICAL TOKENS ONLY`, `VIEW CONTRACT`, and `BACK TO GAME`.

### 10. Wallet / Session

Open a severe opaque control panel over a faint live broadcast.
Show `LINE CHECK`, `WALLET / SESSION`, `0x71A4...9C2E`,
`CONNECTED`, and `PLAY USDG APPROVAL`. The allowance reads
`APPROVED $98`, `SPENT $2`, `98 CALLS`, and
`REFRESHES BELOW $10`. Under `THIS APPROVAL CAN`, show
`ONLY USDG`, `ONE DOLLAR PER ACCEPTED CALL`, and `WALLET CONTROLLED`.
End with `REVOKE USDG APPROVAL`, `EDIT IN WALLET`, and
`BACK TO BROADCAST`.

### 11. Supported Assets

Show `ASSETS`, `SUPPORTED BAGS`, and
`LAST VERIFIED BLOCK 9182042`. Create a table with columns
`BAG`, `TOKEN`, `FEED`, and `ENTRY`, and rows:

- `$NVDA CANONICAL LIVE OPEN`
- `$AAPL CANONICAL LIVE OPEN`
- `$TSLA CANONICAL STALE PAUSED`
- `$SPY CANONICAL LIVE OPEN`

Add shortened canonical address rows, `CANONICAL STOCK TOKENS ONLY`,
`STOCK TOKENS ARE TOKENISED DEBT SECURITIES, NOT SHARES`,
`VIEW RULES`, and `BACK TO GAME`.

### 12. Dead Air / Incident

Show `DEAD AIR`, `WEAK SIGNAL`, `LIVE UPDATES DELAYED`,
`LAST VERIFIED BLOCK 9182042`, `4.2S AGO`, and `CLAIMS PAUSED`.
The central notice reads:

> WE CANNOT RELIABLY SHOW THE CURRENT HOLDER. NEW CLAIMS ARE PAUSED
> IN THIS APP. VERIFY ONCHAIN BEFORE ACTING.

Add `NO $1 GAME FEE WAS CHARGED.`, `YOUR FUNDS REMAIN ONCHAIN`,
`RETRY SIGNAL`, `VIEW STATUS`, and `OPEN EXPLORER`.
