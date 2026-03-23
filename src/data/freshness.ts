import { type DataLabel, type DataFreshness, createLabel, getFreshness } from '@/core/types'

export { createLabel, getFreshness }

export function isUsable<T>(label: DataLabel<T> | null): label is DataLabel<T> {
  if (!label) return false
  return getFreshness(label) !== 'expired'
}

export function getAge(label: DataLabel<unknown>): number {
  return Date.now() - label.timestamp
}

export function formatAge(label: DataLabel<unknown>): string {
  const age = getAge(label)
  if (age < 1000) return 'just now'
  if (age < 60_000) return `${Math.floor(age / 1000)}s ago`
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`
  return `${Math.floor(age / 3_600_000)}h ago`
}

export function freshnessColor(freshness: DataFreshness): string {
  switch (freshness) {
    case 'fresh': return 'var(--color-fresh)'
    case 'stale': return 'var(--color-stale)'
    case 'expired': return 'var(--color-expired)'
  }
}
