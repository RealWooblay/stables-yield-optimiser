import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { YieldSource } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'
import { defiLlamaAdapter } from '@/adapters/data/defillama'

const MARINADE_SLUGS = ['marinade-finance', 'marinade']

export class MarinadeAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('marinade', {
    read: true,
    write: true,
  }, 60_000, 10)

  async initialize(): Promise<void> {
    this.log('Marinade adapter initialized')
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getYieldSources(): Promise<DataLabel<YieldSource[]>> {
    try {
      const result = await defiLlamaAdapter.getYieldSourcesByProtocol(MARINADE_SLUGS)
      const enriched = result.value.map((s) => ({
        ...s,
        protocol: 'marinade',
        audited: true,
        managed: true,
        riskFactors: [...s.riskFactors.filter((f) => f !== 'Price volatility'), 'Validator slashing risk'],
      }))
      return createLabel(enriched, 'marinade+defillama', {
        confidence: 'high',
        staleDuration: 300_000,
      })
    } catch (err) {
      this.error('Failed to fetch Marinade yield sources', err)
      return createLabel([], 'marinade', { confidence: 'low' })
    }
  }
}

export const marinadeAdapter = new MarinadeAdapter()
