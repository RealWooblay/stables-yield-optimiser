import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { YieldSource } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'
import { defiLlamaAdapter } from '@/adapters/data/defillama'

const JITO_SLUGS = ['jito', 'jito-staking']

export class JitoAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('jito', {
    read: true,
    write: true,
  }, 60_000, 10)

  async initialize(): Promise<void> {
    this.log('Jito adapter initialized')
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getYieldSources(): Promise<DataLabel<YieldSource[]>> {
    try {
      const result = await defiLlamaAdapter.getYieldSourcesByProtocol(JITO_SLUGS)
      const enriched = result.value.map((s) => ({
        ...s,
        protocol: 'jito',
        audited: true,
        managed: true,
        riskFactors: [...s.riskFactors.filter((f) => f !== 'Price volatility'), 'Validator slashing risk', 'MEV dependency'],
      }))
      return createLabel(enriched, 'jito+defillama', {
        confidence: 'high',
        staleDuration: 300_000,
      })
    } catch (err) {
      this.error('Failed to fetch Jito yield sources', err)
      return createLabel([], 'jito', { confidence: 'low' })
    }
  }
}

export const jitoAdapter = new JitoAdapter()
