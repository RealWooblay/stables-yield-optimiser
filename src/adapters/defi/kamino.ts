import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { YieldSource } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'
import { defiLlamaAdapter } from '@/adapters/data/defillama'

const KAMINO_SLUGS = ['kamino', 'kamino-lend', 'kamino-liquidity']

export class KaminoAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('kamino', {
    read: true,
    write: true,
    historical: true,
  }, 30_000, 15)

  async initialize(): Promise<void> {
    this.log('Kamino adapter initialized')
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getYieldSources(): Promise<DataLabel<YieldSource[]>> {
    try {
      const result = await defiLlamaAdapter.getYieldSourcesByProtocol(KAMINO_SLUGS)
      const enriched = result.value.map((s) => ({
        ...s,
        protocol: 'kamino',
        audited: true,
        managed: true,
      }))
      return createLabel(enriched, 'kamino+defillama', {
        confidence: 'high',
        staleDuration: 300_000,
      })
    } catch (err) {
      this.error('Failed to fetch Kamino yield sources', err)
      return createLabel([], 'kamino', { confidence: 'low' })
    }
  }
}

export const kaminoAdapter = new KaminoAdapter()
