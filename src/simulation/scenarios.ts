import type { ScenarioParams } from '@/core/simulation'

export interface ScenarioTemplate {
  id: string
  name: string
  description: string
  params: ScenarioParams
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'baseline',
    name: 'Baseline',
    description: 'Current conditions maintained',
    params: {
      apyChange: 1.0,
      pegStress: 0,
      tvlShift: 1.0,
      rateEnvironment: 'stable',
    },
  },
  {
    id: 'bull-market',
    name: 'Bull Market',
    description: 'Rising rates, increased activity, higher yields',
    params: {
      apyChange: 1.5,
      pegStress: 0,
      tvlShift: 0.8,
      rateEnvironment: 'rising',
    },
  },
  {
    id: 'bear-market',
    name: 'Bear Market',
    description: 'Falling rates, decreased activity, lower yields',
    params: {
      apyChange: 0.5,
      pegStress: 0.005,
      tvlShift: 1.5,
      rateEnvironment: 'falling',
    },
  },
  {
    id: 'peg-stress',
    name: 'Stablecoin Stress',
    description: 'Major stablecoin depeg event',
    params: {
      apyChange: 0.3,
      pegStress: 0.05,
      tvlShift: 2.0,
      rateEnvironment: 'falling',
    },
  },
  {
    id: 'rate-spike',
    name: 'Rate Spike',
    description: 'Sudden yield spike from high borrowing demand',
    params: {
      apyChange: 2.5,
      pegStress: 0,
      tvlShift: 0.7,
      rateEnvironment: 'rising',
    },
  },
  {
    id: 'tvl-exodus',
    name: 'TVL Exodus',
    description: 'Major capital outflow from protocols',
    params: {
      apyChange: 0.8,
      pegStress: 0.01,
      tvlShift: 3.0,
      rateEnvironment: 'falling',
    },
  },
]
