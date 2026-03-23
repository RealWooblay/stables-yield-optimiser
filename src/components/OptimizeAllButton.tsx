import { useState, useMemo } from 'react'
import { usePositionStore } from '@/stores/position-store'
import { useWalletStore } from '@/stores/wallet-store'
import { useYieldStore } from '@/stores/yield-store'
import { useUIStore } from '@/stores/ui-store'
import { optimizePortfolio, type PortfolioSuggestion, type RiskProfile } from '@/intelligence/portfolio-optimizer'
import { getTenantConfig, getEcosystemConfig, filterYieldSourcesForTenantActions, isTenantEcosystemPosition, USX_EUSX_MINT, ECOSYSTEM_OPTIONS, type EcosystemOption } from '@/config/tenant'
import type { Position } from '@/core/defi'

const PROFILES: Array<{ id: RiskProfile; label: string }> = [
  { id: 'conservative', label: 'Safe' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'aggressive', label: 'Max Yield' },
]

function idleToPosition(b: { mint: string; symbol: string; uiAmount: number; valueUsd: number }, wallet: string): Position {
  return {
    id: `idle-${b.mint.slice(0, 8)}`,
    wallet,
    protocol: 'wallet',
    strategy: 'Idle',
    asset: b.symbol,
    amount: b.uiAmount,
    valueUsd: b.valueUsd > 0 ? b.valueUsd : b.uiAmount,
    apy: 0,
    apySources: [],
    riskLevel: 'low',
    riskFactors: [],
    entryTimestamp: Date.now(),
    lastUpdate: Date.now(),
  }
}

function isLoopStrategy(poolId: string, strategy: string): boolean {
  return poolId.startsWith('loop-') || poolId.startsWith('eusx-loop') || strategy.toLowerCase().includes('loop')
}

function extractHealthFactor(riskFactors: string[]): number | null {
  for (const f of riskFactors) {
    const m = f.match(/health factor[^\d]*([\d.]+)/i)
    if (m) return parseFloat(m[1])
  }
  return null
}

