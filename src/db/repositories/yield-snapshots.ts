import { query, run, queryRows, persistDb } from '../engine'
import type { YieldSource } from '../../core/defi'

export interface YieldSnapshot {
  id: string
  poolId: string | null
  protocol: string
  strategy: string
  asset: string
  apy: number
  tvl: number
  snapshotAt: number
}

export async function insertYieldSnapshot(source: YieldSource): Promise<void> {
  const id = `snap-${source.protocol}-${source.strategy}-${Date.now()}`
  await run(
    `INSERT INTO yield_snapshots (id, pool_id, protocol, strategy, asset, apy, tvl, snapshot_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, source.poolId ?? null, source.protocol, source.strategy, source.asset, source.apy, source.tvl, Date.now()]
  )
  await persistDb()
}

export async function insertYieldSnapshots(sources: YieldSource[]): Promise<void> {
  const now = Date.now()
  for (const source of sources) {
    const id = `snap-${source.protocol}-${source.strategy}-${now}-${Math.random().toString(36).slice(2, 6)}`
    await run(
      `INSERT INTO yield_snapshots (id, pool_id, protocol, strategy, asset, apy, tvl, snapshot_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, source.poolId ?? null, source.protocol, source.strategy, source.asset, source.apy, source.tvl, now]
    )
  }
  await persistDb()
}

export async function getYieldHistory(
  protocol: string,
  strategy: string,
  since: number
): Promise<YieldSnapshot[]> {
  const result = await query(
    `SELECT * FROM yield_snapshots
     WHERE protocol = ? AND strategy = ? AND snapshot_at >= ?
     ORDER BY snapshot_at ASC`,
    [protocol, strategy, since]
  )
  return queryRows(result, (obj) => ({
    id: obj.id as string,
    poolId: (obj.pool_id as string) ?? null,
    protocol: obj.protocol as string,
    strategy: obj.strategy as string,
    asset: obj.asset as string,
    apy: obj.apy as number,
    tvl: obj.tvl as number,
    snapshotAt: obj.snapshot_at as number,
  }))
}

export async function cleanOldSnapshots(olderThan: number): Promise<void> {
  await run('DELETE FROM yield_snapshots WHERE snapshot_at < ?', [olderThan])
  await persistDb()
}
