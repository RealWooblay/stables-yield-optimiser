export interface SimulationConfig {
  principal: number
  asset: string
  durationDays: number
  strategies: StrategyConfig[]
}

export interface StrategyConfig {
  protocol: string
  strategy: string
  allocation: number // 0-1
  currentApy: number
}

export interface ScenarioParams {
  apyChange: number // multiplier, 1.0 = no change
  pegStress: number // deviation from 1.0
  tvlShift: number // multiplier
  rateEnvironment: 'rising' | 'stable' | 'falling'
}

export interface SimulationResult {
  strategyLabel: string
  dataPoints: TimeSeriesPoint[]
  totalReturn: number
  totalReturnPercent: number
  effectiveApy: number
  maxDrawdown: number
  riskScore: number
}

export interface TimeSeriesPoint {
  timestamp: number
  value: number
  apy: number
  cumulativeYield: number
}

export interface OutcomeBand {
  label: 'best' | 'expected' | 'worst'
  dataPoints: TimeSeriesPoint[]
  probability: number
}

export interface ComparisonResult {
  strategies: SimulationResult[]
  bestStrategy: string
  missedYield: number
  recommendation: string
}
