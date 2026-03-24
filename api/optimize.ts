import Anthropic from '@anthropic-ai/sdk'

export const config = { runtime: 'edge' }

// ── Inline types (can't import from src/) ─────────────────────────────────────

interface YieldSource {
  poolId?: string
  protocol: string
  strategy: string
  asset: string
  apy: number
  tvl: number
  riskLevel: string
  audited?: boolean
  stablecoin?: boolean
  underlyingMints?: string[]
}

interface Position {
  id: string
  protocol: string
  strategy: string
  asset: string
  amount: number
  valueUsd: number
  apy: number
  riskLevel: string
  riskFactors: string[]
}

interface Portfolio {
  positions: Position[]
  totalValueUsd: number
}

interface LoopRates {
  kaminoBorrowApy: number
  eusxLtv: number
  loopscaleBorrowApy: number
}

interface OptimizePayload {
  portfolio: Portfolio
  yieldSources: YieldSource[]
  riskPreference: 'conservative' | 'balanced' | 'aggressive'
  loopRates?: Partial<LoopRates>
}

// ── Risk filters ───────────────────────────────────────────────────────────────

const RISK_FILTERS = {
  conservative: { allowHigh: false, minTvl: 10_000_000 },
  balanced: { allowHigh: false, minTvl: 1_000_000 },
  aggressive: { allowHigh: true, minTvl: 10_000 },
}

// ── Tool implementations ───────────────────────────────────────────────────────

function toolListStrategies(
  sources: YieldSource[],
  risk: string,
  args: { riskFilter?: string; asset?: string }
): object {
  const profile = (args.riskFilter ?? risk) as keyof typeof RISK_FILTERS
  const filter = RISK_FILTERS[profile] ?? RISK_FILTERS.balanced
  const asset = args.asset?.toUpperCase()

  const filtered = sources
    .filter((s) => {
      if (s.riskLevel === 'critical') return false
      if (!filter.allowHigh && s.riskLevel === 'high') return false
      if (s.tvl < filter.minTvl) return false
      if (s.apy <= 0) return false
      if (asset && !s.asset.toUpperCase().includes(asset) && !s.strategy.toUpperCase().includes(asset)) return false
      return true
    })
    .sort((a, b) => b.apy - a.apy)
    .slice(0, 12)

  return {
    count: filtered.length,
    strategies: filtered.map((s) => ({
      protocol: s.protocol,
      strategy: s.strategy,
      asset: s.asset,
      apy: s.apy,
      tvl: s.tvl,
      riskLevel: s.riskLevel,
      audited: s.audited ?? false,
      isLoop: (s.poolId ?? '').startsWith('loop') || (s.poolId ?? '').startsWith('eusx-loop') || s.strategy.toLowerCase().includes('loop'),
    })),
  }
}

function toolSimulateAllocation(
  payload: OptimizePayload,
  args: { allocations: Array<{ protocol: string; strategy: string; percentage: number }>; totalValueUsd?: number }
): object {
  const total = args.totalValueUsd ?? payload.portfolio.totalValueUsd
  const sources = payload.yieldSources

  let blendedApy = 0
  const breakdown = []

  for (const alloc of args.allocations) {
    const source = sources.find(
      (s) => s.protocol.toLowerCase() === alloc.protocol.toLowerCase() &&
             s.strategy.toLowerCase().includes(alloc.strategy.toLowerCase().split(' ')[0])
    ) ?? sources.find((s) => s.protocol.toLowerCase() === alloc.protocol.toLowerCase())

    if (!source) {
      breakdown.push({ protocol: alloc.protocol, strategy: alloc.strategy, percentage: alloc.percentage, apy: 0, annualUsd: 0, note: 'strategy not found in yield index' })
      continue
    }

    const weight = alloc.percentage / 100
    const contrib = source.apy * weight
    blendedApy += contrib
    const annualUsd = (total * weight * source.apy) / 100

    breakdown.push({
      protocol: source.protocol,
      strategy: source.strategy,
      percentage: alloc.percentage,
      apy: source.apy,
      annualUsd: parseFloat(annualUsd.toFixed(2)),
      riskLevel: source.riskLevel,
    })
  }

  const currentApy = total > 0
    ? payload.portfolio.positions.reduce((s, p) => s + (p.apy * p.valueUsd) / total, 0)
    : 0
  const annualGainUsd = ((blendedApy - currentApy) * total) / 100

  return {
    blendedApy: parseFloat(blendedApy.toFixed(2)),
    currentApy: parseFloat(currentApy.toFixed(2)),
    apyImprovement: parseFloat((blendedApy - currentApy).toFixed(2)),
    annualGainUsd: parseFloat(annualGainUsd.toFixed(2)),
    totalValueUsd: total,
    breakdown,
  }
}

