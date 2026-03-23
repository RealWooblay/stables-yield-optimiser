import type { ActionDiff } from '../../core/mutation'
import { query, run, queryRows, persistDb } from '../engine'

export interface ActionHistoryRow {
  id: string
  wallet: string
  actionType: string
  protocol: string
  strategy: string
  diff: ActionDiff
  status: string
  txSignatures: string[]
  createdAt: number
  completedAt: number | null
}

export async function insertAction(wallet: string, diff: ActionDiff): Promise<string> {
  const id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await run(
    `INSERT INTO action_history (id, wallet, action_type, protocol, strategy, diff, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [id, wallet, diff.type, diff.protocol, diff.strategy, JSON.stringify(diff), Date.now()]
  )
  await persistDb()
  return id
}

export async function updateActionStatus(
  id: string,
  status: string,
  txSignatures?: string[]
): Promise<void> {
  const completedAt = status === 'completed' || status === 'failed' ? Date.now() : null
  await run(
    `UPDATE action_history SET status = ?, tx_signatures = ?, completed_at = ? WHERE id = ?`,
    [status, txSignatures ? JSON.stringify(txSignatures) : null, completedAt, id]
  )
  await persistDb()
}

export async function getActionHistory(wallet: string): Promise<ActionHistoryRow[]> {
  const result = await query(
    'SELECT * FROM action_history WHERE wallet = ? ORDER BY created_at DESC',
    [wallet]
  )
  return queryRows(result, (obj) => ({
    id: obj.id as string,
    wallet: obj.wallet as string,
    actionType: obj.action_type as string,
    protocol: obj.protocol as string,
    strategy: obj.strategy as string,
    diff: JSON.parse(obj.diff as string) as ActionDiff,
    status: obj.status as string,
    txSignatures: obj.tx_signatures ? JSON.parse(obj.tx_signatures as string) as string[] : [],
    createdAt: obj.created_at as number,
    completedAt: (obj.completed_at as number) ?? null,
  }))
}
