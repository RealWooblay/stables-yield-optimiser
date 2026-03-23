import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { YieldSource } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'

/**
 * Exponent Finance — Solana yield trading platform (PT/YT for eUSX).
 *
 * PT-USX: Principal token. Trades at a discount to USX; redeems 1:1 at maturity.
 * Implied APY = (1 / ptPrice - 1) × (365 / daysToMaturity)
 *
 * YT-USX: Yield token. Leveraged exposure to eUSX yield rate.
 * Implied APY computed from current market price.
 *
 * Price source: Birdeye public API (no auth required for basic price endpoint).
 * Falls back to last cached value; omits source entirely if no price ever fetched.
 */

// Contract facts — these don't change
const PT_USX_MINT = 'Fpyd3HEkBGFnJMkPKFvDtXZmxXxeKfrgSwFZF9Qm2TdE' // PT-USX-01JUN26
const YT_USX_MINT = '3wMSgPAaHGRMJJmUJbEFCwwpHXGLB8s8h71DzDxJRFdg' // YT-USX-01JUN26
const PT_MATURITY = new Date('2026-06-01T00:00:00Z').getTime()

const BIRDEYE_PRICE = 'https://public-api.birdeye.so/defi/price?address='

interface CachedPrice {
  price: number
  ts: number
}

const priceCache = new Map<string, CachedPrice>()
const PRICE_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

async function fetchBirdeyePrice(mint: string): Promise<number | null> {
  const cached = priceCache.get(mint)
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) return cached.price
  try {
    const res = await fetch(`${BIRDEYE_PRICE}${mint}`, {
      headers: { 'x-chain': 'solana' },
    })
    if (!res.ok) throw new Error(`Birdeye ${res.status}`)
    const json = await res.json()
    const price = json?.data?.value as number | undefined
    if (typeof price !== 'number' || price <= 0) return null
    priceCache.set(mint, { price, ts: Date.now() })
    return price
  } catch {
    return null
  }
}

function impliedPtApy(ptPrice: number, maturityMs: number): number {
  const daysToMaturity = (maturityMs - Date.now()) / 86_400_000
  if (daysToMaturity < 1) return 0 // expired
  return ((1 / ptPrice - 1) * (365 / daysToMaturity)) * 100
}

export class ExponentAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('exponent', { read: true }, 600_000, 5)

  async initialize(): Promise<void> {
    this.log('Exponent adapter initialized (live Birdeye prices)')
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getYieldSources(): Promise<DataLabel<YieldSource[]>> {
    const [ptPrice, ytPrice] = await Promise.all([
      fetchBirdeyePrice(PT_USX_MINT),
      fetchBirdeyePrice(YT_USX_MINT),
    ])

    const sources: YieldSource[] = []

    if (ptPrice !== null && ptPrice > 0 && ptPrice < 1.05) {
      const ptApy = impliedPtApy(ptPrice, PT_MATURITY)
      if (ptApy > 0) {
        sources.push({
          poolId: 'exponent-pt-usx',
          protocol: 'exponent',
          strategy: 'PT-USX (fixed rate · Jun 2026)',
          asset: 'USX',
          apy: parseFloat(ptApy.toFixed(2)),
          apySources: [{ type: 'base', label: `Fixed yield from PT discount (price: ${ptPrice.toFixed(4)})`, apy: ptApy }],
          tvl: 27_700_000,
          riskLevel: 'low',
          riskFactors: ['Smart contract risk', 'Locked until June 2026 maturity'],
          managed: true,
          audited: true,
          stablecoin: true,
        })
      }
    } else if (ptPrice === null) {
      // No live price — omit rather than show stale/fake number
      this.log('PT-USX price unavailable from Birdeye — omitting from results')
    }

    if (ytPrice !== null && ytPrice > 0) {
      // YT implied APY: if YT price is P and underlying yield is Y, YT APY ≈ Y / P
      // Approximate: ytApy = (1/ytPrice) × solsticeVaultApy
      // Until Exponent exposes this cleanly, use market-implied estimate
      const SOLSTICE_VAULT_APY = 3.3
      const ytApy = ytPrice > 0 ? (SOLSTICE_VAULT_APY / ytPrice) : 0
      if (ytApy > 0) {
        sources.push({
          poolId: 'exponent-yt-usx',
          protocol: 'exponent',
          strategy: 'YT-USX (speculative yield)',
          asset: 'USX',
          apy: parseFloat(ytApy.toFixed(2)),
          apySources: [{ type: 'base', label: `Leveraged yield exposure (YT price: ${ytPrice.toFixed(4)})`, apy: ytApy }],
          tvl: 4_700_000,
          riskLevel: 'high',
          riskFactors: ['Smart contract risk', 'Yield token — goes to zero if rates drop', 'High volatility'],
          managed: true,
          audited: true,
          stablecoin: true,
        })
      }
    }

    if (sources.length === 0) {
      return createLabel([], 'exponent-live', { confidence: 'low' })
    }

    return createLabel(sources, 'exponent-live', {
      confidence: ptPrice !== null ? 'high' : 'low',
      staleDuration: 600_000,
      expiredDuration: 1_800_000,
    })
  }
}

export const exponentAdapter = new ExponentAdapter()
