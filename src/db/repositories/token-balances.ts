import type { TokenBalance } from '../../core/defi'
import { query, run, queryRows, persistDb } from '../engine'

export async function upsertTokenBalance(wallet: string, balance: TokenBalance): Promise<void> {
  const id = `${wallet}-${balance.mint}`
  await run(
    `INSERT INTO token_balances (id, wallet, mint, symbol, name, amount, decimals, ui_amount, value_usd, logo_uri, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       amount = ?, ui_amount = ?, value_usd = ?, updated_at = ?`,
    [
      id, wallet, balance.mint, balance.symbol, balance.name,
      balance.amount, balance.decimals, balance.uiAmount, balance.valueUsd,
      balance.logoUri ?? null, Date.now(),
      balance.amount, balance.uiAmount, balance.valueUsd, Date.now(),
    ]
  )
  await persistDb()
}

export async function getTokenBalancesByWallet(wallet: string): Promise<TokenBalance[]> {
  const result = await query('SELECT * FROM token_balances WHERE wallet = ? ORDER BY value_usd DESC', [wallet])
  return queryRows(result, (obj) => ({
    mint: obj.mint as string,
    symbol: obj.symbol as string,
    name: obj.name as string,
    amount: obj.amount as number,
    decimals: obj.decimals as number,
    uiAmount: obj.ui_amount as number,
    valueUsd: obj.value_usd as number,
    logoUri: (obj.logo_uri as string) || undefined,
  }))
}