function toolComputeLeverage(
  sources: YieldSource[],
  rates: Partial<LoopRates> | undefined,
  args: {
    asset: string
    leverageTier: string
    deployProtocol?: string
    borrowRateOverride?: number
  }
): object {
  const kaminoBorrow = args.borrowRateOverride ?? rates?.kaminoBorrowApy ?? 2.5
  const eusxLtv = rates?.eusxLtv ?? 0.75
  const loopscaleBorrow = args.borrowRateOverride ?? rates?.loopscaleBorrowApy ?? 2.0
  const SOLSTICE_APY = 3.3

  if (args.asset.toUpperCase() === 'EUSX') {
    // eUSX collateral loop on Kamino
    const deploySource = args.deployProtocol
      ? sources.find((s) => s.protocol.toLowerCase() === args.deployProtocol!.toLowerCase() && /usx/i.test(s.asset))
      : sources
          .filter((s) => /usx/i.test(s.asset) && !s.strategy.toLowerCase().includes('loop') && s.apy > 0 && s.protocol !== 'solstice' && s.protocol !== 'solstice-usx')
          .sort((a, b) => b.apy - a.apy)[0]

    if (!deploySource) return { error: 'No USX deployment venue found' }

    const tierLtv = args.leverageTier === 'aggressive' ? eusxLtv * 0.95
      : args.leverageTier === 'conservative' ? eusxLtv * 0.667
      : eusxLtv * 0.8 // balanced

    const effectiveApy = SOLSTICE_APY + tierLtv * (deploySource.apy - kaminoBorrow)
    const healthFactor = (eusxLtv) / tierLtv  // normalized: (collateral * ltv) / borrowed
    const breakEvenBorrowRate = deploySource.apy

    return {
      strategyType: 'eUSX_collateral_loop',
      eusxBaseApy: SOLSTICE_APY,
      deployVenue: deploySource.protocol,
      deployApy: deploySource.apy,
      kaminoBorrowApy: kaminoBorrow,
      borrowedLtvRatio: parseFloat(tierLtv.toFixed(3)),
      effectiveApy: parseFloat(effectiveApy.toFixed(2)),
      healthFactor: parseFloat(healthFactor.toFixed(2)),
      breakEvenBorrowRate: parseFloat(breakEvenBorrowRate.toFixed(2)),
      steps: [
        'Deposit eUSX as collateral on Kamino (eUSX continues earning 3.3% vault yield while deposited)',
        `Borrow USX at ${kaminoBorrow.toFixed(2)}% APY — keep LTV below ${(eusxLtv * 100).toFixed(0)}%`,
        `Deploy borrowed USX on ${deploySource.protocol} at ${deploySource.apy.toFixed(2)}% APY`,
      ],
    }
  }

  // USX recursive loop on Loopscale
  const loopscaleUSX = sources.find((s) => s.protocol === 'loopscale' && /usx/i.test(s.asset + s.strategy) && s.apy > 0)
  if (!loopscaleUSX) return { error: 'No Loopscale USX pool found' }

  const leverage = args.leverageTier === 'aggressive' ? 2.44 : 1.8
  const effectiveApy = loopscaleUSX.apy * leverage - loopscaleBorrow * (leverage - 1)
  const healthFactor = 0.8 / (leverage > 2 ? 0.8 : 0.8)  // 1.0 — normalized HF at 80% LTV
  const breakEvenBorrowRate = (loopscaleUSX.apy * leverage) / (leverage - 1)

  return {
    strategyType: 'USX_recursive_loop',
    baseApy: loopscaleUSX.apy,
    leverage,
    loopscaleBorrowApy: loopscaleBorrow,
    effectiveApy: parseFloat(effectiveApy.toFixed(2)),
    healthFactor: parseFloat(healthFactor.toFixed(2)),
    breakEvenBorrowRate: parseFloat(breakEvenBorrowRate.toFixed(2)),
    steps: [
      `Supply USX on Loopscale at ${loopscaleUSX.apy.toFixed(2)}% base APY`,
      `Borrow USX at ${loopscaleBorrow.toFixed(2)}% against collateral (${leverage}× leverage)`,
      'Re-supply borrowed USX to compound yield',
    ],
  }
}

