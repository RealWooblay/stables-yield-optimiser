import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'

export interface PriceData {
  id: string
  symbol: string
  price: number
  change24h: number
  marketCap: number
}

export class CoinGeckoAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('coingecko', {
    read: true,
  }, 60_000, 5)

  private baseUrl = 'https://api.coingecko.com/api/v3'

  async initialize(): Promise<void> {
    this.log('CoinGecko adapter initialized')
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/ping`)
      return response.ok
    } catch {
      return false
    }
  }

  async getPrices(ids: string[]): Promise<DataLabel<PriceData[]>> {
    try {
      const idsParam = ids.join(',')
      const response = await fetch(
        `${this.baseUrl}/simple/price?ids=${idsParam}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`
      )
      const data = await response.json()

      const prices: PriceData[] = Object.entries(data).map(([id, info]) => {
        const priceInfo = info as Record<string, number>
        return {
          id,
          symbol: id,
          price: priceInfo.usd ?? 0,
          change24h: priceInfo.usd_24h_change ?? 0,
          marketCap: priceInfo.usd_market_cap ?? 0,
        }
      })

      return createLabel(prices, 'coingecko', {
        confidence: 'high',
        staleDuration: 60_000,
        expiredDuration: 300_000,
      })
    } catch (err) {
      this.error('Failed to fetch prices', err)
      return createLabel([], 'coingecko', { confidence: 'low' })
    }
  }
}

export const coinGeckoAdapter = new CoinGeckoAdapter()
