import { getAnthropicClient, isIntelligenceAvailable } from './client'
import { sortByRAYS } from './risk-adjusted-yield'
import { isIdleCapital } from '@/adapters/solana/token-registry'
import { computePositionDiff } from '@/mutation/diff'
import type { Position, YieldSource, TokenBalance, StablecoinPeg } from '@/core/defi'
import type { ActionDiff } from '@/core/mutation'
import { getTenantConfig, filterSourcesForTenant, type TenantConfig } from '@/config/tenant'

export interface IntelligenceItem {
  id: string
  type: 'action' | 'insight' | 'alert'
  headline: string
  body: string
  confidence: number
  action?: {
    label: string
    diff: ActionDiff
  }
  dataPoints?: Array<{ label: string; value: string; trend: 'up' | 'down' | 'flat' }>
  timestamp: number
}

interface AgentContext {
  positions: Position[]
  balances: TokenBalance[]
  sources: YieldSource[]
  pegs?: StablecoinPeg[]
}

let cachedItems: IntelligenceItem[] | null = null
let cacheTimestamp = 0
let cacheFingerprint = ''
const CACHE_TTL = 300_000
/** Keep the UI readable — no wall of protocol cards. */
const MAX_INTEL_ITEMS = 3

function clampIntelligenceItems(items: IntelligenceItem[]): IntelligenceItem[] {
  if (items.length <= MAX_INTEL_ITEMS) return items
  const actions = items.filter((i) => i.type === 'action')
  const alerts = items.filter((i) => i.type === 'alert')
  const insights = items.filter((i) => i.type === 'insight')
  const out: IntelligenceItem[] = []
  if (insights[0]) out.push(insights[0])
  if (actions[0]) out.push(actions[0])
  if (alerts[0] && out.length < MAX_INTEL_ITEMS) out.push(alerts[0])
  if (out.length < MAX_INTEL_ITEMS && insights[1]) out.push(insights[1])
  return out.slice(0, MAX_INTEL_ITEMS)
}

const AGENT_SYSTEM = `You are an elite DeFi yield analyst for STABLECOIN / YIELD-BEARING STABLE positions.

CRITICAL GROUND TRUTH (must follow):
- Only use balances, positions, and USD values from the JSON field "portfolioTruth". Do not invent holdings or amounts.
- If "tenantStablecoin" is set, every recommendation MUST be about that stablecoin ecosystem (e.g. USX vaults, USX lending) OR explicitly compare the user's current deployment to pools listed in "relevantYieldSources" only.
- If the user holds the tenant stablecoin in "walletBalances" (idle) OR in "deployedPositions", you MUST acknowledge it in the first item (how much $, where: wallet vs protocol).
- If "deployedPositions" is empty but "walletBalances" shows the tenant stablecoin, say they hold USX (or the tenant symbol) in the wallet — NOT "no portfolio".
- NEVER recommend random SOL staking, JLP, or unrelated assets unless the user actually holds those tokens (see allTokenBalances).
- "relevantYieldSources" is the ONLY pool universe you may cite for APY comparisons or suggested moves.

TENANT STABLECOIN LOYALTY (e.g. USX issuer / USX holders — non-negotiable):
- NEVER recommend swapping, exiting, or "optimizing" BY moving the tenant stablecoin (e.g. USX) into a different stablecoin such as USDG, USDC, USDT, PYUSD, or DAI for yield. That is off-mission and must not appear.
- You MAY recommend: deploying idle USX into USX vaults/lend, rebalancing between USX yield venues, or improving APY while staying in USX / eUSX (Kamino interest-bearing USX).
- You MAY recommend moving *into* USX (e.g. from SOL or other assets) if the user holds those assets and wants yield — but do NOT tell them to leave USX for another stable.

Your job: produce at most ${MAX_INTEL_ITEMS} items total (fewer is better). Do NOT spam protocol names (Orca, Raydium, Exponent, etc.) unless the user actually holds a position there — one coherent story beats a list of venues.
- Prefer ONE primary "insight" that summarizes their USX/tenant situation (wallet vs deployed, $ amounts, APY).
- At most ONE "action" if there is a clear deploy or rebalance within relevantYieldSources.
- Optional ONE "alert" if something is urgent.

Each item is one of:
- "insight": The main narrative (use this first).
- "action": Single best action from relevantYieldSources only.
- "alert": Urgent note only if needed.

Rules:
- Be specific with numbers from portfolioTruth only.
- If the user has idle tenant stablecoin in the wallet, the first insight MUST mention it with USD amount.
- Never produce 4+ items.`

