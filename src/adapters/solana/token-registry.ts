export interface TokenMeta {
  mint: string
  symbol: string
  name: string
  decimals: number
  protocol: string
  strategy: string
  poolType: 'staking' | 'lending' | 'lp' | 'vault' | 'native'
  defiLlamaSlugs: string[]
}

export const YIELD_BEARING_TOKENS: TokenMeta[] = [
  // Marinade
  {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    name: 'Marinade Staked SOL',
    decimals: 9,
    protocol: 'marinade',
    strategy: 'mSOL Staking',
    poolType: 'staking',
    defiLlamaSlugs: ['marinade-finance'],
  },
  // Jito
  {
    mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    symbol: 'JitoSOL',
    name: 'Jito Staked SOL',
    decimals: 9,
    protocol: 'jito',
    strategy: 'JitoSOL Staking',
    poolType: 'staking',
    defiLlamaSlugs: ['jito'],
  },
  // Lido
  {
    mint: '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',
    symbol: 'stSOL',
    name: 'Lido Staked SOL',
    decimals: 9,
    protocol: 'lido',
    strategy: 'stSOL Staking',
    poolType: 'staking',
    defiLlamaSlugs: ['lido'],
  },
  // Jupiter
  {
    mint: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
    symbol: 'JLP',
    name: 'Jupiter LP',
    decimals: 6,
    protocol: 'jupiter',
    strategy: 'JLP Vault',
    poolType: 'vault',
    defiLlamaSlugs: ['jupiter'],
  },
  // Drift Insurance Fund - USDC
  {
    mint: 'FN1fCsxe5R7w5AW3Z5mJfn5cEAqEoNpXGbdMFNg1p4GJ',
    symbol: 'DRIFT-IF-USDC',
    name: 'Drift Insurance Fund USDC',
    decimals: 6,
    protocol: 'drift',
    strategy: 'USDC Insurance Fund',
    poolType: 'vault',
    defiLlamaSlugs: ['drift'],
  },
  // bSOL (BlazeStake)
  {
    mint: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
    symbol: 'bSOL',
    name: 'BlazeStake SOL',
    decimals: 9,
    protocol: 'blazestake',
    strategy: 'bSOL Staking',
    poolType: 'staking',
    defiLlamaSlugs: ['blazestake'],
  },
  // Kamino eUSX — interest-bearing / supply receipt for USX (not a separate “kUSX” product)
  {
    mint: '3ThdFZQKM6kRyVGLG48kaPg5TRMhYMKY1iCRa9xop1WC',
    symbol: 'eUSX',
    name: 'Kamino eUSX',
    decimals: 6,
    protocol: 'kamino',
    strategy: 'USX supply / lend',
    poolType: 'lending',
    // Lend only — "kamino" also matches liquidity vaults and inflates APY vs your USX supply position
    defiLlamaSlugs: ['kamino-lend'],
  },
]

const MINT_INDEX = new Map<string, TokenMeta>(
  YIELD_BEARING_TOKENS.map((t) => [t.mint, t])
)

export function lookupMint(mint: string): TokenMeta | undefined {
  return MINT_INDEX.get(mint)
}

export function isYieldBearingToken(mint: string): boolean {
  return MINT_INDEX.has(mint)
}

const STABLECOIN_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', // USX
])

export function isStablecoin(mint: string): boolean {
  return STABLECOIN_MINTS.has(mint)
}

export function isIdleCapital(mint: string): boolean {
  return STABLECOIN_MINTS.has(mint) || mint === 'So11111111111111111111111111111111111111112'
}
