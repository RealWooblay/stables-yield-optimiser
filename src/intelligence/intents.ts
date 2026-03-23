import { getAnthropicClient, isIntelligenceAvailable } from './client'
import { sortByRAYS } from './risk-adjusted-yield'
import type { YieldSource, StablecoinPeg } from '@/core/defi'
import type { ActionDiff } from '@/core/mutation'

export interface YieldIntent {
  targetApy: number | null
  amount: number | null
  asset: string
  riskTolerance: 'low' | 'medium' | 'high'
  liquidityPreference: 'instant' | 'flexible' | 'locked'
  rawText: string
}

export interface IntentAllocation {
  source: YieldSource
  allocationPercent: number
  allocationUsd: number
  expectedApy: number
  raysGrade: string
}

export interface IntentResult {
  intent: YieldIntent
  allocations: IntentAllocation[]
  blendedApy: number
  totalAmount: number
  summary: string
  actions: ActionDiff[]
}

const INTENT_SYSTEM = `You are a DeFi yield allocation expert. Parse the user's natural language intent about where to deploy capital for yield, then recommend an allocation.

You MUST respond using the provided tool. Parse the intent to extract:
- Target APY (if specified)
- Amount in USD (if specified)
- Asset preference (default USDC)
- Risk tolerance (low/medium/high)
- Liquidity preference (instant/flexible/locked)

Then use the available yield sources to construct an optimal allocation.`

const INTENT_TOOL = {
  name: 'parse_yield_intent' as const,
  description: 'Parse a yield deployment intent and return structured allocation',
  input_schema: {
    type: 'object' as const,
    properties: {
      targetApy: { type: 'number' as const, description: 'Target APY percentage, null if not specified' },
      amount: { type: 'number' as const, description: 'Amount in USD, null if not specified' },
      asset: { type: 'string' as const, description: 'Preferred asset (USDC, SOL, etc.)' },
      riskTolerance: { type: 'string' as const, enum: ['low', 'medium', 'high'] },
      liquidityPreference: { type: 'string' as const, enum: ['instant', 'flexible', 'locked'] },
      allocations: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            protocol: { type: 'string' as const },
            strategy: { type: 'string' as const },
            allocationPercent: { type: 'number' as const, description: '0-100 percentage' },
            reason: { type: 'string' as const },
          },
          required: ['protocol', 'strategy', 'allocationPercent', 'reason'],
        },
      },
      summary: { type: 'string' as const, description: 'Brief explanation of the allocation strategy' },
    },
    required: ['targetApy', 'amount', 'asset', 'riskTolerance', 'liquidityPreference', 'allocations', 'summary'] as string[],
  },
}

export async function resolveIntent(
  rawText: string,
  sources: YieldSource[],
  pegs?: StablecoinPeg[]
): Promise<IntentResult | null> {
  if (!isIntelligenceAvailable() || !sources.length) return null

  const ranked = sortByRAYS(sources, pegs)
  const topSources = ranked.slice(0, 20)

  const context = JSON.stringify({
    userIntent: rawText,
    availableSources: topSources.map((s) => ({
      protocol: s.protocol,
      strategy: s.strategy,
      asset: s.asset,
      apy: s.apy,
      adjustedApy: s.rays.adjustedApy,
      raysGrade: s.rays.grade,
      raysScore: s.rays.score,
      tvl: s.tvl,
      riskLevel: s.riskLevel,
      stablecoin: s.stablecoin,
      audited: s.audited,
    })),
  })

  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: INTENT_SYSTEM,
      tools: [INTENT_TOOL],
      messages: [{ role: 'user', content: context }],
    })

    const toolUse = response.content.find((c) => c.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return null

    const parsed = toolUse.input as {
      targetApy: number | null
      amount: number | null
      asset: string
      riskTolerance: 'low' | 'medium' | 'high'
      liquidityPreference: 'instant' | 'flexible' | 'locked'
      allocations: Array<{ protocol: string; strategy: string; allocationPercent: number; reason: string }>
      summary: string
    }

    const totalAmount = parsed.amount ?? 10_000

    const allocations: IntentAllocation[] = parsed.allocations
      .map((a) => {
        const match = topSources.find(
          (s) => s.protocol === a.protocol && s.strategy === a.strategy
        )
        if (!match) return null
        const { rays: _rays, ...sourceOnly } = match
        return {
          source: sourceOnly as YieldSource,
          allocationPercent: a.allocationPercent,
          allocationUsd: (totalAmount * a.allocationPercent) / 100,
          expectedApy: match.rays.adjustedApy,
          raysGrade: match.rays.grade,
        }
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)

    const totalAllocation = allocations.reduce((s, a) => s + a.allocationPercent, 0)
    const blendedApy = totalAllocation > 0
      ? allocations.reduce((s, a) => s + (a.expectedApy * a.allocationPercent / totalAllocation), 0)
      : 0

    const actions: ActionDiff[] = allocations.map((a, i) => ({
      id: `intent-${Date.now()}-${i}`,
      type: 'deposit' as const,
      protocol: a.source.protocol,
      strategy: a.source.strategy,
      diffs: [
        { field: 'amount', before: 0, after: a.allocationUsd },
        { field: 'apy', before: 0, after: a.expectedApy, changePercent: 100 },
      ],
      estimatedFees: 0.001,
      estimatedGas: 200_000,
      riskDelta: 0,
      apyDelta: a.expectedApy,
      projectedAnnualChange: (a.allocationUsd * a.expectedApy) / 100,
      steps: [{
        id: `step-deposit-${i}`,
        label: `Deposit ${a.source.asset} into ${a.source.protocol}`,
        instruction: `Deposit $${a.allocationUsd.toFixed(0)} into ${a.source.strategy}`,
        status: 'pending' as const,
      }],
    }))

    return {
      intent: {
        targetApy: parsed.targetApy,
        amount: parsed.amount,
        asset: parsed.asset,
        riskTolerance: parsed.riskTolerance,
        liquidityPreference: parsed.liquidityPreference,
        rawText,
      },
      allocations,
      blendedApy,
      totalAmount,
      summary: parsed.summary,
      actions,
    }
  } catch (err) {
    console.error('[intents] Failed to resolve intent', err)
    return null
  }
}
