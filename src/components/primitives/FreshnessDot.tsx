import { getFreshness, type DataLabel } from '@/core/types'

interface FreshnessDotProps {
  label: DataLabel<unknown>
  showAge?: boolean
}

export function FreshnessDot({ label, showAge }: FreshnessDotProps) {
  const freshness = getFreshness(label)
  const age = Date.now() - label.timestamp

  const formatAge = () => {
    if (age < 1000) return 'now'
    if (age < 60_000) return `${Math.floor(age / 1000)}s`
    if (age < 3_600_000) return `${Math.floor(age / 60_000)}m`
    return `${Math.floor(age / 3_600_000)}h`
  }

  const colorClass = freshness === 'fresh'
    ? 'bg-fresh shadow-[0_0_6px_var(--color-fresh)]'
    : freshness === 'stale'
    ? 'bg-stale'
    : 'bg-expired'

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${colorClass}`} />
      {showAge && (
        <span className="text-xs text-text-muted font-mono">{formatAge()}</span>
      )}
    </div>
  )
}
