import type { YieldSource, ApySource, RiskLevel } from '../../core/defi'
import { query, run, queryRows, persistDb } from '../engine'

export async function upsertYieldSource(source: YieldSource): Promise<void> {
  const id = `${source.protocol}-${source.strategy}-${source.asset}`
  await run(
    `INSERT INTO yield_sources (id, protocol, strategy, asset, apy, apy_sources, tvl, risk_level, risk_factors, managed, audited, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       apy = ?, apy_sources = ?, tvl = ?, risk_level = ?, risk_factors = ?, updated_at = ?`,
    [
      id, source.protocol, source.strategy, source.asset, source.apy,
      JSON.stringify(source.apySources), source.tvl, source.riskLevel,
      JSON.stringify(source.riskFactors), source.managed ? 1 : 0, source.audited ? 1 : 0, Date.now(),
      source.apy, JSON.stringify(source.apySources), source.tvl,
      source.riskLevel, JSON.stringify(source.riskFactors), Date.now(),
    ]
  )
  await persistDb()
}

function mapRow(obj: Record<string, unknown>): YieldSource {
  return {
    protocol: obj.protocol as string,
    strategy: obj.strategy as string,
    asset: obj.asset as string,
    apy: obj.apy as number,
    apySources: JSON.parse(obj.apy_sources as string) as ApySource[],
    tvl: obj.tvl as number,
    riskLevel: obj.risk_level as RiskLevel,
    riskFactors: JSON.parse(obj.risk_factors as string) as string[],
    managed: obj.managed === 1,
    audited: obj.audited === 1,
  }
}

export async function getYieldSourcesByProtocol(protocol: string): Promise<YieldSource[]> {
  const result = await query('SELECT * FROM yield_sources WHERE protocol = ?', [protocol])
  return queryRows(result, mapRow)
}

export async function getAllYieldSources(): Promise<YieldSource[]> {
  const result = await query('SELECT * FROM yield_sources ORDER BY apy DESC')
  return queryRows(result, mapRow)
}