function toolStressTest(
  payload: OptimizePayload,
  args: {
    allocations: Array<{ protocol: string; strategy: string; percentage: number }>
    scenario: { apyShock?: number; borrowRateIncrease?: number; ltvDrop?: number }
  }
): object {
  const { scenario } = args
  const sources = payload.yieldSources

  const modifiedAllocations = args.allocations.map((alloc) => {
    const source = sources.find((s) =>
      s.protocol.toLowerCase() === alloc.protocol.toLowerCase() &&
      s.strategy.toLowerCase().includes(alloc.strategy.toLowerCase().split(' ')[0])
    )
    if (!source) return { ...alloc, adjustedApy: 0, originalApy: 0 }

    let adjustedApy = source.apy
    if (scenario.apyShock) adjustedApy += scenario.apyShock
    if (scenario.borrowRateIncrease && source.strategy.toLowerCase().includes('loop')) {
      adjustedApy -= scenario.borrowRateIncrease * 0.8  // approximate borrow cost increase
    }
    return { ...alloc, originalApy: source.apy, adjustedApy: Math.max(0, adjustedApy) }
  })

  const total = payload.portfolio.totalValueUsd
  const stressedBlendedApy = modifiedAllocations.reduce(
    (s, a) => s + (a.adjustedApy * a.percentage) / 100,
    0
  )
  const baseBlendedApy = modifiedAllocations.reduce(
    (s, a) => s + ((a.originalApy ?? 0) * a.percentage) / 100,
    0
  )

  const warnings = []
  if (stressedBlendedApy < 0) warnings.push('Portfolio goes negative APY under this scenario — rebalance recommended')
  if (stressedBlendedApy < 1) warnings.push('Blended APY drops below 1% — consider safer allocation')
  for (const alloc of modifiedAllocations) {
    if (alloc.adjustedApy < 0) warnings.push(`${alloc.protocol} ${alloc.strategy} goes negative (${alloc.adjustedApy.toFixed(2)}%)`)
  }

  const currentApy = total > 0
    ? payload.portfolio.positions.reduce((s, p) => s + (p.apy * p.valueUsd) / total, 0)
    : 0

  return {
    scenario,
    survivesScenario: stressedBlendedApy > currentApy,
    baseBlendedApy: parseFloat(baseBlendedApy.toFixed(2)),
    stressedBlendedApy: parseFloat(stressedBlendedApy.toFixed(2)),
    apyDropFromStress: parseFloat((baseBlendedApy - stressedBlendedApy).toFixed(2)),
    stillBeatsCurrentPortfolio: stressedBlendedApy > currentApy,
    annualUsdUnderStress: parseFloat(((stressedBlendedApy * total) / 100).toFixed(2)),
    warnings,
    breakdown: modifiedAllocations,
  }
}

