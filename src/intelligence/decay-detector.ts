import type { Position, YieldSource } from '@/core/defi'
import { getYieldHistory } from '@/db/repositories/yield-snapshots'

export interface DecayAlert {
  id: string
  positionId: string
  protocol: string
  strategy: string
  asset: string
  currentApy: number
  previousApy: number
  decayPercent: number
  periodDays: number
  bestAlternative: YieldSource | null
  detectedAt: number
}

const DECAY_THRESHOLD_PERCENT = 20
const LOOKBACK_DAYS = 7

export async function detectYieldDecay(
  positions: Position[],
  sources: YieldSource[]
): Promise<DecayAlert[]> {
  const alerts: DecayAlert[] = []
  const since = Date.now() - LOOKBACK_DAYS * 86400_000

  for (const position of positions) {
    try {
      const history = await getYieldHistory(position.protocol, position.strategy, since)
      if (history.length < 2) continue

      const oldest = history[0]
      const newest = history[history.length - 1]

      if (oldest.apy <= 0) continue

      const decayPercent = ((oldest.apy - newest.apy) / oldest.apy) * 100

      if (decayPercent >= DECAY_THRESHOLD_PERCENT) {
        const sameAssetSources = sources.filter(
          (s) => s.asset === position.asset &&
            !(s.protocol === position.protocol && s.strategy === position.strategy)
        )
        const bestAlt = sameAssetSources.reduce<YieldSource | null>(
          (best, s) => (!best || s.apy > best.apy ? s : best),
          null
        )

        alerts.push({
          id: `decay-${position.id}-${Date.now()}`,
          positionId: position.id,
          protocol: position.protocol,
          strategy: position.strategy,
          asset: position.asset,
          currentApy: newest.apy,
          previousApy: oldest.apy,
          decayPercent,
          periodDays: LOOKBACK_DAYS,
          bestAlternative: bestAlt,
          detectedAt: Date.now(),
        })
      }
    } catch {
      // Skip positions where history lookup fails
    }
  }

  return alerts.sort((a, b) => b.decayPercent - a.decayPercent)
}
