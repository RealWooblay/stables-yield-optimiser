import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { YieldSource } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'
import { defiLlamaAdapter } from '@/adapters/data/defillama'

const DRIFT_SLUGS = ['drift', 'drift-protocol']

export class DriftAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('drift', {
    read: true,
    write: true,
    historical: true,
  }, 30_000, 12)

  async initialize(): Promise<void> {
    this.log('Drift adapter initialized')
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getYieldSources(): Promise<DataLabel<YieldSource[]>> {
    try {
      const result = await defiLlamaAdapter.getYieldSourcesByProtocol(DRIFT_SLUGS)
      const enriched = result.value.map((s) => ({
        ...s,
        protocol: 'drift',
        audited: true,
        managed: true,
      }))
      return createLabel(enriched, 'drift+defillama', {
        confidence: 'high',
        staleDuration: 300_000,
      })
    } catch (err) {
      this.error('Failed to fetch Drift yield sources', err)
      return createLabel([], 'drift', { confidence: 'low' })
    }
  }
}

export const driftAdapter = new DriftAdapter()
