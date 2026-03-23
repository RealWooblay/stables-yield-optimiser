import type { SimulationResult, TimeSeriesPoint } from '@/core/simulation'

export interface HistoricalReplayConfig {
  principal: number
  asset: string
  protocol: string
  strategy: string
  startDate: number
  endDate: number
  historicalApyData: Array<{ timestamp: number; apy: number }>
}

export function replayHistorical(config: HistoricalReplayConfig): SimulationResult {
  const { principal, historicalApyData, startDate, endDate } = config
  const points: TimeSeriesPoint[] = []
  let value = principal
  let cumulativeYield = 0
  let peak = principal
  let maxDrawdown = 0

  // Sort by timestamp
  const sortedData = [...historicalApyData]
    .filter((d) => d.timestamp >= startDate && d.timestamp <= endDate)
    .sort((a, b) => a.timestamp - b.timestamp)

  if (sortedData.length === 0) {
    return {
      strategyLabel: `${config.protocol} - ${config.strategy}`,
      dataPoints: [],
      totalReturn: 0,
      totalReturnPercent: 0,
      effectiveApy: 0,
      maxDrawdown: 0,
      riskScore: 0,
    }
  }

  for (let i = 0; i < sortedData.length; i++) {
    const entry = sortedData[i]
    const dailyRate = entry.apy / 365 / 100
    const dailyYield = value * dailyRate
    cumulativeYield += dailyYield
    value += dailyYield

    if (value > peak) peak = value
    const drawdown = (peak - value) / peak
    if (drawdown > maxDrawdown) maxDrawdown = drawdown

    points.push({
      timestamp: entry.timestamp,
      value,
      apy: entry.apy,
      cumulativeYield,
    })
  }

  const totalReturn = value - principal
  const daysElapsed = (endDate - startDate) / 86400_000
  const effectiveApy = daysElapsed > 0
    ? ((value / principal) ** (365 / daysElapsed) - 1) * 100
    : 0

  return {
    strategyLabel: `${config.protocol} - ${config.strategy}`,
    dataPoints: points,
    totalReturn,
    totalReturnPercent: (totalReturn / principal) * 100,
    effectiveApy,
    maxDrawdown,
    riskScore: maxDrawdown * 100,
  }
}