const AGENT_TOOL = {
  name: 'produce_intelligence' as const,
  description: 'Produce intelligence items based on portfolio and market analysis',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            type: { type: 'string' as const, enum: ['action', 'insight', 'alert'] },
            headline: { type: 'string' as const, description: 'Short punchy headline (max 10 words)' },
            body: { type: 'string' as const, description: '2-3 sentences with specific data' },
            confidence: { type: 'number' as const, description: '0 to 1' },
            actionProtocol: { type: 'string' as const, description: 'Target protocol for action items' },
            actionStrategy: { type: 'string' as const, description: 'Target strategy for action items' },
            actionType: { type: 'string' as const, enum: ['deposit', 'migrate', 'withdraw', 'rebalance'] },
            actionAmount: { type: 'number' as const, description: 'USD amount for the action' },
            dataPoints: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                properties: {
                  label: { type: 'string' as const },
                  value: { type: 'string' as const },
                  trend: { type: 'string' as const, enum: ['up', 'down', 'flat'] },
                },
                required: ['label', 'value', 'trend'],
              },
            },
          },
          required: ['type', 'headline', 'body', 'confidence'],
        },
      },
    },
    required: ['items'] as string[],
  },
}

function portfolioFingerprint(ctx: AgentContext): string {
  const bal = ctx.balances.map((b) => `${b.mint}:${(Math.round(b.uiAmount * 1e4) / 1e4).toFixed(4)}`).join('|')
  const pos = ctx.positions.map((p) => `${p.id}:${Math.floor(p.valueUsd)}:${Math.round(p.apy * 10) / 10}`).join('|')
  const src = ctx.sources.length
  return `${bal}#${pos}#${src}`
}

export async function generateIntelligence(ctx: AgentContext): Promise<IntelligenceItem[]> {
  const fp = portfolioFingerprint(ctx)
  if (Date.now() - cacheTimestamp < CACHE_TTL && cachedItems && cacheFingerprint === fp) {
    return cachedItems
  }

  const items = await generateWithAI(ctx)
  cachedItems = items
  cacheFingerprint = fp
  cacheTimestamp = Date.now()
  return items
}

export function clearIntelligenceCache(): void {
  cachedItems = null
  cacheTimestamp = 0
  cacheFingerprint = ''
}

/**
 * Pool is relevant to the tenant stable: name contains USX/USDC/… OR underlying mint matches tenant mint
 * (DeFi Llama often labels Kamino pools as "CASH" while underlying is USX).
 */
function poolMentionsTenantStable(s: YieldSource, tenant: TenantConfig | null): boolean {
  if (!tenant?.stablecoin) return true
  const sym = tenant.stablecoin.toUpperCase()
  const t = `${s.asset} ${s.strategy}`.toUpperCase()
  const mint = tenant.stablecoinMint

  if (sym === 'USX') {
    if (t.includes('USX') || t.includes('KUSX') || t.includes('EUSX')) return true
    if (mint && s.underlyingMints?.some((m) => m.toLowerCase() === mint.toLowerCase())) return true
    return false
  }

  if (mint && s.underlyingMints?.some((m) => m.toLowerCase() === mint.toLowerCase())) return true
  return t.includes(sym)
}

/** Drop pools that are clearly other stables with no tenant symbol (e.g. USDG vaults for USX tenant). */
function isOtherStableOnlyPool(s: YieldSource, tenant: TenantConfig | null): boolean {
  if (!tenant?.stablecoin || poolMentionsTenantStable(s, tenant)) return false
  const t = `${s.asset} ${s.strategy}`.toUpperCase()
  const competitors = ['USDG', 'USDC', 'USDT', 'PYUSD', 'DAI', 'FDUSD', 'TUSD', 'USDE']
  return competitors.some((c) => t.includes(c))
}

/**
 * Yield pools for the AI and fallbacks.
 * USX tenant: ONLY pools whose asset/strategy text includes USX / eUSX — never fall back to Kamino CASH / other stables.
 */
