# Stables Yield Optimiser

A real-time DeFi yield intelligence app for Solana stablecoin holders. Connect your wallet, and it tells you exactly where your USX and eUSX can earn the most — live rates, looping strategies, health factors, and step-by-step execution paths.

Built for the [Solstice](https://solstice.finance) ecosystem. Extensible to any stablecoin pair.

---

## What it does

- **Live yield data** across Orca, Raydium, Kamino, Loopscale, Exponent, and Solstice
- **Risk-adjusted rankings** — strategies scored by TVL, audit status, and APY
- **Loop strategy simulation** — models USX recursive loops and eUSX collateral loops with real borrow rates and health factors
- **Portfolio optimisation** — Safe / Balanced / Max Yield profiles, blended APY across your entire position including idle capital
- **Step-by-step actions** — convert, deposit, borrow, and deploy with deep links to each protocol
- **Ecosystem selector** — architecture supports any stablecoin pair, currently Solstice (USX / eUSX)

---

## Strategy universe

### Direct USX deployment
| Strategy | Data source |
|---|---|
| Exponent PT-USX (fixed rate · Jun 2026) | Birdeye price API → implied APY |
| Exponent YT-USX (speculative) | Birdeye price API |
| Orca USX-USDC LP | DeFi Llama live |
| Raydium USX-USDC LP | DeFi Llama live |
| Kamino USX supply | Kamino REST API live |
| Loopscale USX supply | DeFi Llama live |
| Loopscale USX 2× loop | `supplyAPY × 1.8 − borrowAPY × 0.8` |
| Loopscale USX 3× loop | `supplyAPY × 2.44 − borrowAPY × 1.44` |

### eUSX leverage (deposit eUSX → borrow USX → redeploy)
| Strategy | Effective APY formula |
|---|---|
| eUSX collateral loop (conservative) | `3.3% + 0.5 × LTV × (bestRate − borrowRate)` |
| eUSX collateral loop (max leverage) | `3.3% + 0.95 × LTV × (bestRate − borrowRate)` |

All rates fetched live. Nothing hardcoded except the Solstice vault base yield (3.3% — team confirmed) and Exponent contract addresses (immutable on-chain facts).

---

## Data sources

| Source | What it provides |
|---|---|
| [DeFi Llama Yields API](https://defillama.com/docs/api) | All Solana pool APYs, TVLs, borrow rates |
| [Kamino REST API](https://api.kamino.finance) | Live USX supply/borrow APY, eUSX LTV |
| [Birdeye Public API](https://birdeye.so) | PT-USX and YT-USX market prices |
| [Helius](https://helius.dev) | Wallet token balances and metadata |

---

## Getting started

```bash
pnpm install
cp .env.example .env
# fill in your keys
pnpm dev
```

### Environment variables

```env
# Solana RPC (defaults to public mainnet-beta)
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Helius — wallet balances and token metadata
VITE_HELIUS_API_KEY=

# Anthropic — AI intelligence panel (optional)
VITE_ANTHROPIC_API_KEY=
```

---

## Architecture

```
src/
├── adapters/
│   ├── data/
│   │   └── defillama.ts        # DeFi Llama yields API
│   ├── defi/
│   │   ├── kamino-lend.ts      # Live Kamino borrow/supply/LTV
│   │   ├── exponent.ts         # Birdeye price → implied PT/YT APY
│   │   └── solstice.ts         # Solstice vault 3.3% base yield
│   └── solana/
│       └── helius.ts           # Wallet balances
├── intelligence/
│   ├── portfolio-optimizer.ts  # Core allocation engine
│   ├── loop-strategies.ts      # USX recursive + eUSX collateral loops
│   └── risk-adjusted-yield.ts  # RAYS scoring
├── mutation/
│   └── diff.ts                 # Action builders (deposit/migrate/loop)
├── config/
│   └── tenant.ts               # Ecosystem presets (USX, extensible)
└── components/
    ├── OptimizeAllButton.tsx    # Main UI — ecosystem selector, risk profile, results
    └── TenantPortfolioStrip.tsx # Live blended APY strip
```

---

## Adding a new ecosystem

1. Add a preset to `TENANT_PRESETS` in `src/config/tenant.ts`
2. Add it to `ECOSYSTEM_OPTIONS` with `live: true`
3. The optimizer, filters, and UI pick it up automatically

```ts
// tenant.ts
{ id: 'usdc', label: 'USDC', description: 'USDC', live: true }
```

---

## Tech stack

- [Vite](https://vitejs.dev) + [React](https://react.dev) + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [@solana/wallet-adapter](https://github.com/solana-labs/wallet-adapter)
- [Zustand](https://zustand-demo.pmnd.rs)

---

## License

MIT
