import { create } from 'zustand'
import type { SimulationConfig, ScenarioParams, SimulationResult, ComparisonResult } from '@/core/simulation'

interface SimulationState {
  config: SimulationConfig | null
  scenarioParams: ScenarioParams
  results: SimulationResult[] | null
  comparison: ComparisonResult | null
  isRunning: boolean
  setConfig: (config: SimulationConfig) => void
  setScenarioParams: (params: Partial<ScenarioParams>) => void
  setResults: (results: SimulationResult[]) => void
  setComparison: (comparison: ComparisonResult | null) => void
  setIsRunning: (running: boolean) => void
  reset: () => void
}

const defaultParams: ScenarioParams = {
  apyChange: 1.0,
  pegStress: 0,
  tvlShift: 1.0,
  rateEnvironment: 'stable',
}

export const useSimulationStore = create<SimulationState>((set) => ({
  config: null,
  scenarioParams: defaultParams,
  results: null,
  comparison: null,
  isRunning: false,
  setConfig: (config) => set({ config }),
  setScenarioParams: (params) =>
    set((state) => ({ scenarioParams: { ...state.scenarioParams, ...params } })),
  setResults: (results) => set({ results }),
  setComparison: (comparison) => set({ comparison }),
  setIsRunning: (running) => set({ isRunning: running }),
  reset: () => set({ config: null, results: null, comparison: null, isRunning: false, scenarioParams: defaultParams }),
}))
