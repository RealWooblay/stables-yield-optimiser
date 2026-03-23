import { useState, useMemo } from 'react'
import { usePositionStore } from '@/stores/position-store'
import { useYieldStore } from '@/stores/yield-store'
import { useUIStore } from '@/stores/ui-store'
import { useWallet } from '@solana/wallet-adapter-react'
import { optimizePortfolio, type RiskProfile, type PortfolioSuggestion } from '@/intelligence/portfolio-optimizer'
import { RiskBadge } from '@/components/primitives/RiskBadge'
import type { RiskLevel } from '@/core/defi'

const PROFILES: { id: RiskProfile; label: string; desc: string }[] = [
  { id: 'conservative', label: 'Conservative', desc: 'Low risk, stable yields' },
  { id: 'balanced', label: 'Balanced', desc: 'Mix of safety and growth' },
  { id: 'aggressive', label: 'Aggressive', desc: 'Maximum yield, higher risk' },
]

export function PortfolioOptimizer() {
  const { connected } = useWallet()
  const { positions } = usePositionStore()
  const { sources, pegs } = useYieldStore()
  const openActionPanel = useUIStore((s) => s.openActionPanel)
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('balanced')

  const suggestion = useMemo<PortfolioSuggestion | null>(() => {
    const positionList = positions?.value ?? []
    const sourceList = sources?.value ?? []
    if (!sourceList.length) return null
    return optimizePortfolio(positionList, sourceList, riskProfile, pegs?.value ?? undefined)
  }, [positions, sources, pegs, riskProfile])

  if (!connected || !suggestion) return null

  return (
    <div className="glass-panel p-5 md:p-6 space-y-5 fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-accent-blue text-sm">⚡</span>
            <h2 className="text-sm font-bold text-text-primary tracking-tight">Portfolio Optimizer</h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Optimal allocation across all protocols based on your risk profile
          </p>
        </div>
        <div className="flex gap-1 bg-bg-tertiary/60 rounded-xl p-0.5">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => setRiskProfile(p.id)}
              className={`btn-press px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all duration-200 ${
                riskProfile === p.id
                  ? 'bg-accent-blue text-white shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
              title={p.desc}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-bg-tertiary/50 rounded-xl p-3.5 text-center">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Current</div>
          <div className="font-mono font-semibold text-text-primary">{suggestion.currentBlendedApy.toFixed(2)}%</div>
        </div>
        <div className="bg-bg-tertiary/50 rounded-xl p-3.5 text-center">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Suggested</div>
          <div className="font-mono font-semibold text-accent-green">{suggestion.suggestedBlendedApy.toFixed(2)}%</div>
        </div>
        <div className="bg-bg-tertiary/50 rounded-xl p-3.5 text-center">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Improvement</div>
          <div className={`font-mono font-semibold ${suggestion.apyImprovement >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {suggestion.apyImprovement >= 0 ? '+' : ''}{suggestion.apyImprovement.toFixed(2)}%
          </div>
        </div>
        <div className="bg-bg-tertiary/50 rounded-xl p-3.5 text-center">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Total Value</div>
          <div className="font-mono font-semibold text-text-primary">${suggestion.totalValue.toLocaleString()}</div>
        </div>
      </div>

      {suggestion.allocations.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Suggested Allocation</div>
          {suggestion.allocations.map((alloc, i) => {
            const changed = Math.abs(alloc.suggestedAllocation - alloc.currentAllocation) >= 5
            return (
              <div key={i} className="flex items-center justify-between p-3.5 bg-bg-tertiary/40 rounded-xl hover:bg-bg-tertiary/60 transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 text-center shrink-0">
                    <div className="text-sm font-mono font-bold text-accent-blue">
                      {alloc.suggestedAllocation.toFixed(0)}%
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-text-primary capitalize truncate font-medium">
                      {alloc.source.protocol} — {alloc.source.strategy}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono text-accent-green font-semibold">
                        {alloc.source.apy.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-text-muted">
                        ${alloc.suggestedValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                      <RiskBadge level={alloc.source.riskLevel as RiskLevel} showLabel={false} />
                    </div>
                  </div>
                </div>
                {changed && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-lg ${
                    alloc.currentAllocation === 0
                      ? 'bg-accent-green/8 text-accent-green'
                      : 'bg-accent-blue/8 text-accent-blue'
                  }`}>
                    {alloc.currentAllocation === 0 ? 'New' : 'Rebalance'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted text-center py-6">
          Your portfolio looks well-optimized for this risk profile.
        </p>
      )}

      {suggestion.actions.length > 0 && (
        <button
          onClick={() => {
            if (suggestion.actions[0]) openActionPanel(suggestion.actions[0])
          }}
          className="btn-primary w-full py-3"
        >
          Review {suggestion.actions.length} Transaction{suggestion.actions.length > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}
