import { Connection, PublicKey } from '@solana/web3.js'
import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { TokenBalance } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'

const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Solana', decimals: 9 },
  '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG': { symbol: 'USX', name: 'USX Stablecoin', decimals: 6 },
  // Kamino interest-bearing USX (often shown as eUSX; same mint used for vault/supply receipt)
  '3ThdFZQKM6kRyVGLG48kaPg5TRMhYMKY1iCRa9xop1WC': { symbol: 'eUSX', name: 'Kamino eUSX', decimals: 6 },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL', name: 'Marinade SOL', decimals: 9 },
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': { symbol: 'JitoSOL', name: 'Jito Staked SOL', decimals: 9 },
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj': { symbol: 'stSOL', name: 'Lido Staked SOL', decimals: 9 },
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': { symbol: 'bSOL', name: 'BlazeStake SOL', decimals: 9 },
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4': { symbol: 'JLP', name: 'Jupiter LP', decimals: 6 },
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}

export class SolanaRpcAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('solana-rpc', {
    read: true,
    write: false,
    realtime: true,
  }, 30_000, 10)

  private connection: Connection | null = null

  async initialize(): Promise<void> {
    this.connection = new Connection(SOLANA_RPC, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 30_000,
    })
    this.log(`Connected to ${SOLANA_RPC.includes('mainnet-beta') ? 'public mainnet' : 'custom RPC'}`)
  }

  async isAvailable(): Promise<boolean> {
    try {
      const conn = new Connection(SOLANA_RPC, 'confirmed')
      await withRetry(() => conn.getSlot())
      return true
    } catch {
      return false
    }
  }

  getConnection(): Connection | null {
    return this.connection
  }

  getRpcUrl(): string {
    return SOLANA_RPC
  }

  async getTokenBalances(wallet: string): Promise<DataLabel<TokenBalance[]>> {
    if (!this.connection) throw new Error('Not initialized')

    const pubkey = new PublicKey(wallet)
    const balances: TokenBalance[] = []

    try {
      const solBalance = await withRetry(() => this.connection!.getBalance(pubkey))
      balances.push({
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Solana',
        amount: solBalance,
        decimals: 9,
        uiAmount: solBalance / 1e9,
        valueUsd: 0,
      })
    } catch (err) {
      this.error('Failed to get SOL balance', err)
    }

    try {
      const tokenAccounts = await withRetry(() =>
        this.connection!.getParsedTokenAccountsByOwner(pubkey, {
          programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        })
      )

      for (const account of tokenAccounts.value) {
        const parsed = account.account.data.parsed.info
        const mint = parsed.mint as string
        const known = KNOWN_TOKENS[mint]

        const amount = Number(parsed.tokenAmount.amount)
        const uiAmount = Number(parsed.tokenAmount.uiAmount)
        const decimals = Number(parsed.tokenAmount.decimals)

        if (uiAmount <= 0) continue

        balances.push({
          mint,
          symbol: known?.symbol ?? (parsed.symbol as string | undefined) ?? mint.slice(0, 6),
          name: known?.name ?? (parsed.name as string | undefined) ?? `Token ${mint.slice(0, 8)}`,
          amount,
          decimals: known?.decimals ?? decimals,
          uiAmount,
          valueUsd: 0,
        })
      }
    } catch (err) {
      this.error('Failed to get token accounts', err)
    }

    return createLabel(balances, 'solana-rpc', {
      confidence: 'high',
      staleDuration: 30_000,
      expiredDuration: 120_000,
    })
  }
}

export const solanaRpc = new SolanaRpcAdapter()
