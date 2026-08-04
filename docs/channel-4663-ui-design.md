# Channel 4663 UI Design

> Closing Print adaptation: retain this off-beat broadcast visual system, but
> replace faction selection and airtime with four per-claim ticker buttons,
> market bands, multipliers, and `THE CLOSING PRINT` in
> [PRD 10](./prd/10-closing-print-market-reactive.md).

Status: Selected visual and frontend direction for `Saved by the Bell: Ticker Royale` on 2026-07-28.

## Decision

The interface will use an intentionally uncommon design language called **Channel 4663**:

> A late-night regional public-access market game show, transmitted through a teletext scoreboard and operated with municipal broadcast hardware.

`4663` is Robinhood Chain's chain ID. In the interface it becomes the fictional television channel carrying every Saved by the Bell round.

The product is `Saved by the Bell`. Channel 4663 is its visual world, not a replacement product name.

## Directions deliberately rejected

This direction was chosen outside the most obvious design answers. Do not drift toward:

1. Minimal black-and-green fintech.
2. Neon cyberpunk trading terminal.
3. Glassmorphism and floating translucent cards.
4. Neo-brutalist meme site with thick black outlines and primary colors.
5. Polished 3D casino, slot-machine, or mobile-gacha interface.

Also avoid default shadcn-style dashboards, purple Web3 gradients, floating coin renders, candlestick-chart wallpaper, soft SaaS cards, and generic esports chrome.

## Why Channel 4663 fits

The metaphor maps directly to the game:

- A round is a live broadcast.
- Ticker factions are contestants.
- The bell holder is the current caller on air.
- Control time is airtime.
- The countdown is the broadcast clock.
- `THE TRENCHES` is the news crawl.
- The Rug Zone is a signal emergency.
- Settlement is the final results card.
- Shareable outcomes are transmission receipts.

It is strange enough to be recognizable in a feed, but the game rules remain literal and legible.

## Palette: Dead Channel

No pure black, pure white, neon green, or conventional bullish/bearish red-green pairing is used.

| Token | Hex | Role | Text pairing | WCAG contrast |
|---|---|---|---|---:|
| Dead Air | `#F3E7C7` | Main canvas and quiet fields | Night Desk | 13.36:1 |
| Night Desk | `#241B32` | Primary ink, frames, dark broadcast panels | Tube White | 15.65:1 |
| Hot Mic | `#F15D4C` | Main action and urgent accepted state | Night Desk | 5.02:1 |
| Green Room | `#55C6A9` | NVDA faction and positive control | Night Desk | 7.85:1 |
| Prize Tape | `#E1B83E` | Pot, winnings, and SPY faction | Night Desk | 8.71:1 |
| Late Feed | `#5261A8` | AAPL faction and Rug Zone field | Tube White | 5.50:1 |
| Caller Lilac | `#B5A6D8` | TSLA faction, secondary signal, selected caller | Night Desk | 7.36:1 |
| Tube White | `#FFF9EB` | Text on Night Desk and Late Feed | Night Desk | 15.65:1 |

The faction colors are intentionally not derived from company brands:

- `$NVDA`: Green Room.
- `$AAPL`: Late Feed.
- `$TSLA`: Caller Lilac.
- `$SPY`: Prize Tape.

This avoids turning the interface into a collage of corporate logos. Every ticker also receives a pattern and short label so faction identity does not depend on color.

## Typography

Use three deliberately mismatched but functional type families:

- **Big Shoulders Stencil** for station IDs, phase names, and oversized result language.
- **Atkinson Hyperlegible Next** for rules, buttons, wallet information, and body copy.
- **Azeret Mono** for timers, prices, addresses, round IDs, and transaction state.

Load them through `next/font` so the fonts are self-hosted and do not require runtime requests.

Rules:

- Timer numerals are tabular and never condensed enough to blur.
- Meme copy can be uppercase; explanatory copy uses normal casing.
- Body text never uses the stencil face.
- Do not use Inter, Space Grotesk, Poppins, Montserrat, or a generic crypto display face.

## Geometry

