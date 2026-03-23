import type { Position, YieldSource, StablecoinPeg } from '@/core/defi'
import { sortByRAYS } from './risk-adjusted-yield'
import type { ActionDiff } from '@/core/mutation'
import { computePositionDiff, buildEusxLoopAction } from '@/mutation/diff'

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive'

export interface PortfolioSuggestion {
  allocations: AllocationSuggestion[]
  currentBlendedApy: number
  suggestedBlendedApy: number
  apyImprovement: number
  totalValue: number
  actions: ActionDiff[]
}

export interface AllocationSuggestion {
  source: YieldSource
  adjustedApy: number
  raysGrade: string
  currentAllocation: number
  suggestedAllocation: number
  suggestedValueUsd: number
  reason: string
}

const RISK_FILTERS: Record<RiskProfile, { allowHigh: boolean; minTvl: number }> = {
  conservative: { allowHigh: false, minTvl: 10_000_000 }, // top-tier TVL only
  balanced:     { allowHigh: false, minTvl: 1_000_000 },  // established pools
  aggressive:   { allowHigh: true,  minTvl: 10_000 },     // anything with positive APY
}

export function optimizePortfolio(
  positions: Position[],
  sources: YieldSource[],
  riskProfile: RiskProfile = 'balanced',
  pegs?: StablecoinPeg[]
): PortfolioSuggestion {
  const totalValue = positions.reduce((s, p) => s + p.valueUsd, 0)
  const currentBlendedApy = totalValue > 0
    ? positions.reduce((s, p) => s + (p.apy * p.valueUsd) / totalValue, 0)
    : 0

  const riskFilter = RISK_FILTERS[riskProfile]
  const ranked = sortByRAYS(sources, pegs)

  // Filter: no critical risk, meets TVL floor, positive APY, risk profile check
  const viable = ranked
    .filter((s) => {
      if (s.riskLevel === 'critical') return false
      if (!riskFilter.allowHigh && s.riskLevel === 'high') return false
      if (s.tvl < riskFilter.minTvl) return false
      if (s.apy <= 0) return false
      return true
    })
    // Sort by raw APY descending — the actual number users care about
    .sort((a, b) => b.apy - a.apy)

  // Simple allocation: take top sources by APY, cap per protocol
  const maxPerProtocol = riskProfile === 'aggressive' ? 100 : riskProfile === 'balanced' ? 50 : 40
  const maxPerPosition = riskProfile === 'aggressive' ? 100 : 40
  const allocations: AllocationSuggestion[] = []
  let remainingPct = 100
  const protocolPct = new Map<string, number>()

  for (const source of viable) {
    if (remainingPct <= 0) break

    const used = protocolPct.get(source.protocol) ?? 0
    const space = maxPerProtocol - used
    if (space <= 0) continue

    const allocPct = Math.min(remainingPct, space, maxPerPosition)
    if (allocPct < 5) continue

    allocations.push({
      source,
      adjustedApy: source.rays.adjustedApy,
      raysGrade: source.rays.grade,
      currentAllocation: 0,
      suggestedAllocation: allocPct,
      suggestedValueUsd: (totalValue * allocPct) / 100,
      reason: `${source.apy.toFixed(2)}% APY, ${source.rays.grade} risk grade`,
    })

    remainingPct -= allocPct
    protocolPct.set(source.protocol, used + allocPct)
  }

  // Map existing positions
  for (const pos of positions) {
    const match = allocations.find(
      (a) => a.source.protocol === pos.protocol && a.source.strategy === pos.strategy
    )
    if (match) {
      match.currentAllocation = totalValue > 0 ? (pos.valueUsd / totalValue) * 100 : 0
    }
  }

  const finalAllocations = allocations.filter((a) => a.suggestedAllocation >= 5)

  // Divide by 100 — unallocated % earns 0%, so the true blended APY includes that idle drag
  const suggestedBlendedApy = finalAllocations.reduce(
    (s, a) => s + (a.source.apy * a.suggestedAllocation) / 100,
    0
  )

  const apyImprovement = suggestedBlendedApy - currentBlendedApy

  // Don't suggest a downgrade
  if (apyImprovement <= 0) {
    return {
      allocations: [],
      currentBlendedApy,
      suggestedBlendedApy: currentBlendedApy,
      apyImprovement: 0,
      totalValue,
      actions: [],
    }
  }

  // Build action diffs
  const actions: ActionDiff[] = []
  for (const alloc of finalAllocations) {
    if (Math.abs(alloc.suggestedAllocation - alloc.currentAllocation) < 5) continue

    const existingPosition = positions.find(
      (p) => p.protocol === alloc.source.protocol && p.strategy === alloc.source.strategy
    )

    if (existingPosition) {
      actions.push(computePositionDiff(existingPosition, alloc.source, alloc.suggestedValueUsd))
    } else {
      const isEusxLoop = (alloc.source.poolId ?? '').startsWith('eusx-loop') || /eusx.*loop/i.test(alloc.source.strategy)
      const eusxHolding = isEusxLoop
        ? positions.find((p) => p.protocol === 'wallet' && p.asset === 'eUSX')
        : null

      if (isEusxLoop) {
        // Cap to actual eUSX balance; if target > holdings, user needs to convert some USX first
        const available = eusxHolding?.valueUsd ?? 0
        const target = alloc.suggestedValueUsd
        // If user has less eUSX than target, they need to convert some USX first
        const usxToConvert = available < target ? Math.max(0, target - available) : 0
        actions.push(buildEusxLoopAction(target, alloc.source, usxToConvert))
        continue
      }

      const actionAmount = alloc.suggestedValueUsd
      const idle: Position = {
        id: 'idle',
        wallet: '',
        protocol: 'wallet',
        strategy: 'idle',
        asset: alloc.source.asset,
        amount: actionAmount,
        valueUsd: actionAmount,
        apy: 0,
        apySources: [],
        riskLevel: 'low',
        riskFactors: [],
        entryTimestamp: 0,
        lastUpdate: 0,
      }
      actions.push(computePositionDiff(idle, alloc.source, actionAmount))
    }
  }

  return {
    allocations: finalAllocations,
    currentBlendedApy,
    suggestedBlendedApy,
    apyImprovement,
    totalValue,
    actions,
  }
}