// ── Tool definitions for Claude ────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_strategies',
    description: 'List available yield strategies filtered by risk profile and asset. Use this first to see what\'s available.',
    input_schema: {
      type: 'object',
      properties: {
        riskFilter: { type: 'string', enum: ['conservative', 'balanced', 'aggressive'], description: 'Risk profile filter' },
        asset: { type: 'string', description: 'Filter by asset (e.g. USX, eUSX). Omit for all.' },
      },
    },
  },
  {
    name: 'simulate_allocation',
    description: 'Compute blended APY and projected annual gain for a specific portfolio allocation. Use this to compare different allocation strategies.',
    input_schema: {
      type: 'object',
      properties: {
        allocations: {
          type: 'array',
          description: 'Array of protocol allocations that sum to 100%',
          items: {
            type: 'object',
            properties: {
              protocol: { type: 'string' },
              strategy: { type: 'string' },
              percentage: { type: 'number', description: 'Percentage of portfolio (0-100)' },
            },
            required: ['protocol', 'strategy', 'percentage'],
          },
        },
        totalValueUsd: { type: 'number', description: 'Override total portfolio value. Defaults to current portfolio value.' },
      },
      required: ['allocations'],
    },
  },
  {
    name: 'compute_leverage',
    description: 'Model a loop/leverage strategy. For eUSX: deposits as Kamino collateral, borrows USX, deploys borrowed USX. For USX: recursive loop on Loopscale.',
    input_schema: {
      type: 'object',
      properties: {
        asset: { type: 'string', enum: ['USX', 'eUSX'], description: 'Asset to leverage' },
        leverageTier: { type: 'string', enum: ['conservative', 'balanced', 'aggressive'], description: 'How aggressively to borrow' },
        deployProtocol: { type: 'string', description: 'Protocol to deploy borrowed USX into (for eUSX loop). Omit for best available.' },
        borrowRateOverride: { type: 'number', description: 'Override borrow rate (% APY) for stress testing' },
      },
      required: ['asset', 'leverageTier'],
    },
  },
  {
    name: 'stress_test',
    description: 'Test strategy resilience by simulating APY shocks or borrow rate increases. Always run this before recommending loop strategies.',
    input_schema: {
      type: 'object',
      properties: {
        allocations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              protocol: { type: 'string' },
              strategy: { type: 'string' },
              percentage: { type: 'number' },
            },
            required: ['protocol', 'strategy', 'percentage'],
          },
        },
        scenario: {
          type: 'object',
          properties: {
            apyShock: { type: 'number', description: 'APY change in percentage points (e.g. -2 = drop 2pp)' },
            borrowRateIncrease: { type: 'number', description: 'Borrow rate increase in percentage points' },
            ltvDrop: { type: 'number', description: 'LTV reduction (e.g. 0.1 = LTV drops by 10%)' },
          },
        },
      },
      required: ['allocations', 'scenario'],
    },
  },
  {
    name: 'produce_recommendation',
    description: 'Output the final portfolio recommendation. Call this when you have finished exploring strategies and stress testing.',
    input_schema: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: 'Single punchy sentence (e.g. "Stack 7.2% by layering eUSX loop + Exponent PT")' },
        reasoning: { type: 'string', description: '2-4 sentence explanation of WHY this allocation, referencing the specific portfolio state and simulations run' },
        allocations: {
          type: 'array',
          description: 'Final recommended allocations — percentages must sum to 100',
          items: {
            type: 'object',
            properties: {
              protocol: { type: 'string' },
              strategy: { type: 'string' },
              percentage: { type: 'number' },
              apy: { type: 'number', description: 'Effective APY for this allocation (use the value from simulate_allocation or compute_leverage)' },
              note: { type: 'string', description: 'Optional note specific to this position (e.g. maturity date, health factor warning)' },
            },
            required: ['protocol', 'strategy', 'percentage', 'apy'],
          },
        },
        blendedApy: { type: 'number' },
        apyImprovement: { type: 'number', description: 'vs current portfolio' },
        stressTestSummary: { type: 'string', description: 'One sentence on resilience (e.g. "Survives 3% borrow rate increase, dropping to 5.1%")' },
        warnings: { type: 'array', items: { type: 'string' }, description: 'Any risk warnings the user should know' },
      },
      required: ['headline', 'reasoning', 'allocations', 'blendedApy', 'apyImprovement'],
    },
  },
]

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an elite DeFi yield strategist for a Solana stablecoin yield optimizer. You reason about the user's specific portfolio and use simulation tools to find the optimal allocation.

GROUND RULES:
- Only recommend USX and eUSX strategies (tenant stablecoin ecosystem — never USDC, USDT, etc.)
- Never recommend Solstice as the deployment venue for borrowed USX (circular — Solstice IS the eUSX source)
- eUSX is a yield-bearing stablecoin that earns 3.3% by holding. The user may already hold eUSX.
- eUSX loop = deposit eUSX as Kamino collateral → borrow USX → deploy borrowed USX elsewhere
- If the user already has eUSX, the loop starts at step 2 (no conversion needed)

YOUR PROCESS:
1. Call list_strategies to see what's available at the requested risk level
2. Call simulate_allocation on 2-3 promising configurations
3. If loops are viable, call compute_leverage to get exact numbers
4. Always call stress_test on your leading candidate before finalizing
5. Call produce_recommendation with your final answer

