# Last Bell Screen Gallery

These ImageGen concepts translate the Channel 4663 direction into the complete
mobile screen inventory for the Last Bell MVP. They are visual targets for the
Next.js implementation, not pixel-perfect production specifications.

- Generation mode: built-in ImageGen, one call per distinct screen
- Format: portrait mobile viewport without phone hardware
- Locked reference: [00-channel-4663-reference.png](./00-channel-4663-reference.png)
- Reproduction notes: [prompt-set.md](./prompt-set.md)
- Product requirements: [PRD 03: Experience and Interface](../../prd/03-experience-and-interface.md)

## Complete set

![Last Bell twelve-screen contact sheet](./screen-contact-sheet.png)

## Desktop Live / On Air

Viewport: `1200 px+`

Desktop does not stretch the mobile arena or become a trading terminal. The
clock, holder, and `$1` action stay inside one dominant center broadcast. A
station-rundown rail carries the rules and faction airtime on the left, while a
live transmission rail carries the Trenches, reusable allowance state, and
secondary navigation on the right.

Allowance note: these generated concepts predate the reusable-approval
decision. Any max-spend picker or bounded-budget copy in an image is
superseded by the implemented $100 play-USDG approval, automatic refresh when
the allowance is below $10, and wallet-controlled revocation.

![Desktop Live / On Air](./desktop-live-on-air.png)

## 01. Home / Next Broadcast

Route: `/`

The pre-wallet landing state teaches the three rules, exposes the next round,
and lets a spectator jump directly into the live transmission.

![Home / Next Broadcast](./01-home-next-broadcast.png)

## 02. Entry / Off Air

Route: `/play/[roundId]`, entry state

The player selects a ticker faction, sees the bounded spend and stock-token
lock, and enters through one dominant action.

![Entry / Off Air](./02-entry-off-air.png)

## 03. Live / On Air

Route: `/play/[roundId]`, live state

The countdown, current holder, and `$1` action dominate. Faction airtime and
activity remain visible but secondary.

![Live / On Air](./03-live-on-air.png)

## 04. Rug Zone

Route: `/play/[roundId]`, final ten-second state

The layout remains familiar while the broadcast switches to an emergency
transmission and explicitly states that timer extensions have ended.

![Rug Zone](./04-rug-zone.png)

## 05. Finalizing

Route: `/play/[roundId]`, settlement-pending state

The clock is frozen, claims are closed, and the last observed holder is shown
without prematurely declaring a winner.

![Finalizing](./05-finalizing.png)

## 06. Final Transmission

Route: `/play/[roundId]`, settled state

The winning holder, faction result, principal unlock, and claimable balance are
presented as a local-TV prize board with onchain proof.

![Final Transmission](./06-final-transmission.png)

## 07. Replay

Route: `/replay/[roundId]`

The replay combines a VCR-style scrubber with the canonical ordered claim
history and an explicit onchain verification action.

![Replay](./07-replay.png)

## 08. Receipt

Route: `/receipt/[roundId]/[player]`

The share surface is a collectible transmission receipt built around the
player's timing, faction, and settled win.

![Receipt](./08-receipt.png)

## 09. Rules

Route: `/rules`

The rules page repeats the five-second explanation first, then exposes exact
timer and payout parameters in compact broadcast tables.

![Rules](./09-rules.png)

## 10. Wallet / Session

Surface: hard-edged panel opened over `/play/[roundId]`

The session panel makes the wallet, maximum spend, remaining apes, expiry, and
limited permission scope visible without turning the game into a wallet app.

![Wallet / Session](./10-wallet-session.png)

## 11. Supported Assets

Route: `/supported-assets`

The canonical stock-token allowlist shows feed and entry health without prices,
corporate logos, or market charts.

![Supported Assets](./11-supported-assets.png)

## 12. Dead Air / Incident

Route: `/status` and inline incident state

The incident screen states what is stale, what is paused, whether a fee was
charged, and where the player can verify the chain.

![Dead Air / Incident](./12-dead-air-incident.png)