function selectRelevantYieldSources(
  sources: YieldSource[],
  pegs: StablecoinPeg[] | undefined,
  tenant: ReturnType<typeof getTenantConfig>
): Array<ReturnType<typeof sortByRAYS>[number]> {
  const ranked = sortByRAYS(sources, pegs)
  if (!tenant) return ranked.slice(0, 15)

  const sym = tenant.stablecoin.toUpperCase()

  // Pools that explicitly mention the tenant stable in name (USX, USDC, …)
  const strictSymbol = ranked.filter((s) => poolMentionsTenantStable(s, tenant))

  // USX issuer mode: strict only — do not substitute random stablecoin products (e.g. Kamino CASH)
  if (sym === 'USX') {
    return sortByRAYS(strictSymbol, pegs).slice(0, 15)
  }

  const inPreferred = filterSourcesForTenant(strictSymbol, tenant).filter(
    (s) => !isOtherStableOnlyPool(s, tenant)
  )
  let pool = inPreferred.length > 0 ? inPreferred : strictSymbol
  if (pool.length > 0) return sortByRAYS(pool, pegs).slice(0, 15)

  const loose = filterSourcesForTenant(ranked, tenant).filter((s) => !isOtherStableOnlyPool(s, tenant))
  return sortByRAYS(loose, pegs).slice(0, 15)
}