WHAT MAKES THIS VALUABLE (things math can't do):
- Reason about fixed-rate maturity dates (Exponent PT matures June 2026 — no decay risk in short term)
- Note whether the user already has eUSX (saves the conversion step)
- Compare: "certainty of fixed rate PT vs upside of loop" for the specific risk profile
- Explain WHY the stress test result is acceptable (or not)
- Give a personal recommendation with numbers from the actual portfolio

Be decisive. Run 3-5 tool calls then produce_recommendation. Do not over-deliberate.`

// ── Request handler ────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return new Response('ANTHROPIC_API_KEY not configured', { status: 500 })

  let payload: OptimizePayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { portfolio, yieldSources, riskPreference, loopRates } = payload

  const anthropic = new Anthropic({ apiKey })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        const currentApy = portfolio.totalValueUsd > 0
          ? portfolio.positions.reduce((s, p) => s + (p.apy * p.valueUsd) / portfolio.totalValueUsd, 0)
          : 0

        const userMessage = JSON.stringify({
          portfolio: {
            totalValueUsd: portfolio.totalValueUsd,
            currentBlendedApy: parseFloat(currentApy.toFixed(2)),
            positions: portfolio.positions.map((p) => ({
              protocol: p.protocol,
              strategy: p.strategy,
              asset: p.asset,
              valueUsd: p.valueUsd,
              apy: p.apy,
              riskLevel: p.riskLevel,
            })),
          },
          riskPreference,
          liveRates: {
            kaminoBorrowApy: loopRates?.kaminoBorrowApy ?? 2.5,
            eusxLtv: loopRates?.eusxLtv ?? 0.75,
            loopscaleBorrowApy: loopRates?.loopscaleBorrowApy ?? 2.0,
          },
          instruction: `Find the best yield allocation for this portfolio. Risk preference: ${riskPreference}. Use your tools to explore, simulate, and stress-test before recommending.`,
        })

        const messages: Anthropic.MessageParam[] = [
          { role: 'user', content: userMessage },
        ]

        for (let turn = 0; turn < 8; turn++) {
          const response = await anthropic.messages.create({
            model: 'claude-opus-4-5-20251101',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages,
          })

          // Stream any text reasoning
          for (const block of response.content) {
            if (block.type === 'text' && block.text.trim()) {
              send({ type: 'thinking', text: block.text.trim() })
            }
          }

          if (response.stop_reason === 'end_turn') break

          const toolUses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
          if (!toolUses.length) break

          // Add assistant message
          messages.push({ role: 'assistant', content: response.content })

          const toolResults: Anthropic.ToolResultBlockParam[] = []
          let finalRec: {
            headline: string
            reasoning: string
            allocations: Array<{ protocol: string; strategy: string; percentage: number; note?: string }>
            blendedApy: number
            apyImprovement: number
            stressTestSummary?: string
            warnings?: string[]
          } | null = null

          for (const toolUse of toolUses) {
            if (toolUse.name === 'produce_recommendation') {
              finalRec = toolUse.input as typeof finalRec
              break
            }

            let result: object
            const input = toolUse.input as Record<string, unknown>

            if (toolUse.name === 'list_strategies') {
              result = toolListStrategies(yieldSources, riskPreference, input as Parameters<typeof toolListStrategies>[2])
              send({ type: 'thinking', text: `Scanning ${(result as { count: number }).count} strategies at ${input.riskFilter ?? riskPreference} risk level…` })
            } else if (toolUse.name === 'simulate_allocation') {
              result = toolSimulateAllocation(payload, input as Parameters<typeof toolSimulateAllocation>[1])
              const res = result as { blendedApy: number; apyImprovement: number; annualGainUsd: number }
              send({ type: 'thinking', text: `Simulating allocation → ${res.blendedApy.toFixed(2)}% blended (+${res.apyImprovement.toFixed(2)}% vs now, +$${res.annualGainUsd.toFixed(0)}/yr)` })
            } else if (toolUse.name === 'compute_leverage') {
              result = toolComputeLeverage(yieldSources, loopRates, input as Parameters<typeof toolComputeLeverage>[2])
              const res = result as { effectiveApy?: number; healthFactor?: number }
              if (res.effectiveApy !== undefined) {
                send({ type: 'thinking', text: `${input.asset} ${input.leverageTier} loop → ${res.effectiveApy.toFixed(2)}% effective APY, health factor ${res.healthFactor?.toFixed(2)}` })
              }
            } else if (toolUse.name === 'stress_test') {
              result = toolStressTest(payload, input as Parameters<typeof toolStressTest>[1])
              const res = result as { stressedBlendedApy: number; survivesScenario: boolean }
              const scenario = (input.scenario as { apyShock?: number; borrowRateIncrease?: number }) ?? {}
              const scenarioDesc = scenario.borrowRateIncrease
                ? `+${scenario.borrowRateIncrease}% borrow rate`
                : scenario.apyShock
                ? `${scenario.apyShock}% APY shock`
                : 'stress scenario'
              send({
                type: 'thinking',
                text: `Stress test (${scenarioDesc}) → ${res.stressedBlendedApy.toFixed(2)}% APY. ${res.survivesScenario ? 'Still beats current portfolio.' : 'Falls below current — adjusting…'}`,
              })
            } else {
              result = { error: `Unknown tool: ${toolUse.name}` }
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            })
          }

          if (finalRec) {
            send({ type: 'result', recommendation: finalRec })
            break
          }

          messages.push({ role: 'user', content: toolResults })
        }
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
