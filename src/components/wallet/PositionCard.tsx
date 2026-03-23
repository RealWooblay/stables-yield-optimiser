import type { Position } from '@/core/defi'
import { RiskBadge } from '@/components/primitives/RiskBadge'

interface PositionCardProps {
  position: Position
  onClick?: () => void
}

export function PositionCard({ position, onClick }: PositionCardProps) {
  const dailyEarning = (position.valueUsd * position.apy) / 365 / 100

  return (
    <div
      className="glass-panel p-5 hover:border-accent-blue/15 transition-all duration-300 cursor-pointer btn-press group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-text-primary group-hover:text-accent-blue transition-colors">{position.strategy}</div>
          <div className="text-xs text-text-muted capitalize mt-0.5">{position.protocol}</div>
        </div>
        <RiskBadge level={position.riskLevel} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Value</div>
          <div className="text-sm font-mono font-semibold text-text-primary">
            ${position.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">APY</div>
          <div className="text-sm font-mono font-semibold text-accent-green">
            {position.apy.toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Daily</div>
          <div className="text-sm font-mono font-semibold text-accent-green">
            +${dailyEarning.toFixed(2)}
          </div>
        </div>
      </div>

      {position.apySources.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border-primary/50">
          <div className="flex flex-wrap gap-1.5">
            {position.apySources.map((source, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-md bg-bg-tertiary/80 text-text-secondary font-mono"
              >
                {source.label}: {source.apy.toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
