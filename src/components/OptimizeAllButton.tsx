import { useState, useMemo } from 'react'
import { usePositionStore } from '@/stores/position-store'
import { useWalletStore } from '@/stores/wallet-store'
import { useYieldStore } from '@/stores/yield-store'
import { useUIStore } from '@/stores/ui-store'
import { streamOptimize, type OptimizeEvent } from '@/intelligence/client'
import { computePositionDiff, buildEusxLoopAction, buildWithdrawAction } from '@/mutation/diff'
import { getTenantConfig, getEcosystemConfig, filterYieldSourcesForTenantActions, isTenantEcosystemPosition, USX_EUSX_MINT, ECOSYSTEM_OPTIONS, type EcosystemOption } from '@/config/tenant'
import type { Position, YieldSource } from '@/core/defi'
import type { ActionDiff } from '@/core/mutation'

type RiskProfile = 'conservative' | 'balanced' | 'aggressive'

const PROFILES: Array<{ id: RiskProfile; label: string }> = [
  { id: 'conservative', label: 'Safe' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'aggressive', label: 'Max Yield' },
]

interface AgenticSuggestion {
  headline: string
  reasoning: string
  allocations: Array<{
    protocol: string
    strategy: string
    percentage: number
    note?: string
    source?: YieldSource
    apy: number
  }>
  blendedApy: number
  apyImprovement: number
  stressTestSummary?: string
  warnings?: string[]
  actions: ActionDiff[]
  currentBlendedApy: number
  totalValue: number
}

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
  const openActionPanel = useUIStore((s) => s.openActionPanel)
  const addToast = useUIStore((s) => s.addToast)
  const [ecosystemId, setEcosystemId] = useState(() => ECOSYSTEM_OPTIONS.find(e => e.live)?.id ?? 'usx')
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('balanced')
  const [suggestion, setSuggestion] = useState<AgenticSuggestion | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([])

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

  const buildActionsFromRecommendation = (
    rec: OptimizeEvent & { type: 'result' },
    yieldSources: YieldSource[],
    positions: Position[],
    totalValue: number,
  ): ActionDiff[] => {
    const actions: ActionDiff[] = []
    const matchedPositionIds = new Set<string>()

    // 1. Build actions for each recommended allocation
    for (const alloc of rec.recommendation.allocations) {
      const source = yieldSources.find(
        (s) => s.protocol.toLowerCase() === alloc.protocol.toLowerCase() &&
               (s.strategy.toLowerCase().includes(alloc.strategy.toLowerCase().split(' ')[0]) ||
                alloc.strategy.toLowerCase().includes(s.strategy.toLowerCase().split(' ')[0]))
      ) ?? yieldSources.find((s) => s.protocol.toLowerCase() === alloc.protocol.toLowerCase())

      if (!source) continue

      const suggestedValueUsd = (totalValue * alloc.percentage) / 100
      const existingPosition = positions.find(
        (p) => p.protocol === source.protocol &&
               (p.strategy === source.strategy || p.strategy.toLowerCase().includes(source.strategy.toLowerCase().split(' ')[0]))
      )

      // Track which positions are covered by the recommendation
      if (existingPosition) matchedPositionIds.add(existingPosition.id)

      // Skip if user already has this exact position (within 20% value tolerance)
      if (existingPosition && existingPosition.apy > 0) {
        const valueDiff = Math.abs(existingPosition.valueUsd - suggestedValueUsd) / Math.max(existingPosition.valueUsd, 1)
        if (valueDiff < 0.2) continue
      }

      const isEusxLoop = (source.poolId ?? '').startsWith('eusx-loop') || /eusx.*loop/i.test(source.strategy)

      if (isEusxLoop) {
        const eusxHolding = positions.find((p) => p.protocol === 'wallet' && p.asset === 'eUSX')
        const available = eusxHolding?.valueUsd ?? 0
        const usxToConvert = available < suggestedValueUsd ? Math.max(0, suggestedValueUsd - available) : 0
        actions.push(buildEusxLoopAction(suggestedValueUsd, source, usxToConvert))
      } else if (existingPosition) {
        actions.push(computePositionDiff(existingPosition, source, suggestedValueUsd))
      } else {
        const idle: Position = {
          id: 'idle', wallet: '', protocol: 'wallet', strategy: 'idle',
          asset: source.asset, amount: suggestedValueUsd, valueUsd: suggestedValueUsd,
          apy: 0, apySources: [], riskLevel: 'low', riskFactors: [],
          entryTimestamp: 0, lastUpdate: 0,
        }
        actions.push(computePositionDiff(idle, source, suggestedValueUsd))
      }
    }

    // 2. Withdraw from any deployed positions NOT in the recommendation
    //    (skip wallet idle positions — those just get redeployed)
    for (const pos of positions) {
      if (pos.protocol === 'wallet') continue
      if (pos.valueUsd < 1) continue
      if (matchedPositionIds.has(pos.id)) continue
      // This position is being abandoned — prepend a withdraw action
      actions.unshift(buildWithdrawAction(pos))
    }

    return actions
  }

  const handleOptimize = async () => {
    if (!canOptimize) return
    setIsOptimizing(true)
    setThinkingSteps([])
    setSuggestion(null)

    const totalValue = allPositions.reduce((s, p) => s + p.valueUsd, 0)
    const currentBlendedApy = totalValue > 0
      ? allPositions.reduce((s, p) => s + (p.apy * p.valueUsd) / totalValue, 0)
      : 0

    try {
      const gen = streamOptimize({
        portfolio: {
          positions: allPositions.map((p) => ({
            id: p.id,
            protocol: p.protocol,
            strategy: p.strategy,
            asset: p.asset,
            amount: p.amount,
            valueUsd: p.valueUsd,
            apy: p.apy,
            riskLevel: p.riskLevel,
            riskFactors: p.riskFactors,
          })),
          totalValueUsd: totalValue,
        },
        yieldSources: filteredSources,
        riskPreference: riskProfile,
      })

      for await (const event of gen) {
        if (event.type === 'thinking') {
          setThinkingSteps((prev) => [...prev, event.text])
        } else if (event.type === 'result') {
          const rec = event.recommendation
          const actions = buildActionsFromRecommendation(
            event as OptimizeEvent & { type: 'result' },
            filteredSources,
            allPositions,
            totalValue,
          )

          // Enrich allocations with source data
          const enriched = rec.allocations.map((alloc) => {
            const source = filteredSources.find(
              (s) => s.protocol.toLowerCase() === alloc.protocol.toLowerCase() &&
                     (s.strategy.toLowerCase().includes(alloc.strategy.toLowerCase().split(' ')[0]) ||
                      alloc.strategy.toLowerCase().includes(s.strategy.toLowerCase().split(' ')[0]))
            ) ?? filteredSources.find((s) => s.protocol.toLowerCase() === alloc.protocol.toLowerCase())
            return { ...alloc, source, apy: alloc.apy ?? source?.apy ?? 0 }
          })

          const finalSuggestion: AgenticSuggestion = {
            headline: rec.headline,
            reasoning: rec.reasoning,
            allocations: enriched,
            blendedApy: rec.blendedApy,
            apyImprovement: rec.apyImprovement,
            stressTestSummary: rec.stressTestSummary,
            warnings: rec.warnings,
            actions,
            currentBlendedApy,
            totalValue,
          }
          setSuggestion(finalSuggestion)

          if (actions.length === 0) {
            addToast({ type: 'info', title: "You're already optimal", message: 'No better yield found at this risk level.', duration: 4000 })
          }
        } else if (event.type === 'error') {
          addToast({ type: 'error', title: 'Optimizer error', message: event.message, duration: 5000 })
        }
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to optimize', message: String(err), duration: 5000 })
    } finally {
      setIsOptimizing(false)
    }
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
        projectedAnnualChange: (suggestion.blendedApy - suggestion.currentBlendedApy) * suggestion.totalValue / 100,
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

  const annualGain = suggestion ? (suggestion.apyImprovement * suggestion.totalValue) / 100 : 0

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
              onClick={() => { setEcosystemId(eco.id); setSuggestion(null); setThinkingSteps([]) }}
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
            onClick={() => { setRiskProfile(p.id); setSuggestion(null); setThinkingSteps([]) }}
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
        <div className="rounded-lg bg-bg-secondary/20 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin shrink-0" />
            <span className="text-xs text-text-muted">Claude is analyzing your portfolio…</span>
          </div>
          {scanningProtocols && thinkingSteps.length === 0 && (
            <p className="text-[10px] text-text-muted/50">{scanningProtocols}</p>
          )}
          {thinkingSteps.length > 0 && (
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {thinkingSteps.slice(-4).map((step, i) => (
                <p key={i} className={`text-[10px] ${i === thinkingSteps.slice(-4).length - 1 ? 'text-text-muted' : 'text-text-muted/40'} leading-relaxed`}>
                  {step}
                </p>
              ))}
            </div>
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
        <div className="space-y-2.5 pt-1">

          {/* Headline + reasoning */}
          <div className="rounded-lg bg-bg-secondary/20 px-3 py-2 space-y-1">
            <p className="text-sm font-medium text-text-primary leading-snug">{suggestion.headline}</p>
            <p className="text-[11px] text-text-muted leading-relaxed">{suggestion.reasoning}</p>
          </div>

          {/* APY delta */}
          <div className="flex items-baseline justify-between text-xs px-0.5">
            <span className="text-text-muted">
              {suggestion.currentBlendedApy.toFixed(2)}% → {suggestion.blendedApy.toFixed(2)}%
            </span>
            <span className="font-mono font-semibold text-accent-green">
              +{suggestion.apyImprovement.toFixed(2)}%{annualGain > 0 ? ` (+$${annualGain.toFixed(0)}/yr)` : ''}
            </span>
          </div>

          {/* Allocations */}
          {suggestion.allocations.map((alloc, i) => {
            const source = alloc.source
            const isLoop = source ? isLoopStrategy(source.poolId ?? '', source.strategy) : /loop/i.test(alloc.strategy)
            const hf = (isLoop && source) ? extractHealthFactor(source.riskFactors) : null
            const riskLevel = source?.riskLevel ?? 'medium'
            const riskLabel = riskLevel === 'low' ? 'Low' : riskLevel === 'medium' ? 'Med' : 'High'
            return (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border-primary/10 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[11px] text-accent-blue w-7 shrink-0">{alloc.percentage.toFixed(0)}%</span>
                  <div className="min-w-0">
                    <p className="text-xs text-text-primary capitalize truncate">
                      {alloc.protocol}
                      {isLoop ? ' loop' : ''}
                      {hf !== null ? ` · HF ${hf.toFixed(2)}` : ''}
                    </p>
                    {alloc.note && <p className="text-[10px] text-text-muted/60 truncate">{alloc.note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="font-mono text-xs text-accent-green">{alloc.apy.toFixed(2)}%</span>
                  <span className={`text-[9px] ${riskDot(riskLevel)}`}>{riskLabel}</span>
                </div>
              </div>
            )
          })}

          {/* Warnings — max 2 */}
          {suggestion.warnings && suggestion.warnings.length > 0 && (
            <div className="space-y-1">
              {suggestion.warnings.slice(0, 2).map((w, i) => (
                <p key={i} className="text-[10px] text-yellow-400/70">{w}</p>
              ))}
            </div>
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
