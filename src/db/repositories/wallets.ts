import { query, run, queryRows, persistDb } from '../engine'

export interface WalletRow {
  address: string
  label: string | null
  connected_at: number
  last_seen: number
}

export async function upsertWallet(address: string, label?: string): Promise<void> {
  const now = Date.now()
  await run(
    `INSERT INTO wallets (address, label, connected_at, last_seen)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET last_seen = ?, label = COALESCE(?, label)`,
    [address, label ?? null, now, now, now, label ?? null]
  )
  await persistDb()
}

export async function getWallet(address: string): Promise<WalletRow | null> {
  const result = await query('SELECT * FROM wallets WHERE address = ?', [address])
  const rows = queryRows(result, (obj) => obj as unknown as WalletRow)
  return rows[0] ?? null
}

export async function getAllWallets(): Promise<WalletRow[]> {
  const result = await query('SELECT * FROM wallets ORDER BY last_seen DESC')
  return queryRows(result, (obj) => obj as unknown as WalletRow)
}
