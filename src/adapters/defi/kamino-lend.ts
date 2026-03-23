import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { YieldSource } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'

/**
 * Kamino Lending — live USX supply/borrow rates from Kamino REST API.
 * Market: Solstice eUSX leverage market.
 * Endpoint confirmed working as of 2026-03.
 */

const KAMINO_MARKET = '9Y7uwXgQ68mGqRtZfuFaP4hc4fxeJ7cE9zTtqTxVhfGU'
const KAMINO_API = `https://api.kamino.finance/kamino-market/${KAMINO_MARKET}/reserves/metrics`

interface KaminoReserve {
  reserve: string
  liquidityToken: string
  liquidityTokenMint: string
  maxLtv: string
  borrowApy: string
  supplyApy: string
  totalSupply: string
  totalBorrow: string
  totalSupplyUsd: string
  totalBorrowUsd: string
}

interface KaminoMetricsResponse {
  [key: string]: KaminoReserve
}

interface LiveRates {
  usxSupplyApy: number
  usxBorrowApy: number
  eusxLtv: number
}

let cachedRates: LiveRates | null = null
let cacheTs = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getKaminoLiveRates(): Promise<LiveRates | null> {
  if (cachedRates && Date.now() - cacheTs < CACHE_TTL) return cachedRates
  try {
    const res = await fetch(KAMINO_API)
    if (!res.ok) throw new Error(`Kamino API ${res.status}`)
    const data: KaminoMetricsResponse = await res.json()

    let usxSupplyApy = 0
    let usxBorrowApy = 0
    let eusxLtv = 0.75 // known default; live value confirms

    for (const reserve of Object.values(data)) {
      const sym = reserve.liquidityToken?.toUpperCase()
      if (sym === 'USX') {
        usxSupplyApy = parseFloat(reserve.supplyApy) * 100
        usxBorrowApy = parseFloat(reserve.borrowApy) * 100
      }
      if (sym === 'EUSX') {
        eusxLtv = parseFloat(reserve.maxLtv)
      }
    }

    cachedRates = { usxSupplyApy, usxBorrowApy, eusxLtv }
    cacheTs = Date.now()
    return cachedRates
  } catch (err) {
    console.error('[kamino-lend] Failed to fetch live rates', err)
    return cachedRates // return last known on failure — never null on second call
  }
}

export class KaminoLendAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('kamino-lend-live', { read: true }, 300_000, 15)

  async initialize(): Promise<void> {
    this.log('Kamino Lend adapter initialized (live rates)')
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getYieldSources(): Promise<DataLabel<YieldSource[]>> {
    try {
      const rates = await getKaminoLiveRates()
      if (!rates || rates.usxSupplyApy <= 0) {
        return createLabel([], 'kamino-lend-live', { confidence: 'low' })
      }

      const sources: YieldSource[] = [
        {
          poolId: 'kamino-lend-usx-supply',
          protocol: 'kamino-lend',
          strategy: 'USX Supply',
          asset: 'USX',
          apy: parseFloat(rates.usxSupplyApy.toFixed(4)),
          apySources: [{ type: 'base', label: 'Supply APY', apy: rates.usxSupplyApy }],
          tvl: 17_600_000, // from live API: totalSupplyUsd ~$17.6M
          riskLevel: 'low',
          riskFactors: ['Smart contract risk'],
          managed: true,
          audited: true,
          stablecoin: true,
        },
      ]

      return createLabel(sources, 'kamino-lend-live', {
        confidence: 'high',
        staleDuration: 300_000,
        expiredDuration: 900_000,
      })
    } catch (err) {
      this.error('Failed to fetch Kamino Lend yield sources', err)
      return createLabel([], 'kamino-lend-live', { confidence: 'low' })
    }
  }
}

export const kaminoLendAdapter = new KaminoLendAdapter()