async function generateWithAI(ctx: AgentContext): Promise<IntelligenceItem[]> {
  if (!isIntelligenceAvailable()) {
    return generateFallbackIntelligence(ctx)
  }

  const tenant = getTenantConfig()
  const topSources = selectRelevantYieldSources(ctx.sources, ctx.pegs, tenant)

  const idleBalances = ctx.balances.filter((b) => isIdleCapital(b.mint) && b.uiAmount > 0 && b.valueUsd > 0.5)
  const totalIdle = idleBalances.reduce((s, b) => s + b.valueUsd, 0)
  const totalPositionValue = ctx.positions.reduce((s, p) => s + p.valueUsd, 0)

  const tenantMint = tenant?.stablecoinMint
  const walletTenantStable = tenantMint
    ? ctx.balances.find((b) => b.mint === tenantMint && b.uiAmount > 0)
    : undefined
  const walletTenantUsd = walletTenantStable
    ? (walletTenantStable.valueUsd > 0 ? walletTenantStable.valueUsd : walletTenantStable.uiAmount)
    : 0

  const context = JSON.stringify({
    tenantStablecoin: tenant
      ? { symbol: tenant.stablecoin, mint: tenant.stablecoinMint, brand: tenant.brandName }
      : null,
    optimizationConstraints: {
      neverExitTenantStablecoinToOtherStables: true,
      allowed: ['deploy_idle_tenant_stable', 'rebalance_between_tenant_pools', 'move_other_assets_into_tenant_stable'],
      forbidden: ['swap_tenant_stable_for_USDG_USDC_USDT_or_other_stables_for_yield'],
    },
    portfolioTruth: {
      totalValueUsd: totalPositionValue + totalIdle,
      walletBalances: ctx.balances
        .filter((b) => b.uiAmount > 0)
        .map((b) => ({
          mint: b.mint,
          symbol: b.symbol,
          uiAmount: b.uiAmount,
          valueUsd: b.valueUsd,
        })),
      tenantStableInWalletUsd: walletTenantUsd,
      deployedPositions: ctx.positions.map((p) => ({
        protocol: p.protocol,
        strategy: p.strategy,
        asset: p.asset,
        valueUsd: p.valueUsd,
        apy: p.apy,
        riskLevel: p.riskLevel,
      })),
      idleStableUsd: totalIdle,
      idleStableBreakdown: idleBalances.map((b) => ({
        symbol: b.symbol,
        mint: b.mint,
        valueUsd: b.valueUsd,
        uiAmount: b.uiAmount,
      })),
    },
    relevantYieldSources: topSources.map((s) => ({
      protocol: s.protocol,
      strategy: s.strategy,
      asset: s.asset,
      apy: s.apy,
      adjustedApy: s.rays.adjustedApy,
      raysGrade: s.rays.grade,
      tvl: s.tvl,
      riskLevel: s.riskLevel,
      stablecoin: s.stablecoin,
      audited: s.audited,
    })),
    relevantYieldSourcesNote:
      topSources.length === 0 && tenant?.stablecoin.toUpperCase() === 'USX'
        ? 'USX_MODE: Index returned ZERO USX/eUSX-labeled pools. Do NOT cite Kamino CASH, generic stables, or other protocols as top yield. Only discuss user USX and eUSX balances and deploying USX into USX venues when pools are unknown.'
        : undefined,
  })

  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: AGENT_SYSTEM,
      tools: [AGENT_TOOL],
      messages: [{ role: 'user', content: context }],
    })

    const toolUse = response.content.find((c) => c.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return generateFallbackIntelligence(ctx)
    }

    const parsed = toolUse.input as {
      items: Array<{
        type: 'action' | 'insight' | 'alert'
        headline: string
        body: string
        confidence: number
        actionProtocol?: string
        actionStrategy?: string
        actionType?: string
        actionAmount?: number
        dataPoints?: Array<{ label: string; value: string; trend: 'up' | 'down' | 'flat' }>
      }>
    }

    const mapped = parsed.items.map((item, i) => {
      const result: IntelligenceItem = {
        id: `intel-${Date.now()}-${i}`,
        type: item.type,
        headline: item.headline,
        body: item.body,
        confidence: item.confidence,
        dataPoints: item.dataPoints,
        timestamp: Date.now(),
      }

      if (item.type === 'action' && item.actionProtocol && item.actionStrategy) {
        const targetSource = topSources.find(
          (s) => s.protocol.toLowerCase() === item.actionProtocol!.toLowerCase() &&
                 s.strategy.toLowerCase().includes(item.actionStrategy!.toLowerCase().split(' ')[0])
        ) ?? topSources.find(
          (s) => s.protocol.toLowerCase() === item.actionProtocol!.toLowerCase()
        )

        if (targetSource) {
          const amount = item.actionAmount ?? totalIdle
          const existingPosition = ctx.positions.find(
            (p) => p.protocol === targetSource.protocol
          )

          let diff: ActionDiff
          if (existingPosition && item.actionType === 'migrate') {
            diff = computePositionDiff(existingPosition, targetSource, amount)
          } else {
            diff = {
              id: `agent-${Date.now()}-${i}`,
              type: (item.actionType as ActionDiff['type']) ?? 'deposit',
              protocol: targetSource.protocol,
              strategy: targetSource.strategy,
              diffs: [
                { field: 'amount', before: 0, after: amount },
                { field: 'apy', before: 0, after: targetSource.apy, changePercent: 100 },
              ],
              estimatedFees: 0.001,
              estimatedGas: 200_000,
              riskDelta: 0,
              apyDelta: targetSource.apy,
              projectedAnnualChange: (amount * targetSource.apy) / 100,
              steps: [{
                id: `step-${i}`,
                label: `Deposit into ${targetSource.protocol}`,
                instruction: `Deposit $${amount.toFixed(0)} into ${targetSource.strategy}`,
                status: 'pending',
              }],
            }
          }

          result.action = {
            label: item.actionType === 'migrate' ? 'Move Funds' : 'Deploy',
            diff,
          }
        }
      }

      return result
    })
    return clampIntelligenceItems(mapped)
  } catch (err) {
    console.error('[agent] AI generation failed, using fallback', err)
    return generateFallbackIntelligence(ctx)
  }
}

