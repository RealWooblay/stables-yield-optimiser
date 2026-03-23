import type { YieldSource, Position } from '@/core/defi'
import type { ComparisonResult, ScenarioParams, StrategyConfig, SimulationConfig } from '@/core/simulation'
import { runSimulation, compareStrategies } from './engine'

export interface ComparisonInput {
  currentPosition: Position
  alternatives: YieldSource[]
  durationDays: number
  scenario: ScenarioParams
}

export function compareManagedVsDirect(input: ComparisonInput): ComparisonResult {
  const { currentPosition, alternatives, durationDays, scenario } = input

  const strategies: StrategyConfig[] = [
    {
      protocol: currentPosition.protocol,
      strategy: currentPosition.strategy,
      allocation: 1.0,
      currentApy: currentPosition.apy,
    },
    ...alternatives.map((alt) => ({
      protocol: alt.protocol,
      strategy: alt.strategy,
      allocation: 1.0,
      currentApy: alt.apy,
    })),
  ]

  const config: SimulationConfig = {
    principal: currentPosition.valueUsd,
    asset: currentPosition.asset,
    durationDays,
    strategies,
  }

  const results = runSimulation(config, scenario)
  return compareStrategies(
    results,
    `${currentPosition.protocol} - ${currentPosition.strategy}`
  )
}

export function findMissedYield(
  positions: Position[],
  allSources: YieldSource[]
): Array<{ position: Position; bestAlternative: YieldSource; missedAnnual: number }> {
  const missed: Array<{ position: Position; bestAlternative: YieldSource; missedAnnual: number }> = []

  for (const position of positions) {
    const sameAssetSources = allSources.filter(
      (s) => s.asset === position.asset &&
        !(s.protocol === position.protocol && s.strategy === position.strategy)
    )

    const bestAlt = sameAssetSources.reduce<YieldSource | null>(
      (best, source) => (!best || source.apy > best.apy ? source : best),
      null
    )

    if (bestAlt && bestAlt.apy > position.apy) {
      const apyDiff = bestAlt.apy - position.apy
      const missedAnnual = (position.valueUsd * apyDiff) / 100
      missed.push({ position, bestAlternative: bestAlt, missedAnnual })
    }
  }

  return missed.sort((a, b) => b.missedAnnual - a.missedAnnual)
}
