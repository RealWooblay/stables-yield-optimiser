export type DataFreshness = 'fresh' | 'stale' | 'expired'

export type DataConfidence = 'high' | 'medium' | 'low'

export interface DataLabel<T> {
  value: T
  timestamp: number
  source: string
  freshness: DataFreshness
  confidence: DataConfidence
  staleDuration: number // ms before becoming stale
  expiredDuration: number // ms before becoming expired
}

export function createLabel<T>(
  value: T,
  source: string,
  opts?: { confidence?: DataConfidence; staleDuration?: number; expiredDuration?: number }
): DataLabel<T> {
  return {
    value,
    timestamp: Date.now(),
    source,
    freshness: 'fresh',
    confidence: opts?.confidence ?? 'medium',
    staleDuration: opts?.staleDuration ?? 30_000,
    expiredDuration: opts?.expiredDuration ?? 120_000,
  }
}

export function getFreshness<T>(label: DataLabel<T>): DataFreshness {
  const age = Date.now() - label.timestamp
  if (age > label.expiredDuration) return 'expired'
  if (age > label.staleDuration) return 'stale'
  return 'fresh'
}

export function refreshLabel<T>(label: DataLabel<T>, value: T): DataLabel<T> {
  return { ...label, value, timestamp: Date.now(), freshness: 'fresh' }
}
