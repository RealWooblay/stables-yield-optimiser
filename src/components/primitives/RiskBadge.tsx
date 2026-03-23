import type { RiskLevel } from '@/core/defi'

interface RiskBadgeProps {
  level: RiskLevel
  showLabel?: boolean
}

const RISK_CONFIG: Record<RiskLevel, { dot: string; text: string; bg: string; label: string }> = {
  low: { dot: 'bg-accent-green', text: 'text-accent-green', bg: 'bg-accent-green/8', label: 'Low' },
  medium: { dot: 'bg-accent-yellow', text: 'text-accent-yellow', bg: 'bg-accent-yellow/8', label: 'Med' },
  high: { dot: 'bg-accent-red', text: 'text-accent-red', bg: 'bg-accent-red/8', label: 'High' },
  critical: { dot: 'bg-accent-red', text: 'text-accent-red', bg: 'bg-accent-red/12', label: 'Critical' },
}

export function RiskBadge({ level, showLabel = true }: RiskBadgeProps) {
  const config = RISK_CONFIG[level]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider ${config.text} ${config.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {showLabel && config.label}
    </span>
  )
}
