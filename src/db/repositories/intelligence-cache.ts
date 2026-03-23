import { query, run, persistDb } from '../engine'

export interface CachedIntelligence {
  id: string
  promptHash: string
  response: unknown
  contextHash: string
  createdAt: number
  expiresAt: number
}

export async function getCachedIntelligence(promptHash: string, contextHash: string): Promise<unknown | null> {
  const result = await query(
    `SELECT response FROM intelligence_cache
     WHERE prompt_hash = ? AND context_hash = ? AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`,
    [promptHash, contextHash, Date.now()]
  )
  if (!result.length || !result[0].values.length) return null
  return JSON.parse(result[0].values[0][0] as string)
}

export async function cacheIntelligence(
  promptHash: string,
  contextHash: string,
  response: unknown,
  ttlMs = 300_000
): Promise<void> {
  const now = Date.now()
  const id = `intel-${now}-${Math.random().toString(36).slice(2, 8)}`
  await run(
    `INSERT INTO intelligence_cache (id, prompt_hash, response, context_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, promptHash, JSON.stringify(response), contextHash, now, now + ttlMs]
  )
  await persistDb()
}

export async function clearExpiredCache(): Promise<void> {
  await run('DELETE FROM intelligence_cache WHERE expires_at < ?', [Date.now()])
  await persistDb()
}
