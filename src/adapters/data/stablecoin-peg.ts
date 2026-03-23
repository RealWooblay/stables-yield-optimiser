import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { StablecoinPeg } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'

const STABLECOINS = [
  { id: 'usd-coin', token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC' },
  { id: 'tether', token: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT' },
  { id: null, token: '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', symbol: 'USX' },
]

export class StablecoinPegAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('stablecoin-peg', {
    read: true,
    realtime: true,
  }, 60_000, 8)

  async initialize(): Promise<void> {
    this.log('Stablecoin peg monitor initialized')
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getPegs(): Promise<DataLabel<StablecoinPeg[]>> {
    try {
      const coingeckoIds = STABLECOINS.filter((s) => s.id !== null).map((s) => s.id).join(',')
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=usd`
      )
      const data = await response.json()

      const pegs: StablecoinPeg[] = STABLECOINS.map((stable) => {
        // USX has no CoinGecko ID — treat as $1 peg
        const price = stable.id ? ((data[stable.id]?.usd as number) ?? 1.0) : 1.0
        return {
          token: stable.token,
          symbol: stable.symbol,
          price,
          deviation: Math.abs(price - 1.0),
          timestamp: Date.now(),
        }
      })

      return createLabel(pegs, 'stablecoin-peg', {
        confidence: 'high',
        staleDuration: 60_000,
        expiredDuration: 300_000,
      })
    } catch (err) {
      this.error('Failed to fetch peg data', err)
      // Return safe defaults
      const pegs: StablecoinPeg[] = STABLECOINS.map((s) => ({
        token: s.token,
        symbol: s.symbol,
        price: 1.0,
        deviation: 0,
        timestamp: Date.now(),
      }))
      return createLabel(pegs, 'stablecoin-peg', { confidence: 'low' })
    }
  }
}

export const stablecoinPegAdapter = new StablecoinPegAdapter()
