import { useState } from 'react'
import { useYieldStore } from '@/stores/yield-store'
import { useUIStore } from '@/stores/ui-store'
import { resolveIntent, type IntentResult } from '@/intelligence/intents'
import { isIntelligenceAvailable } from '@/intelligence/client'
import { RiskBadge } from '@/components/primitives/RiskBadge'
import type { RiskLevel } from '@/core/defi'

const EXAMPLE_INTENTS = [
  'I want 8% APY on $50k USDC with low risk',
  'Deploy $10k SOL across staking protocols for maximum yield',
  'Conservative stablecoin yield, at least 5% APY, audited protocols only',
  'Split $25k between high yield and safe positions, 60/40',
]

export function IntentPanel() {
  const [inputText, setInputText] = useState('')
  const [isResolving, setIsResolving] = useState(false)
  const [result, setResult] = useState<IntentResult | null>(null)
  const sources = useYieldStore((s) => s.sources)
  const pegs = useYieldStore((s) => s.pegs)
  const openActionPanel = useUIStore((s) => s.openActionPanel)

  if (!isIntelligenceAvailable()) return null

  const handleResolve = async () => {
    if (!inputText.trim() || !sources?.value.length) return
    setIsResolving(true)
    try {
      const res = await resolveIntent(inputText, sources.value, pegs?.value ?? undefined)
      setResult(res)
    } finally {
      setIsResolving(false)
    }
  }

  const handleExecuteAllocation = (index: number) => {
    if (!result) return
    const action = result.actions[index]
    if (action) openActionPanel(action)
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel p-5 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-accent-purple text-sm">✦</span>
          <h3 className="text-sm font-bold text-text-primary tracking-tight">Yield Intents</h3>
        </div>
        <p className="text-xs text-text-muted mb-4 leading-relaxed">
          Describe your yield goals in plain language. AI will construct the optimal allocation.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleResolve()}
            placeholder="e.g. I want 8% APY on $50k USDC with low risk"
            className="flex-1 bg-bg-tertiary/80 border border-border-primary/60 rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all"
          />
          <button
            onClick={handleResolve}
            disabled={isResolving || !inputText.trim()}
            className="btn-primary shrink-0"
          >
            {isResolving ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Thinking
              </span>
            ) : 'Deploy'}
          </button>
        </div>

        {!result && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {EXAMPLE_INTENTS.map((intent, i) => (
              <button
                key={i}
                onClick={() => setInputText(intent)}
                className="btn-ghost text-[10px] bg-bg-tertiary/60 text-text-muted px-2.5 py-1 rounded-full hover:text-text-secondary"
              >
                {intent}
              </button>
            ))}
          </div>
        )}
      </div>

      {isResolving && (
        <div className="glass-panel p-8 text-center">
          <div className="w-6 h-6 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-text-secondary">Constructing optimal allocation...</div>
        </div>
      )}

      {result && (
        <div className="glass-panel p-5 md:p-6 space-y-5 fade-in">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Proposed Allocation</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">{result.summary}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-accent-green">{result.blendedApy.toFixed(2)}%</div>
              <div className="text-[10px] text-text-muted uppercase tracking-wider">blended APY</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-bg-tertiary/50 rounded-xl p-3.5">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Total Capital</div>
              <div className="font-mono font-semibold text-text-primary">${result.totalAmount.toLocaleString()}</div>
            </div>
            <div className="bg-bg-tertiary/50 rounded-xl p-3.5">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Est. Annual</div>
              <div className="font-mono font-semibold text-accent-green">
                ${((result.totalAmount * result.blendedApy) / 100).toFixed(0)}
              </div>
            </div>
            <div className="bg-bg-tertiary/50 rounded-xl p-3.5">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Risk</div>
              <div className="text-text-primary capitalize font-semibold text-sm">{result.intent.riskTolerance}</div>
            </div>
          </div>

          <div className="space-y-2">
            {result.allocations.map((alloc, i) => (
              <div key={i} className="flex items-center justify-between p-3.5 bg-bg-tertiary/40 rounded-xl group hover:bg-bg-tertiary/60 transition-all">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center text-xs font-bold text-accent-blue shrink-0">
                    {alloc.allocationPercent}%
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-text-primary capitalize truncate font-medium">
                      {alloc.source.protocol} — {alloc.source.strategy}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono text-accent-green font-semibold">{alloc.expectedApy.toFixed(2)}%</span>
                      <span className="text-[10px] text-text-muted">${alloc.allocationUsd.toLocaleString()}</span>
                      <RiskBadge level={alloc.source.riskLevel as RiskLevel} showLabel={false} />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleExecuteAllocation(i)}
                  className="btn-ghost shrink-0 bg-accent-green/8 text-accent-green hover:bg-accent-green/15"
                >
                  Execute
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setResult(null)}
            className="w-full py-2.5 text-xs text-text-muted hover:text-text-secondary transition-colors rounded-lg"
          >
            Clear & try another intent
          </button>
        </div>
      )}
    </div>
  )
}