Channel 4663 does not use a card stack.

- Main surfaces are full-width broadcast bands.
- Corners are square or clipped, never uniformly pill-shaped.
- Borders are registration lines, not heavy neo-brutalist outlines.
- Color slabs touch and interrupt one another like imperfect live graphics.
- Small crop marks and station codes replace decorative icons.
- There are no drop shadows, glass, blur, glow, or gradients.
- Background texture may use a very subtle print dot or horizontal signal pattern, but never reduce text contrast.

The composition should feel assembled by a local station engineer, not generated from a component library.

## Primary mobile layout

### Station strip

The top strip always shows:

- `CH 4663`
- `SAVED BY THE BELL`
- `LIVE`, `RUG ZONE`, or `FINAL`
- Round number

It behaves like a television station identifier, not a conventional app header.

### Prize lower third

A hard-edged lower-third band states:

`HOLD THE BELL AT 0 · WIN 50%`

The pot sits beside it in Prize Tape yellow. This is the first rule the eye encounters.

### Broadcast clock

The countdown is the largest object on screen. It uses split-flap-style vertical digit motion without copying a literal airport clock.

Only one countdown is shown. The three-minute hard end appears as small supporting text, not a competing timer.

### On-air caller

The current holder occupies a skewed broadcast field:

- `ON THE BELL`
- Player name or shortened address
- Ticker faction
- Current personal hold duration

When the bell changes hands, the field is replaced by a fast horizontal lower-third wipe.

### Airtime board

Faction control is labeled `TEAM AIRTIME · 30% BONUS`.

It is drawn as four unequal broadcast strips rather than a conventional progress bar. Each strip contains the ticker, percentage, and pattern.

### Studio switch

The main action resembles an illuminated broadcast switch:

`APE FOR THE BELL`

`$1`

`8 APES LEFT`

It remains a real accessible button with a literal label. The broadcast metaphor must never hide the price or action.

### News crawl

`THE TRENCHES` occupies the bottom transmission band:

`@BEARSUIT GOT RUGGED · @WIFSTREET TOOK THE BELL FOR $NVDA`

Do not continuously move essential text. The crawl updates in discrete readable jumps. Decorative motion pauses when reduced-motion is enabled.

## Round states

### Off Air

- Dead Air canvas.
- Ticker contestants appear as numbered channels.
- One input only: `YOUR BAG`.
- Primary action: `ENTER ROUND`.
- Supporting approval line: `$100 PLAY USDG · REFRESH BELOW $10 · REVOKE ANY TIME`.
- Supporting line: `Your Stock Token unlocks after settlement.`

### On Air

- Dead Air canvas with faction slabs.
- Hot Mic action switch.
- Persistent rule: `Hold the bell at 0 · win 50%`.
- Current caller and countdown dominate.

### Rug Zone

- Late Feed blue becomes the dominant field.
- Hot Mic appears as short interruption bars, not a red full-screen alarm.
- Station strip reads `SIGNAL UNSTABLE · 10 SECONDS · NO EXTENSIONS`.
- Button changes to `SEND IT FOR THE BELL · $1`.
- A successful theft produces a 120 ms horizontal signal tear and a readable `RUGGED` lower third.

### Final transmission

- Motion stops.
- A broadcast results card shows the final holder first.
- `BAG SECURED` is paired with the exact 50% prize.
- The 30% faction bonus appears below as a secondary result.
- Actions are `SHARE TRANSMISSION` and `RUN IT BACK`.

### Off-air error

Errors use technical-broadcast language followed by a literal explanation:

`DEAD AIR`

`Your transaction was not accepted before the round ended. No $1 fee was charged.`

Never use a joke without the literal recovery instruction.

## Mascot and illustration direction

Every ticker faction receives an awkward public-access mascot rather than a corporate logo or glossy 3D token:

- Flat three-color vector art.
- Photocopied edge texture.
- Slightly wrong proportions.
- One prop tied to the current market narrative.
- Expressions designed for `COOKING`, `RUGGED`, `COOKED`, and `BAG SECURED`.