function riskDot(level: string): string {
  if (level === 'low') return 'text-accent-green'
  if (level === 'medium') return 'text-yellow-400'
  return 'text-red-400'
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function OptimizeAllButton() {
  const positions = usePositionStore((s) => s.positions)
  const balances = useWalletStore((s) => s.balances)
  const sources = useYieldStore((s) => s.sources)
  const pegs = useYieldStore((s) => s.pegs)
  const openActionPanel = useUIStore((s) => s.openActionPanel)
  const addToast = useUIStore((s) => s.addToast)
  const [ecosystemId, setEcosystemId] = useState(() => ECOSYSTEM_OPTIONS.find(e => e.live)?.id ?? 'usx')
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('balanced')
  const [suggestion, setSuggestion] = useState<PortfolioSuggestion | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)

  const tenant = getEcosystemConfig(ecosystemId) ?? getTenantConfig()

  const positionList = positions?.value ?? []
  const balanceList = balances?.value ?? []
  const sourceList = sources?.value ?? []

  const filteredPositions = useMemo(() => {
    if (tenant) return positionList.filter((p) => isTenantEcosystemPosition(p, tenant))
    return positionList
  }, [positionList, tenant])

  const idleBalances = useMemo(() => {
    if (!tenant) return balanceList.filter((b) => b.uiAmount > 0 && b.valueUsd > 0.5)
    return balanceList.filter((b) => {
      if (b.uiAmount <= 0) return false
      const usd = b.valueUsd > 0 ? b.valueUsd : b.uiAmount
      if (usd < 0.5) return false
      return b.mint === tenant.stablecoinMint || b.mint === USX_EUSX_MINT
    })
  }, [balanceList, tenant])

  const allPositions = useMemo(() => {
    const deployed = [...filteredPositions]
    for (const b of idleBalances) {
      // Only skip eUSX wallet balance if there's already a pure eUSX position deployed (not PT-eUSX etc.)
      const alreadyCounted = deployed.some(
        (p) => p.protocol !== 'wallet' &&
          b.mint === USX_EUSX_MINT &&
          p.asset.toUpperCase() === 'EUSX' &&
          p.protocol === 'kamino'
      )
      if (alreadyCounted) continue
      deployed.push(idleToPosition(b, positions?.value[0]?.wallet ?? ''))
    }
    return deployed
  }, [filteredPositions, idleBalances, positions, tenant])

  const filteredSources = useMemo(() => {
    if (tenant) return filterYieldSourcesForTenantActions(sourceList, tenant)
    return sourceList
  }, [sourceList, tenant])

  const hasPositions = allPositions.length > 0
  const hasSources = filteredSources.length > 0
  const canOptimize = hasPositions && hasSources

  const scanningProtocols = useMemo(() => {
    const protos = new Set(filteredSources.map((s) => capitalize(s.protocol.replace('-', ' '))))
    return Array.from(protos).slice(0, 6).join(' · ')
  }, [filteredSources])

  const handleOptimize = () => {
    if (!canOptimize) return
    setIsOptimizing(true)
    setTimeout(() => {
      const result = optimizePortfolio(allPositions, filteredSources, riskProfile, pegs?.value)
      setSuggestion(result)
      setIsOptimizing(false)
      if (result.actions.length === 0) {
        addToast({ type: 'info', title: "You're already optimal", message: 'No better yield found at this risk level.', duration: 4000 })
      }
    }, 150)
  }

  const handleExecuteAll = () => {
    if (!suggestion || suggestion.actions.length === 0) return
    if (suggestion.actions.length === 1) {
      openActionPanel(suggestion.actions[0])
    } else {
      openActionPanel({
        id: `optimize-all-${Date.now()}`,
        type: 'rebalance' as const,
        protocol: 'multi',
        strategy: 'Full Rebalance',
        diffs: suggestion.actions.flatMap(a => a.diffs),
        estimatedFees: suggestion.actions.reduce((s, a) => s + a.estimatedFees, 0),
        estimatedGas: suggestion.actions.reduce((s, a) => s + a.estimatedGas, 0),
        riskDelta: 0,
        apyDelta: suggestion.apyImprovement,
        projectedAnnualChange: (suggestion.suggestedBlendedApy - suggestion.currentBlendedApy) * suggestion.totalValue / 100,
        steps: suggestion.actions.flatMap(a => a.steps),
      })
    }
  }

  if (!hasSources && sourceList.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-4 h-4 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-text-muted">Loading yield index…</p>
      </div>
    )
  }

  const topAlloc = suggestion?.allocations[0]
  const annualGain = suggestion ? (suggestion.apyImprovement * suggestion.totalValue) / 100 : 0
  const addIncentiveUsd = 100
  const addIncentiveYr = suggestion ? (suggestion.suggestedBlendedApy * addIncentiveUsd) / 100 : 0

  return (
    <div className="space-y-3">
      {/* Ecosystem selector */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-muted/60 uppercase tracking-wider shrink-0">Ecosystem</span>
        <div className="flex gap-1 flex-wrap">
          {(ECOSYSTEM_OPTIONS as EcosystemOption[]).map((eco) => (
            <button
              key={eco.id}
              disabled={!eco.live}
              onClick={() => { setEcosystemId(eco.id); setSuggestion(null) }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                ecosystemId === eco.id
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : eco.live
                  ? 'bg-bg-secondary/30 text-text-muted hover:text-text-secondary border border-transparent'
                  : 'bg-bg-secondary/10 text-text-muted/30 border border-transparent cursor-not-allowed'
              }`}
            >
              {eco.label}
              <span className="ml-1 text-[9px] opacity-60">{eco.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Risk profile */}
      <div className="flex gap-1.5">
        {PROFILES.map((p) => (
          <button
            key={p.id}
            onClick={() => { setRiskProfile(p.id); setSuggestion(null) }}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              riskProfile === p.id
                ? 'bg-accent-blue text-white'
                : 'bg-bg-secondary/30 text-text-muted hover:text-text-secondary'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Optimize button / scanning */}
      {isOptimizing ? (
        <div className="rounded-lg bg-bg-secondary/20 px-3 py-3 text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <div className="w-3 h-3 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
            <span className="text-xs text-text-muted">Scanning…</span>
          </div>
          {scanningProtocols && (
            <p className="text-[10px] text-text-muted/50">{scanningProtocols}</p>
          )}
        </div>
      ) : (
        <button
          onClick={handleOptimize}
          disabled={!canOptimize}
          className="btn-primary w-full py-2.5 rounded-lg text-sm font-semibold"
        >
          {!canOptimize ? (hasPositions ? 'Loading…' : 'No USX detected') : 'Find Best Yield'}
        </button>
      )}

      {/* Results */}
      {suggestion && suggestion.actions.length > 0 && (
        <div className="space-y-3 pt-1">

              {/* Headline */}
          {topAlloc && (
            <div className="rounded-lg bg-bg-secondary/20 px-3 py-2.5">
              <p className="text-sm font-medium text-text-primary leading-snug">
                {suggestion!.allocations.length === 1
                  ? <>
                      Move your USX to{' '}
                      <span className="text-accent-blue capitalize">{topAlloc.source.protocol}</span>.{' '}
                      {topAlloc.source.apy.toFixed(1)}%
                      {topAlloc.source.strategy.toLowerCase().includes('fixed') ? ' fixed rate' : ''} —
                      that&apos;s{' '}
                      <span className="text-accent-green font-semibold">+${annualGain.toFixed(0)}/yr</span>.
                    </>
                  : <>
                      Spread your USX across{' '}
                      <span className="text-accent-blue">{suggestion!.allocations.length} strategies</span>.{' '}
                      {suggestion!.suggestedBlendedApy.toFixed(1)}% blended —
                      that&apos;s{' '}
                      <span className="text-accent-green font-semibold">+${annualGain.toFixed(0)}/yr</span>.
                    </>
                }
              </p>
            </div>
          )}

          {/* APY delta */}
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-text-muted">
              {suggestion.currentBlendedApy.toFixed(2)}% now → {suggestion.suggestedBlendedApy.toFixed(2)}% optimised
            </span>
            <span className="font-mono font-semibold text-accent-green">
              +{suggestion.apyImprovement.toFixed(2)}%
            </span>
          </div>

          {/* All strategies — flat list */}
          {suggestion.allocations.map((alloc, i) => {
            const isLoop = isLoopStrategy(alloc.source.poolId ?? '', alloc.source.strategy)
            const hf = isLoop ? extractHealthFactor(alloc.source.riskFactors) : null
            const riskLabel = alloc.source.riskLevel === 'low' ? 'Low risk'
              : alloc.source.riskLevel === 'medium' ? 'Medium risk'
              : 'Higher risk'
            return (
              <div key={i} className="flex items-start justify-between py-2 border-b border-border-primary/10 last:border-0">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="font-mono text-xs text-accent-blue w-8 shrink-0 pt-0.5">{alloc.suggestedAllocation.toFixed(0)}%</span>
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary capitalize truncate">{alloc.source.protocol}</p>
                    <p className="text-[10px] text-text-muted truncate">{alloc.source.strategy}</p>
                    {isLoop && (
                      <p className="text-[10px] text-accent-blue/70 mt-0.5">
                        Leverage: deposit eUSX on Kamino → borrow USX → earn extra yield on top
                        {hf !== null ? ` · Liquidation buffer: ${hf.toFixed(2)}×` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="font-mono text-xs text-accent-green">{alloc.source.apy.toFixed(2)}%</p>
                  <p className={`text-[10px] ${riskDot(alloc.source.riskLevel)}`}>{riskLabel}</p>
                </div>
              </div>
            )
          })}

          {/* Add more incentive */}
          {suggestion.suggestedBlendedApy > 0 && (
            <p className="text-[10px] text-text-muted/60 text-center">
              Add ${addIncentiveUsd} more USX → +${addIncentiveYr.toFixed(2)}/yr
            </p>
          )}

          <button onClick={handleExecuteAll} className="btn-primary w-full py-2.5 rounded-lg text-sm font-semibold">
            Show me how →
          </button>
        </div>
      )}

      {suggestion && suggestion.actions.length === 0 && (
        <p className="text-xs text-text-muted text-center py-2">You&apos;re already in the best position for this risk level.</p>
      )}
    </div>
  )
}
