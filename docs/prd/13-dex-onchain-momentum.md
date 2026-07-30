# PRD 13: DEX-Powered Onchain Momentum

> `D-022` (2026-07-29): This document supersedes the Chainlink Data Streams
> price-source and weighted-contributor payout requirements in PRDs 10-12.

## Player rule

Pick a Stock Token, pay $1 to take the bell, and hold it at zero to win 50%.
The stock's direct ten-minute DEX average locks a 1.25x, 1.0x, or 0.75x
Closing Print rate for that holder interval.

Weighted points choose the Closing Print ticker. The eligible ticker's 30% pool
is divided by each contributor's raw bell-hold seconds, not multiplied points.

## Canonical market source

- Mainnet scoring reads Uniswap V3 `observe()` directly from canonical Stock
  Token/USDG pools on Robinhood Chain.
- The TWAP window is 600 seconds and every pool must expose at least 1,800
  seconds of observation history.
- Instantaneous spot, aggregators, multi-hop routes, Robinhood REST prices, and
  Chainlink reports are not accepted as scoring inputs.
- Robinhood REST remains metadata-only: canonical address, active/halt state,
  corporate-action multiplier, and daily volume.
- Testnet uses mock transaction assets but attests genuine mainnet DEX
  observations. Every surface says
  `TESTNET MOCK ASSETS · MAINNET DEX PRICE`.

## Pool screening

A market must use the pinned factory and USDG, match the canonical Stock Token,
have nonzero active liquidity, hold at least 10,000 USDG, keep both sides of a
1,000 USDG quote below 1% impact, keep spot within 1% of the ten-minute TWAP,
and provide at least 100 of 120 expected 15-second samples.

Select the best fee tier by lowest round-trip impact, then rank tickers by
30-minute realized TWAP movement, daily volume, and symbol. If fewer than four
markets qualify, prepare a clearly labeled FLAT round. Revalidate at activation.
An unsafe live DEX market causes claims to fail before payment and triggers
emergency cancellation after a continuous 15-second outage.

## Interfaces and evidence

- `MarketMode` is `DEX` or `FLAT`.
- `TickerConfig.marketId` replaces `feedId`.
- Claims retain `claimBell(tickerIndex, marketProof, passTokenIndex)`.
- Mainnet proofs are empty. Testnet proofs are EIP-712 attestations bound to the
  testnet chain, verifier, round, mainnet pool, TWAP tick, normalized price,
  mainnet block number/hash, observation time, and source digest.
- Roster, snapshot, replay, receipt, and status responses expose pool, fee
  tier, ten-minute TWAP, source block, safety checks, weighted points, and raw
  payout airtime.
- Historical Chainlink and faction events remain version-discriminated.

## Launch gates

Testnet requires contract, screening, integration, browser, recovery, and
24-hour/100-round soak evidence. Mainnet remains blocked on an independent
contract audit, economic manipulation review, legal approval, and fresh
canonical token/pool verification.
