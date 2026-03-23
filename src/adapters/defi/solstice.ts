import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { YieldSource } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'

/**
 * Solstice USX YieldVault — base yield earned by locking USX.
 * eUSX is the receipt token for this vault.
 * APY confirmed by Solstice team: 3.3% (update SOLSTICE_VAULT_APY when it changes).
 */
const SOLSTICE_VAULT_APY = 3.3

export class SolsticeAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('solstice', { read: true }, 300_000, 10)

  async initialize(): Promise<void> {
    this.log('Solstice adapter initialized')
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getYieldSources(): Promise<DataLabel<YieldSource[]>> {
    const sources: YieldSource[] = [
      {
        poolId: 'solstice-usx-vault',
        protocol: 'solstice',
        strategy: 'USX YieldVault',
        asset: 'USX',
        apy: SOLSTICE_VAULT_APY,
        apySources: [{ type: 'base', label: 'Delta-neutral vault yield', apy: SOLSTICE_VAULT_APY }],
        tvl: 200_000_000,
        riskLevel: 'low',
        riskFactors: ['Smart contract risk', 'Delta-neutral strategy risk'],
        managed: true,
        audited: true,
        stablecoin: true,
      },
    ]

    return createLabel(sources, 'solstice', {
      confidence: 'medium',
      staleDuration: 3_600_000, // 1h — rate changes slowly
      expiredDuration: 86_400_000,
    })
  }
}

export const solsticeAdapter = new SolsticeAdapter()
