# Saved by the Bell

Saved by the Bell is a short, mobile-first onchain game for Robinhood Chain.
Players pick a Stock Token ticker, choose any contribution amount with a $1
minimum and no maximum, and take the bell. The final holder wins half of every
Stock Token in the round pot.

> Pick a stock. Choose your amount. Take the bell. Hold it at zero to win 50%.

This repository contains the responsive Next.js application, Solidity round
contracts, deterministic Anvil devnet, wallet connection UI, testnet deployment
script, product requirements, research, and automated test suites.

## What is implemented

- Channel 4663 visual system across desktop and mobile
- Live round, lobby, finalizing, results, replay, receipt, rules, assets, and
  status screens
- Variable uncapped contributions with a $1 minimum, a first-contribution-started
  45-second round, later 2-second extensions, 10-second Rug Zone, and 180-second hard cap
- 50% final holder, 30% Winning Stock, 10% Lifetime Points, 5% next seed, and 5% protocol settlement
- Automatic settlement, Final Transmission, 5% seed transfer,
  archive capture, and continuous next-round launch
- One reusable USDG approval to a permanent payment router across rounds
- Rolling 30-second stock heat with a pre-call multiplier capped at 2×
- Pull-based claims, cancellation refunds, and deterministic ticker ties
- Local Anvil integration driven by real contract state and transactions
- Injected/EIP-6963, MetaMask, Coinbase Wallet, Safe, and WalletConnect
  connectors
- Robinhood Chain testnet configuration and Foundry deployment workflow
- PostgreSQL market collection, reorg-aware indexing, durable keeping, and a
  Chainlink Data Streams attestation adapter
- A build-isolated browser UAT wallet and faucet for mock-only chain 46630
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
creates a fresh deterministic round with approved callers and mock Stock
Tokens. `pnpm app:start` also launches the local round keeper. It finalizes
expired rounds, archives the result, transfers the 5% seed, and opens the next
numbered round without rebuilding or restarting the application. The new round
waits on its Entry Desk with no running timer until the first successful
contribution starts its clock.

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

Testnet uses chain ID `46630`, the LAN RPC first, a server-only provider
fallback, encrypted role keystores outside the repository, KeyGame mock USDG,
and the pinned `tm*` Stock Token mock catalog. Configure an owner-only server
environment:

```bash
export ROBINHOOD_TESTNET_RPC_URL=http://192.168.50.117:8547
export DEPLOYER_ADDRESS=0x...
export ADMIN_ADDRESS=0x...
export KEEPER_ADDRESS=0x...
export ATTESTOR_ADDRESS=0x...
export FAUCET_ADDRESS=0x...
export TREASURY_ADDRESS=0x...
export INITIAL_SEED_USD=50
export KEYGAME_DEPLOYER_KEYSTORE=/secure/path/deployer.json
export KEYGAME_DEPLOYER_PASSWORD_FILE=/secure/path/deployer.password
export ALLOW_TESTNET_BROADCAST=YES_I_AM_DEPLOYING_TEST_TOKENS
```

The deployment command fails closed on a dirty or unpushed commit, wrong or
unsynchronized chain, RPC with unlocked accounts, unfunded deployer,
incompatible mock assets, local test failure, or missing confirmation:

```bash
bash scripts/deploy-testnet.sh
```

It writes `deployments/46630.json`, records mock runtime bytecode hashes, and
submits source metadata to the testnet explorer. Apply PostgreSQL migrations
with `pnpm db:migrate`, then install the independent service templates from
`ops/systemd/`.

Verified rounds require private Chainlink credentials and a complete feed map.
The app never substitutes fabricated signed-report evidence. Browser UAT uses
the session-only generated wallet only when both UAT build flags are enabled.
Run `pnpm release:scan` for protected builds to prove UAT connector, key, and
faucet implementations are absent.

The mainnet deployment script is deliberately locked. The gated
`RobinhoodMainnetFork.t.sol` test verifies a fresh report through Robinhood's
official verifier without broadcasting.

### Production RPC routing

The browser connects through `/api/rpc/testnet` or `/api/rpc/mainnet`. The app
server uses the LAN full nodes as primary providers:

- Testnet: `http://192.168.50.117:8547` (chain ID 46630)
- Mainnet: `http://192.168.50.173:8547` (chain ID 4663)

Set `ROBINHOOD_TESTNET_FALLBACK_RPC_URL` and
`ROBINHOOD_MAINNET_FALLBACK_RPC_URL` to private provider endpoints in the
untracked server environment. The relay checks both heads every ten seconds and
uses the fallback when the LAN node is unavailable or more than five blocks
behind. Never place provider credentials in a `NEXT_PUBLIC_` variable.

## Documentation

- [PRD suite](docs/prd/README.md)
- [Comprehensive user stories](docs/prd/08-user-stories.md)
- [Delivery plan](docs/prd/07-delivery-plan.md)
- [Screen gallery](docs/design/screens/README.md)
- [Saved by the Bell product concept](docs/last-bell-product-concept.md)
- [FoMo3D game-logic research](docs/fomo3d-game-logic-research.md)

## Security boundary

The contracts and application are thoroughly tested but have not received an
independent security audit or legal review. Do not accept real player funds
until both are complete. No private key belongs in this repository or in a
`NEXT_PUBLIC_*` variable.
