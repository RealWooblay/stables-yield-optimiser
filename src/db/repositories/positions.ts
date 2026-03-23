import type { Position, ApySource, RiskLevel } from '../../core/defi'
import { query, run, queryRows, persistDb } from '../engine'

export async function upsertPosition(position: Position): Promise<void> {
  await run(
    `INSERT INTO positions (id, wallet, protocol, strategy, asset, amount, value_usd, apy, apy_sources, risk_level, risk_factors, entry_timestamp, last_update)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       amount = ?, value_usd = ?, apy = ?, apy_sources = ?, risk_level = ?, risk_factors = ?, last_update = ?`,
    [
      position.id, position.wallet, position.protocol, position.strategy,
      position.asset, position.amount, position.valueUsd, position.apy,
      JSON.stringify(position.apySources), position.riskLevel,
      JSON.stringify(position.riskFactors), position.entryTimestamp, position.lastUpdate,
      position.amount, position.valueUsd, position.apy,
      JSON.stringify(position.apySources), position.riskLevel,
      JSON.stringify(position.riskFactors), position.lastUpdate,
    ]
  )
  await persistDb()
}

export async function getPositionsByWallet(wallet: string): Promise<Position[]> {
  const result = await query('SELECT * FROM positions WHERE wallet = ?', [wallet])
  return queryRows(result, (obj) => ({
    id: obj.id as string,
    wallet: obj.wallet as string,
    protocol: obj.protocol as string,
    strategy: obj.strategy as string,
    asset: obj.asset as string,
    amount: obj.amount as number,
    valueUsd: obj.value_usd as number,
    apy: obj.apy as number,
    apySources: JSON.parse(obj.apy_sources as string) as ApySource[],
    riskLevel: obj.risk_level as RiskLevel,
    riskFactors: JSON.parse(obj.risk_factors as string) as string[],
    entryTimestamp: obj.entry_timestamp as number,
    lastUpdate: obj.last_update as number,
  }))
}

export async function deletePosition(id: string): Promise<void> {
  await run('DELETE FROM positions WHERE id = ?', [id])
  await persistDb()
}
