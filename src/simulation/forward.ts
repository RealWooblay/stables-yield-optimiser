import type { SimulationResult, TimeSeriesPoint, OutcomeBand, ScenarioParams } from '@/core/simulation'

export interface ForwardProjectionConfig {
  principal: number
  currentApy: number
  durationDays: number
  protocol: string
  strategy: string
  volatility?: number // Historical APY volatility (standard deviation)
}

export function projectForward(
  config: ForwardProjectionConfig,
  scenario: ScenarioParams
): SimulationResult {
  const { principal, currentApy, durationDays } = config
  const adjustedApy = currentApy * scenario.apyChange
  const dailyRate = adjustedApy / 365 / 100

  const points: TimeSeriesPoint[] = []
  let value = principal
  let cumulativeYield = 0
  const now = Date.now()

  for (let day = 0; day <= durationDays; day++) {
    let rate = dailyRate

    if (scenario.rateEnvironment === 'falling') {
      rate *= Math.max(0.3, 1 - (day / durationDays) * 0.5)
    } else if (scenario.rateEnvironment === 'rising') {
      rate *= 1 + (day / durationDays) * 0.3
    }

    const dailyYield = value * rate
    cumulativeYield += dailyYield
    value += dailyYield

    points.push({
      timestamp: now + day * 86400_000,
      value,
      apy: rate * 365 * 100,
      cumulativeYield,
    })
  }

  const totalReturn = value - principal

  return {
    strategyLabel: `${config.protocol} - ${config.strategy}`,
    dataPoints: points,
    totalReturn,
    totalReturnPercent: (totalReturn / principal) * 100,
    effectiveApy: adjustedApy,
    maxDrawdown: 0,
    riskScore: 0,
  }
}

export function generateOutcomeBands(
  config: ForwardProjectionConfig,
  scenario: ScenarioParams
): OutcomeBand[] {
  const bestScenario = { ...scenario, apyChange: scenario.apyChange * 1.3 }
  const worstScenario = { ...scenario, apyChange: scenario.apyChange * 0.5, pegStress: 0.02 }

  const expected = projectForward(config, scenario)
  const best = projectForward(config, bestScenario)
  const worst = projectForward(config, worstScenario)

  return [
    { label: 'best', dataPoints: best.dataPoints, probability: 0.2 },
    { label: 'expected', dataPoints: expected.dataPoints, probability: 0.6 },
    { label: 'worst', dataPoints: worst.dataPoints, probability: 0.2 },
  ]
}
