import { proxyAnthropicCall, isIntelligenceAvailable } from './client'
import { YIELD_STORY_SYSTEM, YIELD_STORY_TOOL } from './prompts/yield-story'
import { ANOMALY_DETECTION_SYSTEM, ANOMALY_DETECTION_TOOL } from './prompts/anomaly'
import { OPPORTUNITY_SYSTEM, OPPORTUNITY_TOOL } from './prompts/opportunity'
import type { Position, YieldSource, StablecoinPeg, ProtocolHealth } from '@/core/defi'
import type { YieldStory, Anomaly, Opportunity } from '@/stores/intelligence-store'
import { getCachedIntelligence, cacheIntelligence } from '@/db/repositories/intelligence-cache'

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString(36)
}

function extractToolUse(response: unknown): { input: unknown } | null {
  const r = response as { content?: Array<{ type: string; input?: unknown }> }
  return r?.content?.find((c) => c.type === 'tool_use') as { input: unknown } | null ?? null
}

export async function generateYieldStory(
  positions: Position[],
  sources: YieldSource[]
): Promise<YieldStory | null> {
  if (!isIntelligenceAvailable()) return null

  const contextData = JSON.stringify({ positions, sources })
  const promptHash = hashString('yield-story')
  const contextHash = hashString(contextData)

  const cached = await getCachedIntelligence(promptHash, contextHash)
  if (cached) return cached as YieldStory

  try {
    const response = await proxyAnthropicCall({
      messages: [{ role: 'user', content: `Analyze this user's DeFi positions and yield sources:\n\n${contextData}` }],
      system: YIELD_STORY_SYSTEM,
      tools: [YIELD_STORY_TOOL],
      maxTokens: 1024,
    })

    const toolUse = extractToolUse(response)
    if (!toolUse) return null

    const story: YieldStory = {
      ...(toolUse.input as Omit<YieldStory, 'generatedAt'>),
      generatedAt: Date.now(),
    }

    await cacheIntelligence(promptHash, contextHash, story, 300_000)
    return story
  } catch (err) {
    console.error('[intelligence] Failed to generate yield story', err)
    return null
  }
}

export async function detectAnomalies(
  positions: Position[],
  pegs: StablecoinPeg[],
  health: ProtocolHealth[]
): Promise<Anomaly[]> {
  if (!isIntelligenceAvailable()) return []

  const contextData = JSON.stringify({ positions, pegs, health })
  const promptHash = hashString('anomaly-detection')
  const contextHash = hashString(contextData)

  const cached = await getCachedIntelligence(promptHash, contextHash)
  if (cached) return cached as Anomaly[]

  try {
    const response = await proxyAnthropicCall({
      messages: [{ role: 'user', content: `Analyze this DeFi data for anomalies:\n\n${contextData}` }],
      system: ANOMALY_DETECTION_SYSTEM,
      tools: [ANOMALY_DETECTION_TOOL],
      maxTokens: 1024,
    })

    const toolUse = extractToolUse(response)
    if (!toolUse) return []

    const input = toolUse.input as { anomalies: Array<Omit<Anomaly, 'id' | 'detectedAt' | 'acknowledged'>> }
    const anomalies: Anomaly[] = input.anomalies.map((a, i) => ({
      ...a,
      id: `anomaly-${Date.now()}-${i}`,
      detectedAt: Date.now(),
      acknowledged: false,
    }))

    await cacheIntelligence(promptHash, contextHash, anomalies, 120_000)
    return anomalies
  } catch (err) {
    console.error('[intelligence] Failed to detect anomalies', err)
    return []
  }
}

export async function surfaceOpportunities(
  positions: Position[],
  allSources: YieldSource[]
): Promise<Opportunity[]> {
  if (!isIntelligenceAvailable()) return []

  const contextData = JSON.stringify({ positions, allSources })
  const promptHash = hashString('opportunities')
  const contextHash = hashString(contextData)

  const cached = await getCachedIntelligence(promptHash, contextHash)
  if (cached) return cached as Opportunity[]

  try {
    const response = await proxyAnthropicCall({
      messages: [{ role: 'user', content: `Find yield opportunities based on current positions and available sources:\n\n${contextData}` }],
      system: OPPORTUNITY_SYSTEM,
      tools: [OPPORTUNITY_TOOL],
      maxTokens: 1024,
    })

    const toolUse = extractToolUse(response)
    if (!toolUse) return []

    const input = toolUse.input as { opportunities: Array<Omit<Opportunity, 'id' | 'detectedAt'>> }
    const opportunities: Opportunity[] = input.opportunities.map((o, i) => ({
      ...o,
      id: `opp-${Date.now()}-${i}`,
      detectedAt: Date.now(),
    }))

    await cacheIntelligence(promptHash, contextHash, opportunities, 300_000)
    return opportunities
  } catch (err) {
    console.error('[intelligence] Failed to surface opportunities', err)
    return []
  }
}
