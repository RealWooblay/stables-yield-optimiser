import type { Position, YieldSource, StablecoinPeg } from '@/core/defi'
import { sortByRAYS } from './risk-adjusted-yield'

export interface YieldScoreResult {
  score: number
  currentBlendedApy: number
  bestPossibleApy: number
  moneyLeftOnTable: number
  totalPortfolioValue: number
  idleCapitalValue: number
  idleCapitalDrag: number
  concentrationPenalty: number
  decayPenalty: number
  breakdown: YieldScoreBreakdown
}

export interface YieldScoreBreakdown {
  apyEfficiency: number
  idlePenalty: number
  diversification: number
  decayAdjustment: number
}

const IDLE_MINTS = new Set([
  'So11111111111111111111111111111111111111112',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG', // USX
])

export function computeYieldScore(
  positions: Position[],
  idleBalances: Array<{ mint: string; symbol: string; valueUsd: number }>,
  sources: YieldSource[],
  pegs?: StablecoinPeg[],
): YieldScoreResult {
  const positionValue = positions.reduce((s, p) => s + p.valueUsd, 0)
  const idleCapitalValue = idleBalances
    .filter((b) => IDLE_MINTS.has(b.mint) || b.valueUsd > 0)
    .reduce((s, b) => s + b.valueUsd, 0)

  const totalPortfolioValue = positionValue + idleCapitalValue

  if (totalPortfolioValue < 1) {
    return emptyScore()
  }

  const currentBlendedApy = totalPortfolioValue > 0
    ? positions.reduce((s, p) => s + (p.apy * p.valueUsd), 0) / totalPortfolioValue
    : 0

  const ranked = sortByRAYS(sources, pegs)
  const viableSources = ranked.filter(
    (s) => s.riskLevel !== 'critical' && s.tvl > 1_000_000 && s.apy > 0.5
  )

  let bestPossibleApy = 0
  if (viableSources.length > 0) {
    const top5 = viableSources.slice(0, 5)
    bestPossibleApy = top5.reduce((s, src) => s + src.rays.adjustedApy, 0) / top5.length
  }
  bestPossibleApy = Math.max(bestPossibleApy, currentBlendedApy)

  // APY efficiency: how close current blended APY is to best achievable
  const apyEfficiency = bestPossibleApy > 0
    ? Math.min(100, (currentBlendedApy / bestPossibleApy) * 100)
    : 0

  // Idle capital penalty: every dollar sitting at 0% drags the score
  const idleFraction = totalPortfolioValue > 0 ? idleCapitalValue / totalPortfolioValue : 0
  const idlePenalty = idleFraction * 30

  // Concentration risk: too much in one protocol
  const protocolValues = new Map<string, number>()
  for (const pos of positions) {
    protocolValues.set(pos.protocol, (protocolValues.get(pos.protocol) ?? 0) + pos.valueUsd)
  }
  let concentrationPenalty = 0
  if (positionValue > 0 && protocolValues.size === 1) {
    concentrationPenalty = 10
  } else if (positionValue > 0) {
    const maxShare = Math.max(...protocolValues.values()) / positionValue
    if (maxShare > 0.8) concentrationPenalty = 8
    else if (maxShare > 0.6) concentrationPenalty = 4
  }

  const diversification = Math.max(0, 15 - concentrationPenalty)

  // Decay: positions whose APY is falling
  const decayPenalty = 0

  const rawScore = apyEfficiency * 0.55 + diversification * (100 / 15) * 0.15 + (100 - idlePenalty * (100 / 30)) * 0.25 - decayPenalty
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))

  const moneyLeftOnTable = (bestPossibleApy - currentBlendedApy) * totalPortfolioValue / 100

  return {
    score,
    currentBlendedApy,
    bestPossibleApy,
    moneyLeftOnTable: Math.max(0, moneyLeftOnTable),
    totalPortfolioValue,
    idleCapitalValue,
    idleCapitalDrag: idlePenalty,
    concentrationPenalty,
    decayPenalty,
    breakdown: {
      apyEfficiency: Math.round(apyEfficiency),
      idlePenalty: Math.round(idlePenalty),
      diversification: Math.round(diversification),
      decayAdjustment: Math.round(decayPenalty),
    },
  }
}

function emptyScore(): YieldScoreResult {
  return {
    score: 0,
    currentBlendedApy: 0,
    bestPossibleApy: 0,
    moneyLeftOnTable: 0,
    totalPortfolioValue: 0,
    idleCapitalValue: 0,
    idleCapitalDrag: 0,
    concentrationPenalty: 0,
    decayPenalty: 0,
    breakdown: {
      apyEfficiency: 0,
      idlePenalty: 0,
      diversification: 0,
      decayAdjustment: 0,
    },
  }
}