function generateFallbackIntelligence(ctx: AgentContext): IntelligenceItem[] {
  const items: IntelligenceItem[] = []
  const tenant = getTenantConfig()
  const ranked = selectRelevantYieldSources(ctx.sources, ctx.pegs, tenant)
  const idleBalances = ctx.balances.filter((b) => isIdleCapital(b.mint) && b.uiAmount > 0 && b.valueUsd > 0.5)
  const totalIdle = idleBalances.reduce((s, b) => s + b.valueUsd, 0)
  const stablecoinName = tenant?.stablecoin ?? 'stablecoins'

  const minTvlUsd = tenant?.stablecoin.toUpperCase() === 'USX' ? 250_000 : 5_000_000

  if (totalIdle > 1) {
    const bestStable = ranked.find(
      (s) =>
        poolMentionsTenantStable(s, tenant) &&
        s.stablecoin &&
        s.riskLevel !== 'critical' &&
        s.tvl > minTvlUsd
    )
    if (bestStable) {
      const annualGain = (totalIdle * bestStable.apy) / 100
      items.push({
        id: `fallback-idle-${Date.now()}`,
        type: 'action',
        headline: `$${totalIdle.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${stablecoinName} sitting idle`,
        body: `You have ${stablecoinName} in your wallet earning 0%. Deploying to ${bestStable.protocol} (${bestStable.strategy}) would earn ${bestStable.apy.toFixed(1)}% APY — that's +$${annualGain.toFixed(0)}/year.`,
        confidence: 0.9,
        action: {
          label: 'Deploy',
          diff: {
            id: `fallback-deploy-${Date.now()}`,
            type: 'deposit',
            protocol: bestStable.protocol,
            strategy: bestStable.strategy,
            diffs: [
              { field: 'amount', before: 0, after: totalIdle },
              { field: 'apy', before: 0, after: bestStable.apy, changePercent: 100 },
            ],
            estimatedFees: 0.001,
            estimatedGas: 200_000,
            riskDelta: 0,
            apyDelta: bestStable.apy,
            projectedAnnualChange: annualGain,
            steps: [{
              id: 'step-deploy',
              label: `Deposit into ${bestStable.protocol}`,
              instruction: `Deposit $${totalIdle.toFixed(0)} into ${bestStable.strategy}`,
              status: 'pending',
            }],
          },
        },
        timestamp: Date.now(),
      })
    }
  }

  for (const pos of ctx.positions) {
    const better = ranked.find(
      (s) =>
        poolMentionsTenantStable(s, tenant) &&
        s.apy > pos.apy + 1 &&
        s.riskLevel !== 'critical' &&
        s.tvl > minTvlUsd &&
        !(s.protocol === pos.protocol && s.strategy === pos.strategy)
    )
    if (better && pos.valueUsd > 10) {
      const apyGain = better.apy - pos.apy
      const annualGain = (pos.valueUsd * apyGain) / 100
      items.push({
        id: `fallback-improve-${pos.id}`,
        type: 'action',
        headline: `Better yield available for ${pos.asset}`,
        body: `Your ${pos.asset} on ${pos.protocol} earns ${pos.apy.toFixed(1)}%. ${better.protocol} offers ${better.apy.toFixed(1)}% for the same asset — that's +${apyGain.toFixed(1)}% more (+$${annualGain.toFixed(0)}/year on your $${pos.valueUsd.toFixed(0)}).`,
        confidence: 0.8,
        action: {
          label: 'Move Funds',
          diff: computePositionDiff(pos, better, pos.valueUsd),
        },
        dataPoints: [
          { label: 'Current APY', value: `${pos.apy.toFixed(1)}%`, trend: 'flat' },
          { label: 'Target APY', value: `${better.apy.toFixed(1)}%`, trend: 'up' },
          { label: 'Annual Gain', value: `+$${annualGain.toFixed(0)}`, trend: 'up' },
        ],
        timestamp: Date.now(),
      })
    }
  }

  if (items.length < 3) {
    if (tenant?.stablecoin.toUpperCase() === 'USX' && ranked.length === 0) {
      items.push({
        id: `fallback-usx-index-${Date.now()}`,
        type: 'insight',
        headline: 'No USX pools in the live yield index',
        body:
          'We filter out generic stable products (e.g. Kamino CASH) for USX mode. The index did not return USX/eUSX-labeled pools this run — that can happen if venues rename strategies. Your balances still track USX and eUSX (Kamino); focus deployment on Kamino USX supply.',
        confidence: 0.55,
        timestamp: Date.now(),
      })
    } else if (ranked.length > 0) {
      const topSource = ranked[0]
      items.push({
        id: `fallback-market-${Date.now()}`,
        type: 'insight',
        headline: `Top ${stablecoinName} yield: ${topSource.protocol} at ${topSource.apy.toFixed(1)}%`,
        body: `${topSource.protocol} ${topSource.strategy} is among the best risk-adjusted ${stablecoinName}-named pools we see at ${topSource.apy.toFixed(1)}% APY with $${(topSource.tvl / 1_000_000).toFixed(1)}M TVL. RAYS grade: ${topSource.rays.grade}.`,
        confidence: 0.7,
        dataPoints: [
          { label: 'APY', value: `${topSource.apy.toFixed(1)}%`, trend: 'flat' },
          { label: 'TVL', value: `$${(topSource.tvl / 1_000_000).toFixed(1)}M`, trend: 'flat' },
          { label: 'Risk', value: topSource.riskLevel, trend: 'flat' },
        ],
        timestamp: Date.now(),
      })
    }
  }

  return clampIntelligenceItems(items)
}

