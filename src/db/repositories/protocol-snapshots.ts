import type { ProtocolHealth } from '../../core/defi'
import { query, run, queryRows, persistDb } from '../engine'

export async function insertSnapshot(snapshot: ProtocolHealth): Promise<void> {
  const id = `${snapshot.protocol}-${Date.now()}`
  await run(
    `INSERT INTO protocol_snapshots (id, protocol, tvl, tvl_change_24h, tvl_change_7d, apy, status, snapshot_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, snapshot.protocol, snapshot.tvl, snapshot.tvlChange24h, snapshot.tvlChange7d, null, snapshot.status, Date.now()]
  )
  await persistDb()
}

export async function getSnapshots(protocol: string, since: number): Promise<ProtocolHealth[]> {
  const result = await query(
    'SELECT * FROM protocol_snapshots WHERE protocol = ? AND snapshot_at >= ? ORDER BY snapshot_at ASC',
    [protocol, since]
  )
  return queryRows(result, (obj) => ({
    protocol: obj.protocol as string,
    tvl: obj.tvl as number,
    tvlChange24h: (obj.tvl_change_24h as number) ?? 0,
    tvlChange7d: (obj.tvl_change_7d as number) ?? 0,
    status: obj.status as 'healthy' | 'warning' | 'critical',
  }))
}
