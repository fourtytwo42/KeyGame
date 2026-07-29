# Last Bell

Last Bell is a short, mobile-first onchain game for Robinhood Chain. Players
pick a wrapped stock on every call, pay $1 to put it on air and take the bell,
and try to hold it when the countdown reaches zero.

> Pick a stock. Pay $1 to put it on air and steal the bell. Market momentum
> boosts its airtime. Hold the bell at zero to win 50%.

This repository contains the responsive Next.js application, Solidity round
contracts, deterministic Anvil devnet, wallet connection UI, testnet deployment
script, product requirements, research, and automated test suites.

## What is implemented

- Channel 4663 visual system across desktop and mobile
- Live round, lobby, finalizing, results, replay, receipt, rules, assets, and
  status screens
- Exact-price $1 bell claims, 45-second round, 2-second extensions, 10-second
  Rug zone, and 180-second hard cap
- 50% caller, 30% Closing Print, 15% next round, and 5% treasury settlement
- Automatic settlement, eight-second Final Transmission, 15% seed transfer,
  archive capture, and continuous next-round launch
- One reusable USDG approval to a permanent payment router across rounds
- GREEN 1.25×, FLAT 1×, and RED 0.75× signed-report scoring
- Pull-based claims, cancellation refunds, and deterministic ticker ties
- Local Anvil integration driven by real contract state and transactions
- Injected/EIP-6963, MetaMask, Coinbase Wallet, Safe, and WalletConnect
  connectors
- Robinhood Chain testnet configuration and Foundry deployment workflow
- Unit, component, contract, integration, accessibility, desktop, and mobile
  browser tests

## Local devnet

Requirements: Node.js 24+, pnpm, Foundry, Bash, and `jq`.

```bash
pnpm install
pnpm devnet:start
pnpm devnet:deploy
pnpm build
pnpm app:start
```

Open `http://localhost:3000` when running everything locally. When the app is on
a LAN VM, set `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_LOCAL_RPC_URL` to addresses
the browser can reach.

Stop the services with:

```bash
pnpm app:stop
pnpm devnet:stop
```

The devnet is disposable. Re-running `pnpm devnet:deploy` resets the chain and
creates a fresh deterministic round with approved callers, mock Stock Tokens,
and signed mock reports. `pnpm app:start` also launches the local round keeper.
It finalizes expired rounds, archives the result, shows an eight-second
intermission, transfers the 15% seed, and opens the next numbered round without
rebuilding or restarting the application.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
forge fmt --check
forge test -vvv
pnpm test:integration
pnpm build
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

Integration and browser tests require a running, freshly deployed local devnet.
The browser suite serializes tests because they intentionally mutate one shared
round.

## Wallet configuration

Copy `.env.example` to `.env.local`. Provide a Reown project ID to enable
WalletConnect:

```dotenv
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_reown_project_id
```

Allowlist the application origin in Reown. MetaMask and other injected wallets
are discovered in the browser. The local application can be tested without an
extension because devnet mode submits deterministic test-account transactions
server-side.

## Robinhood Chain testnet

Testnet uses chain ID `46630`. Configure the environment without committing a
signing key:

```bash
export ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
export DEPLOYER_ADDRESS=0x...
export TREASURY_ADDRESS=0x...
export PAYMENT_TOKEN_ADDRESS=0x...
export PAYMENT_ROUTER_ADDRESS=0x...
export ROUND_ID=4663
```

Deploy through a configured Foundry signer or hardware wallet:

```bash
pnpm contracts:deploy:testnet
```

After deployment, place the contract and payment-token addresses in the public
application environment, build the app, and verify the deployment on the
Robinhood Chain explorer. A production RPC provider is recommended because the
public endpoint is rate-limited.

## Documentation

- [PRD suite](docs/prd/README.md)
- [Comprehensive user stories](docs/prd/08-user-stories.md)
- [Delivery plan](docs/prd/07-delivery-plan.md)
- [Screen gallery](docs/design/screens/README.md)
- [Last Bell product concept](docs/last-bell-product-concept.md)
- [FoMo3D game-logic research](docs/fomo3d-game-logic-research.md)

## Security boundary

The contracts and application are thoroughly tested but have not received an
independent security audit or legal review. Do not accept real player funds
until both are complete. No private key belongs in this repository or in a
`NEXT_PUBLIC_*` variable.
