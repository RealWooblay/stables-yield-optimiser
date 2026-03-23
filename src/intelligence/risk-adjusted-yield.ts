import type { YieldSource, StablecoinPeg } from '@/core/defi'

export interface RAYSScore {
  score: number         // 0-100, higher is better
  adjustedApy: number   // APY after risk penalty
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  breakdown: RAYSBreakdown
}

export interface RAYSBreakdown {
  rawApy: number
  tvlScore: number        // 0-20
  auditScore: number      // 0-15
  pegScore: number        // 0-15
  volatilityScore: number // 0-15
  liquidityScore: number  // 0-15
  apyScore: number        // 0-20
}

const TVL_THRESHOLDS = [
  { min: 500_000_000, score: 20 },
  { min: 100_000_000, score: 16 },
  { min: 50_000_000, score: 12 },
  { min: 10_000_000, score: 8 },
  { min: 1_000_000, score: 4 },
  { min: 0, score: 1 },
]

export function computeRAYS(
  source: YieldSource,
  pegs?: StablecoinPeg[],
  historicalApyStdDev?: number
): RAYSScore {
  const tvlScore = TVL_THRESHOLDS.find((t) => source.tvl >= t.min)?.score ?? 1

  const auditScore = source.audited ? 15 : 3

  let pegScore = 15
  if (source.stablecoin && pegs) {
    const peg = pegs.find((p) =>
      p.symbol.toLowerCase() === source.asset.toLowerCase()
    )
    if (peg) {
      if (peg.deviation > 0.02) pegScore = 2
      else if (peg.deviation > 0.01) pegScore = 6
      else if (peg.deviation > 0.005) pegScore = 10
    }
  }

  // Lower volatility = higher score
  let volatilityScore = 12
  if (historicalApyStdDev !== undefined) {
    if (historicalApyStdDev > 10) volatilityScore = 2
    else if (historicalApyStdDev > 5) volatilityScore = 6
    else if (historicalApyStdDev > 2) volatilityScore = 10
    else volatilityScore = 15
  }

  // Sustainable APY range scores higher than extreme outliers
  let apyScore: number
  const apy = source.apy
  if (apy >= 4 && apy <= 15) apyScore = 20
  else if (apy >= 2 && apy <= 25) apyScore = 15
  else if (apy >= 1 && apy <= 40) apyScore = 10
  else if (apy > 40) apyScore = 5  // suspiciously high
  else apyScore = 3                 // too low to matter

  // Managed protocols with concentrated TVL get a liquidity bonus
  const liquidityScore = source.managed ? 15 : 8

  const totalScore = tvlScore + auditScore + pegScore + volatilityScore + apyScore + liquidityScore
  const normalizedScore = Math.min(100, totalScore)

  const riskPenalty = (100 - normalizedScore) / 100
  const adjustedApy = source.apy * (1 - riskPenalty * 0.5)

  const grade = normalizedScore >= 80 ? 'A'
    : normalizedScore >= 65 ? 'B'
    : normalizedScore >= 50 ? 'C'
    : normalizedScore >= 35 ? 'D'
    : 'F'

  return {
    score: normalizedScore,
    adjustedApy,
    grade,
    breakdown: {
      rawApy: source.apy,
      tvlScore,
      auditScore,
      pegScore,
      volatilityScore,
      liquidityScore,
      apyScore,
    },
  }
}

export function sortByRAYS(
  sources: YieldSource[],
  pegs?: StablecoinPeg[]
): Array<YieldSource & { rays: RAYSScore }> {
  return sources
    .map((s) => ({ ...s, rays: computeRAYS(s, pegs) }))
    .sort((a, b) => b.rays.adjustedApy - a.rays.adjustedApy)
}
