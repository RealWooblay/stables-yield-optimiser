import type { ActionDiff } from '@/core/mutation'

export interface RiskAssessment {
  score: number // 0-100
  level: 'low' | 'medium' | 'high' | 'critical'
  factors: RiskFactor[]
  recommendation: string
}

export interface RiskFactor {
  name: string
  impact: number // 0-100
  description: string
}

export function assessActionRisk(diff: ActionDiff): RiskAssessment {
  const factors: RiskFactor[] = []
  let totalScore = 0

  // Risk from changing protocols
  if (diff.type === 'migrate') {
    factors.push({
      name: 'Protocol Migration',
      impact: 25,
      description: 'Moving funds between protocols introduces smart contract risk',
    })
    totalScore += 25
  }

  // Risk from APY delta
  if (diff.apyDelta > 5) {
    factors.push({
      name: 'High APY Jump',
      impact: 20,
      description: 'Large APY increases may indicate unsustainable yields',
    })
    totalScore += 20
  }

  // Risk delta
  if (diff.riskDelta > 0) {
    const impact = diff.riskDelta * 15
    factors.push({
      name: 'Increased Risk Level',
      impact,
      description: `Moving to a higher risk strategy (delta: +${diff.riskDelta})`,
    })
    totalScore += impact
  }

  // Multi-step transactions
  if (diff.steps.length > 1) {
    factors.push({
      name: 'Multi-step Transaction',
      impact: 10,
      description: `Requires ${diff.steps.length} separate transactions`,
    })
    totalScore += 10
  }

  // Gas/fee risk
  if (diff.estimatedFees > 0.01) {
    factors.push({
      name: 'High Fees',
      impact: 10,
      description: `Estimated fees: ${diff.estimatedFees} SOL`,
    })
    totalScore += 10
  }

  totalScore = Math.min(100, totalScore)

  const level = totalScore >= 75 ? 'critical'
    : totalScore >= 50 ? 'high'
    : totalScore >= 25 ? 'medium'
    : 'low'

  const recommendation = level === 'critical'
    ? 'This action carries significant risk. Review all factors carefully before proceeding.'
    : level === 'high'
    ? 'This action has elevated risk. Ensure you understand the trade-offs.'
    : level === 'medium'
    ? 'Moderate risk action. Review the details and proceed if comfortable.'
    : 'Low risk action. Safe to proceed.'

  return { score: totalScore, level, factors, recommendation }
}