export async function askAgent(
  question: string,
  ctx: AgentContext
): Promise<IntelligenceItem> {
  if (!isIntelligenceAvailable()) {
    return {
      id: `chat-${Date.now()}`,
      type: 'insight',
      headline: 'AI unavailable',
      body: 'Set VITE_ANTHROPIC_API_KEY to enable AI intelligence.',
      confidence: 0,
      timestamp: Date.now(),
    }
  }

  const tenant = getTenantConfig()
  const topSources = selectRelevantYieldSources(ctx.sources, ctx.pegs, tenant).slice(0, 12)
  const idleBalances = ctx.balances.filter((b) => isIdleCapital(b.mint) && b.uiAmount > 0 && b.valueUsd > 0.5)
  const tenantMint = tenant?.stablecoinMint
  const walletTenantStable = tenantMint
    ? ctx.balances.find((b) => b.mint === tenantMint && b.uiAmount > 0)
    : undefined
  const walletTenantUsd = walletTenantStable
    ? (walletTenantStable.valueUsd > 0 ? walletTenantStable.valueUsd : walletTenantStable.uiAmount)
    : 0

  const context = JSON.stringify({
    question,
    tenantStablecoin: tenant ? { symbol: tenant.stablecoin, mint: tenant.stablecoinMint } : null,
    optimizationConstraints: {
      neverExitTenantStablecoinToOtherStables: true,
      forbidden: ['swap_USX_for_USDG_USDC_USDT_PYUSD_for_yield'],
    },
    portfolioTruth: {
      allTokenBalances: ctx.balances.filter((b) => b.uiAmount > 0).map((b) => ({
        mint: b.mint, symbol: b.symbol, uiAmount: b.uiAmount, valueUsd: b.valueUsd,
      })),
      tenantStableInWalletUsd: walletTenantUsd,
      deployedPositions: ctx.positions.map((p) => ({
        protocol: p.protocol, strategy: p.strategy, asset: p.asset,
        valueUsd: p.valueUsd, apy: p.apy,
      })),
      idleStableBreakdown: idleBalances.map((b) => ({ symbol: b.symbol, valueUsd: b.valueUsd })),
    },
    relevantYieldSourcesOnly: topSources.map((s) => ({
      protocol: s.protocol, strategy: s.strategy, asset: s.asset, apy: s.apy,
      adjustedApy: s.rays.adjustedApy, raysGrade: s.rays.grade,
      tvl: s.tvl, riskLevel: s.riskLevel, stablecoin: s.stablecoin,
    })),
  })

  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are a DeFi yield advisor for the tenant stablecoin (tenantStablecoin). Only cite APYs from relevantYieldSourcesOnly.
Never recommend swapping the tenant stablecoin (e.g. USX) for USDG, USDC, USDT, or other stables for "yield". Stay in the tenant stable ecosystem.
You may suggest deploying into USX vaults, moving between USX venues, or bringing other assets into USX — not exiting USX for another stable.
Use allTokenBalances and deployedPositions exactly. Answer in 2-5 sentences.`,
      messages: [{ role: 'user', content: context }],
    })

    const text = response.content
      .filter((c) => c.type === 'text')
      .map((c) => c.type === 'text' ? c.text : '')
      .join('')

    const firstSentence = text.split('.')[0] ?? 'Analysis'

    return {
      id: `chat-${Date.now()}`,
      type: 'insight',
      headline: firstSentence.length > 60 ? firstSentence.slice(0, 57) + '...' : firstSentence,
      body: text,
      confidence: 0.8,
      timestamp: Date.now(),
    }
  } catch (err) {
    console.error('[agent] Chat failed', err)
    return {
      id: `chat-${Date.now()}`,
      type: 'insight',
      headline: 'Unable to analyze',
      body: 'Failed to process your question. Please try again.',
      confidence: 0,
      timestamp: Date.now(),
    }
  }
}
