import type { YieldSource } from '@/core/defi'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OptimizePayload {
  portfolio: {
    positions: Array<{
      id: string
      protocol: string
      strategy: string
      asset: string
      amount: number
      valueUsd: number
      apy: number
      riskLevel: string
      riskFactors: string[]
    }>
    totalValueUsd: number
  }
  yieldSources: YieldSource[]
  riskPreference: 'conservative' | 'balanced' | 'aggressive'
  loopRates?: {
    kaminoBorrowApy: number
    eusxLtv: number
    loopscaleBorrowApy: number
  }
}

export type OptimizeEvent =
  | { type: 'thinking'; text: string }
  | {
      type: 'result'
      recommendation: {
        headline: string
        reasoning: string
        allocations: Array<{ protocol: string; strategy: string; percentage: number; apy?: number; note?: string }>
        blendedApy: number
        apyImprovement: number
        stressTestSummary?: string
        warnings?: string[]
      }
    }
  | { type: 'error'; message: string }

// ── Streaming optimizer ────────────────────────────────────────────────────────

export async function* streamOptimize(payload: OptimizePayload): AsyncGenerator<OptimizeEvent> {
  const res = await fetch('/api/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok || !res.body) {
    yield { type: 'error', message: `Optimizer request failed (${res.status})` }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          yield JSON.parse(line.slice(6)) as OptimizeEvent
        } catch {
          // skip malformed line
        }
      }
    }
  }
}

// ── Chat proxy (used by intelligence panel) ────────────────────────────────────

export async function proxyAnthropicCall(body: {
  messages: unknown[]
  system?: string
  tools?: unknown[]
  maxTokens?: number
}): Promise<unknown> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Chat API error: ${res.status}`)
  return res.json()
}

// ── Availability ───────────────────────────────────────────────────────────────

/** Always true in production — API key lives server-side. */
export function isIntelligenceAvailable(): boolean {
  return true
}
