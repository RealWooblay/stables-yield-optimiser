import type {
  SimulationConfig,
  ScenarioParams,
  SimulationResult,
  TimeSeriesPoint,
  ComparisonResult,
} from '@/core/simulation'

export function runSimulation(
  config: SimulationConfig,
  scenario: ScenarioParams
): SimulationResult[] {
  return config.strategies.map((strategy) => {
    const adjustedApy = strategy.currentApy * scenario.apyChange
    const allocation = config.principal * strategy.allocation
    const dataPoints = generateTimeSeries(
      allocation,
      adjustedApy,
      config.durationDays,
      scenario
    )

    const finalValue = dataPoints[dataPoints.length - 1]?.value ?? allocation
    const totalReturn = finalValue - allocation
    const totalReturnPercent = (totalReturn / allocation) * 100

    // Calculate max drawdown
    let peak = allocation
    let maxDrawdown = 0
    for (const point of dataPoints) {
      if (point.value > peak) peak = point.value
      const drawdown = (peak - point.value) / peak
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    }

    // Risk score: 0-100 based on volatility, drawdown, and scenario stress
    const riskScore = calculateRiskScore(adjustedApy, maxDrawdown, scenario)

    return {
      strategyLabel: `${strategy.protocol} - ${strategy.strategy}`,
      dataPoints,
      totalReturn,
      totalReturnPercent,
      effectiveApy: adjustedApy,
      maxDrawdown,
      riskScore,
    }
  })
}

export interface CompareStrategiesOptions {
  /** Wording: do not imply leaving the tenant stablecoin for another stable. */
  sameStablecoinScope?: boolean
  stablecoinLabel?: string
}

export function compareStrategies(
  results: SimulationResult[],
  currentStrategy?: string,
  options?: CompareStrategiesOptions
): ComparisonResult {
  const sorted = [...results].sort((a, b) => b.totalReturn - a.totalReturn)
  const best = sorted[0]

  let missedYield = 0
  if (currentStrategy) {
    const current = results.find((r) => r.strategyLabel === currentStrategy)
    if (current && best) {
      missedYield = best.totalReturn - current.totalReturn
    }
  }

  const label = options?.stablecoinLabel ?? 'this stablecoin'
  let recommendation: string
  if (missedYield > 0 && best) {
    recommendation = options?.sameStablecoinScope
      ? `Within ${label}, the strongest modeled path is ${best.strategyLabel} (~$${missedYield.toFixed(2)} more than your baseline in this simulation).`
      : `Consider ${best.strategyLabel} for an estimated $${missedYield.toFixed(2)} more return vs baseline in this simulation.`
  } else {
    recommendation = 'No large gap between modeled strategies in this run.'
  }

  return {
    strategies: results,
    bestStrategy: best?.strategyLabel ?? '',
    missedYield,
    recommendation,
  }
}

function generateTimeSeries(
  principal: number,
  apy: number,
  durationDays: number,
  scenario: ScenarioParams
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []
  const dailyRate = apy / 365 / 100
  let value = principal
  let cumulativeYield = 0
  const now = Date.now()

  for (let day = 0; day <= durationDays; day++) {
    // Apply scenario modifiers
    let effectiveRate = dailyRate

    // Rate environment affects yield over time
    if (scenario.rateEnvironment === 'falling') {
      effectiveRate *= 1 - (day / durationDays) * 0.3
    } else if (scenario.rateEnvironment === 'rising') {
      effectiveRate *= 1 + (day / durationDays) * 0.2
    }

    // Peg stress reduces effective yield
    if (scenario.pegStress > 0) {
      effectiveRate *= 1 - scenario.pegStress * 0.5
    }

    // TVL shift affects yield (more TVL = lower per-unit yield)
    if (scenario.tvlShift > 1) {
      effectiveRate /= Math.sqrt(scenario.tvlShift)
    }

    // Add some realistic variance (±5%)
    const variance = 1 + (Math.sin(day * 0.3) * 0.05)
    effectiveRate *= variance

    const dailyYield = value * effectiveRate
    cumulativeYield += dailyYield
    value += dailyYield

    points.push({
      timestamp: now - (durationDays - day) * 86400_000,
      value,
      apy: effectiveRate * 365 * 100,
      cumulativeYield,
    })
  }

  return points
}

function calculateRiskScore(
  apy: number,
  maxDrawdown: number,
  scenario: ScenarioParams
): number {
  let risk = 0

  // Higher APY = higher risk
  if (apy > 20) risk += 30
  else if (apy > 10) risk += 15
  else if (apy > 5) risk += 5

  // Drawdown contribution
  risk += maxDrawdown * 100

  // Scenario stress
  if (scenario.pegStress > 0.01) risk += 20
  if (scenario.tvlShift > 2) risk += 15
  if (scenario.rateEnvironment === 'falling') risk += 10

  return Math.min(100, Math.max(0, risk))
}