The mascots should look like performers from a low-budget regional game show. They should not look like NFT profile pictures, anime gacha characters, or casino symbols.

## Motion and sound

Motion is event-driven:

- Accepted claim: lower-third wipe and mechanical switch depression.
- New faction lead: one scoreboard strip swaps position.
- Rug: short horizontal signal tear.
- Rug Zone: one station-identification cut.
- Settlement: hard cut to static results card.

No ambient particles, looping ticker movement, pulsing glows, or infinite gradients.

Optional sound uses a relay click, studio buzzer, tape stop, and three-note station ident. Sound is muted until the player explicitly enables it. Haptic confirmation must distinguish `submitted`, `accepted`, and `rugged`.

## Next.js frontend decision

Use:

- Next.js `16.2.x`.
- App Router.
- TypeScript in strict mode.
- React Server Components for lobby, rules, round history, and receipt pages.
- Client Components only for the live arena, wallet/session controls, and event-driven motion.
- CSS Modules plus global CSS custom properties.
- `next/font` for the three selected typefaces.
- Native CSS transitions and the Web Animations API for the small event-driven motion system.
- `viem` for read/write encoding and event decoding.
- A headless accessibility primitive only where native elements are insufficient.

Do not use:

- Tailwind as the primary visual-authoring layer.
- shadcn/ui or a pre-skinned component library.
- A dashboard template.
- A canvas renderer for ordinary interface elements.
- Framer Motion for basic transitions.

The deliberate use of CSS Modules keeps the visual grammar specific to Channel 4663 instead of encouraging generic utility-class composition. Next.js supports App Router project structure, TypeScript, CSS Modules, and optimized self-hosted fonts directly.

## Proposed frontend structure

```text
app/
  layout.tsx
  page.tsx
  play/[roundId]/page.tsx
  replay/[roundId]/page.tsx
  receipt/[roundId]/[player]/page.tsx
  receipt/[roundId]/[player]/opengraph-image.tsx
  api/rounds/route.ts
components/
  broadcast/
    StationStrip.tsx
    PrizeLowerThird.tsx
    BroadcastClock.tsx
    OnAirCaller.tsx
    AirtimeBoard.tsx
    StudioSwitch.tsx
    TrenchesFeed.tsx
features/
  arena/
  entry/
  replay/
  receipt/
lib/
  chain/
  game/
  formatting/
styles/
  tokens.css
  globals.css
```

## Responsive behavior

- `320–767 px`: single broadcast composition with the action switch inside thumb reach.
- `768–1199 px`: centered portrait broadcast with the Trenches feed beside it.
- `1200 px+`: broadcast remains narrow; replay, rules, or wallet details occupy side rails.

Desktop must not expand into a conventional multi-column trading dashboard.

## Accessibility gates

- All normal-size text pairs meet WCAG AA contrast.
- Every color-coded faction also has a ticker and pattern.
- The game works with keyboard and screen reader controls.
- `prefers-reduced-motion` removes digit rolls, signal tears, and lower-third wipes.
- Essential activity does not auto-scroll.
- Sound is never required.
- The current price, remaining budget, and win condition remain visible.
- Meme terminology is always paired with a literal explanation.

## Acceptance test

A first-time player should be able to answer within five seconds:

1. What do I press?
2. What does it cost?
3. How do I win?
4. How much can I still spend?
5. Who currently holds the bell?

If the visual eccentricity makes any answer harder, the eccentricity loses.

## Reference boundary

The direction takes structural inspiration from historical television results screens, teletext information density, station identifiers, and lower-thirds. It must not reproduce an archived broadcaster's logos, layouts, mascots, footage, or protected graphics.

References:

- [Next.js App Router documentation](https://nextjs.org/docs/app)
- [Next.js font optimization](https://nextjs.org/docs/app/getting-started/fonts)
- [Next.js CSS options](https://nextjs.org/docs/pages/getting-started/css)
- [TVARK results-screen archive](https://tvark.org/results)
- [TV Whirl Channel 4 Teletext archive](https://www.tvwhirl.co.uk/teletext/channel-4-teletext/)
