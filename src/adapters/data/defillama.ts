import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'
import type { YieldSource } from '@/core/defi'
import { createLabel } from '@/core/types'
import type { DataLabel } from '@/core/types'

export interface DefiLlamaPool {
  pool: string
  chain: string
  project: string
  symbol: string
  tvlUsd: number
  apy: number
  apyBase: number | null
  apyReward: number | null
  stablecoin: boolean
  ilRisk: string | null
  exposure: string | null
  apyMean30d: number | null
  underlyingTokens: string[] | null
}

const CACHE_TTL_MS = 120_000

const AUDITED_PROTOCOLS = new Set([
  'kamino', 'kamino-lend', 'kamino-liquidity',
  'marinade-finance', 'jito', 'drift',
  'raydium', 'raydium-amm', 'orca', 'orca-dex', 'solend', 'marginfi', 'jupiter',
  'loopscale', 'exponent', 'solstice-usx', 'solstice',
])

export class DefiLlamaAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('defillama', {
    read: true,
    historical: true,
  }, 300_000, 5)

  private baseUrl = 'https://yields.llama.fi'
  private poolCache: DefiLlamaPool[] = []
  private cacheTimestamp = 0
  private mintIndex: Map<string, DefiLlamaPool[]> = new Map()
  private symbolIndex: Map<string, DefiLlamaPool[]> = new Map()

  async initialize(): Promise<void> {
    this.log('DeFi Llama adapter initialized')
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/pools`)
      return response.ok
    } catch {
      return false
    }
  }

  private buildIndexes(pools: DefiLlamaPool[]): void {
    this.mintIndex.clear()
    this.symbolIndex.clear()

    for (const pool of pools) {
      if (pool.underlyingTokens) {
        for (const mint of pool.underlyingTokens) {
          const key = mint.toLowerCase()
          const existing = this.mintIndex.get(key) ?? []
          existing.push(pool)
          this.mintIndex.set(key, existing)
        }
      }

      const symbols = pool.symbol.split('-').map(s => s.trim().toUpperCase())
      for (const sym of symbols) {
        if (!sym) continue
        const existing = this.symbolIndex.get(sym) ?? []
        existing.push(pool)
        this.symbolIndex.set(sym, existing)
      }
    }
  }

  private async fetchPools(): Promise<DefiLlamaPool[]> {
    if (this.poolCache.length > 0 && Date.now() - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.poolCache
    }

    const response = await fetch(`${this.baseUrl}/pools`)
    const data = await response.json()

    this.poolCache = (data.data as DefiLlamaPool[]).filter(
      (p) => p.chain === 'Solana' && p.tvlUsd > 10_000 && p.apy != null
    )
    this.cacheTimestamp = Date.now()
    this.buildIndexes(this.poolCache)
    return this.poolCache
  }

  async ensureLoaded(): Promise<void> {
    await this.fetchPools()
  }

  async getPoolsByProtocol(slugs: string[]): Promise<DefiLlamaPool[]> {
    const pools = await this.fetchPools()
    const slugSet = new Set(slugs.map((s) => s.toLowerCase()))
    return pools.filter((p) => slugSet.has(p.project.toLowerCase()))
  }

  async getPoolsByMint(mint: string): Promise<DefiLlamaPool[]> {
    await this.fetchPools()
    return this.mintIndex.get(mint.toLowerCase()) ?? []
  }

  async getPoolsBySymbol(symbol: string): Promise<DefiLlamaPool[]> {
    await this.fetchPools()
    return this.symbolIndex.get(symbol.toUpperCase()) ?? []
  }

  async getBestPoolForToken(mint: string, symbol: string): Promise<DefiLlamaPool | null> {
    await this.fetchPools()

    let candidates = this.mintIndex.get(mint.toLowerCase()) ?? []

    if (candidates.length === 0 && symbol && symbol !== 'UNKNOWN') {
      candidates = this.symbolIndex.get(symbol.toUpperCase()) ?? []
    }

    if (candidates.length === 0) return null

    return candidates.reduce((best, pool) =>
      pool.apy > best.apy ? pool : best
    , candidates[0])
  }

  poolToYieldSource(pool: DefiLlamaPool): YieldSource {
    const isAudited = AUDITED_PROTOCOLS.has(pool.project.toLowerCase())
    /** Llama sometimes leaves `apy` null but fills apyBase + apyReward — avoid showing 0% incorrectly. */
    const effectiveApy =
      pool.apy != null && pool.apy > 0
        ? pool.apy
        : [pool.apyBase, pool.apyReward].filter((x): x is number => x != null && !Number.isNaN(x)).reduce((a, b) => a + b, 0)
    return {
      poolId: pool.pool,
      underlyingMints: pool.underlyingTokens ?? undefined,
      protocol: pool.project,
      strategy: pool.symbol,
      asset: pool.symbol.split('-')[0] ?? pool.symbol,
      apy: effectiveApy > 0 ? effectiveApy : pool.apy ?? 0,
      apySources: [
        ...(pool.apyBase ? [{ type: 'base' as const, label: 'Base APY', apy: pool.apyBase }] : []),
        ...(pool.apyReward ? [{ type: 'reward' as const, label: 'Reward APY', apy: pool.apyReward }] : []),
      ],
      tvl: pool.tvlUsd,
      // Risk based on TVL and protocol type — not APY (high APY ≠ high risk for audited stable pools)
      riskLevel: !isAudited ? 'high' : pool.tvlUsd < 500_000 ? 'medium' : 'low',
      riskFactors: [
        'Smart contract risk',
        ...(pool.stablecoin ? [] : ['Price volatility']),
        ...(pool.tvlUsd < 10_000_000 ? ['Low TVL'] : []),
        ...(pool.ilRisk === 'yes' ? ['Impermanent loss'] : []),
      ],
      managed: true,
      audited: isAudited,
      stablecoin: pool.stablecoin,
    }
  }

  async getYieldSourcesByProtocol(slugs: string[]): Promise<DataLabel<YieldSource[]>> {
    try {
      const pools = await this.getPoolsByProtocol(slugs)
      const sources = pools.map((p) => this.poolToYieldSource(p))
      return createLabel(sources, 'defillama', {
        confidence: 'high',
        staleDuration: 300_000,
        expiredDuration: 900_000,
      })
    } catch (err) {
      this.error(`Failed to fetch yields for ${slugs.join(', ')}`, err)
      return createLabel([], 'defillama', { confidence: 'low' })
    }
  }

  async getSolanaYields(): Promise<DataLabel<YieldSource[]>> {
    try {
      const pools = await this.fetchPools()

      const sources: YieldSource[] = pools
        .filter((p) => p.tvlUsd > 1_000_000)
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, 50)
        .map((pool) => this.poolToYieldSource(pool))

      return createLabel(sources, 'defillama', {
        confidence: 'medium',
        staleDuration: 300_000,
        expiredDuration: 900_000,
      })
    } catch (err) {
      this.error('Failed to fetch yields', err)
      return createLabel([], 'defillama', { confidence: 'low' })
    }
  }

  async getHistoricalApy(poolId: string): Promise<DataLabel<Array<{ timestamp: number; apy: number }>>> {
    try {
      const response = await fetch(`${this.baseUrl}/chart/${poolId}`)
      const data = await response.json()

      const history = (data.data as Array<{ timestamp: string; apy: number }>).map((d) => ({
        timestamp: new Date(d.timestamp).getTime(),
        apy: d.apy ?? 0,
      }))

      return createLabel(history, 'defillama', { confidence: 'medium', staleDuration: 300_000 })
    } catch (err) {
      this.error('Failed to fetch historical APY', err)
      return createLabel([], 'defillama', { confidence: 'low' })
    }
  }
}

export const defiLlamaAdapter = new DefiLlamaAdapter()
