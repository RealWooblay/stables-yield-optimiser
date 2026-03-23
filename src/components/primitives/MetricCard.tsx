import { type DataLabel } from '@/core/types'
import { FreshnessDot } from './FreshnessDot'

interface MetricCardProps {
  title: string
  value: string
  subtitle?: string
  label?: DataLabel<unknown>
  trend?: { value: number; label: string }
  icon?: React.ReactNode
  className?: string
}

export function MetricCard({ title, value, subtitle, label, trend, icon, className = '' }: MetricCardProps) {
  return (
    <div className={`glass-panel p-4 md:p-5 metric-glow group hover:border-accent-blue/15 transition-all duration-300 ${className}`}>
      <div className="flex items-start justify-between mb-2.5">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-2">
          {label && <FreshnessDot label={label} showAge />}
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-text-primary font-mono tracking-tight">{value}</div>
      <div className="flex items-center justify-between mt-1.5">
        {subtitle && <span className="text-xs text-text-muted">{subtitle}</span>}
        {trend && (
          <span
            className={`text-xs font-mono font-semibold ${
              trend.value >= 0 ? 'text-accent-green' : 'text-accent-red'
            }`}
          >
            {trend.value >= 0 ? '+' : ''}{trend.value.toFixed(2)}% {trend.label}
          </span>
        )}
      </div>
    </div>
  )
}
