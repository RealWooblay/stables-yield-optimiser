import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { TokenBalance } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'
/**
 * Map a Helius Wallet row to TokenBalance.
 * - v1 uses `balance` (human) + optional `usdValue` / `pricePerToken`.
 * - Legacy v0 often uses `amount` as **raw** base units, but some responses
 *   already return human-readable amounts — dividing again yields ~0 and $0 positions.
 */
function mapHeliusTokenRow(t: Record<string, unknown>): TokenBalance {
  const mint = String(t.mint ?? '')
  const decimals = typeof t.decimals === 'number' ? t.decimals : 6
  const symbol = (t.symbol as string) ?? 'UNKNOWN'
  const name = (t.name as string) ?? 'Unknown Token'
  const logoUri = typeof t.logoUri === 'string' ? t.logoUri : undefined

  // v1 Wallet API: balance is already UI amount
  if (typeof t.balance === 'number') {
    const uiAmount = t.balance
    const amount = Math.round(uiAmount * Math.pow(10, decimals))
    let valueUsd = 0
    if (typeof t.usdValue === 'number' && Number.isFinite(t.usdValue)) {
      valueUsd = t.usdValue
    } else if (typeof t.pricePerToken === 'number' && Number.isFinite(t.pricePerToken)) {
      valueUsd = uiAmount * t.pricePerToken
    }
    return { mint, symbol, name, amount, decimals, uiAmount, valueUsd, logoUri }
  }

  // Explicit raw string (some endpoints)
  if (t.amountRaw != null) {
    const raw = typeof t.amountRaw === 'string' ? parseInt(t.amountRaw.replace(/\D/g, ''), 10) : Math.floor(Number(t.amountRaw))
    if (!Number.isFinite(raw)) {
      return { mint, symbol, name, amount: 0, decimals, uiAmount: 0, valueUsd: 0, logoUri }
    }
    const uiAmount = raw / Math.pow(10, decimals)
    let valueUsd = 0
    if (typeof t.usdValue === 'number') valueUsd = t.usdValue
    return { mint, symbol, name, amount: raw, decimals, uiAmount, valueUsd, logoUri }
  }

  const amt = Number(t.amount ?? 0)
  if (!Number.isFinite(amt)) {
    return { mint, symbol, name, amount: 0, decimals, uiAmount: 0, valueUsd: 0, logoUri }
  }

  // Some Helius payloads expose UI amount directly
  let uiAmount: number
  let amount: number
  if (typeof t.uiAmount === 'number' && Number.isFinite(t.uiAmount)) {
    uiAmount = t.uiAmount
    amount = Math.round(uiAmount * Math.pow(10, decimals))
  } else {
    // Legacy v0: `amount` is almost always raw base units (integer)
    uiAmount = amt / Math.pow(10, decimals)
    amount = Math.round(amt)
  }
  let valueUsd = 0
  if (typeof t.usdValue === 'number') valueUsd = t.usdValue
  else if (typeof t.valueUsd === 'number') valueUsd = t.valueUsd
  else if (typeof t.pricePerToken === 'number') valueUsd = uiAmount * t.pricePerToken

  return { mint, symbol, name, amount, decimals, uiAmount, valueUsd, logoUri }
}

export class HeliusAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('helius', {
    read: true,
    historical: true,
  }, 30_000, 20)

  private apiKey: string | null = null

  async initialize(): Promise<void> {
    // API key would come from env/config
    this.apiKey = import.meta.env.VITE_HELIUS_API_KEY ?? null
    if (this.apiKey) {
      this.log('Helius API initialized')
    } else {
      this.log('No API key, running in limited mode')
    }
  }

  async isAvailable(): Promise<boolean> {
    return true // Gracefully degrade without API key
  }

  async getEnhancedBalances(wallet: string): Promise<DataLabel<TokenBalance[]>> {
    if (!this.apiKey) {
      return createLabel([], 'helius', { confidence: 'low' })
    }

    try {
      // Prefer v1 Wallet API — correct decimal semantics + USD when available
      let response = await fetch(
        `https://api.helius.xyz/v1/wallet/${wallet}/balances?api-key=${this.apiKey}&limit=100`
      )
      let data = response.ok ? await response.json() : null
      let rows: Record<string, unknown>[] =
        data && Array.isArray(data.balances) ? (data.balances as Record<string, unknown>[]) : []

      if (rows.length === 0) {
        response = await fetch(
          `https://api.helius.xyz/v0/addresses/${wallet}/balances?api-key=${this.apiKey}`
        )
        data = response.ok ? await response.json() : {}
        rows = ((data as Record<string, unknown>)?.tokens ?? []) as Record<string, unknown>[]
      }

      const balances: TokenBalance[] = rows.map((t) => mapHeliusTokenRow(t))

      return createLabel(balances, 'helius', {
        confidence: 'high',
        staleDuration: 30_000,
      })
    } catch (err) {
      this.error('Failed to fetch enhanced balances', err)
      return createLabel([], 'helius', { confidence: 'low' })
    }
  }
}

export const heliusAdapter = new HeliusAdapter()
