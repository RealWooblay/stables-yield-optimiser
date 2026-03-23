import { create } from 'zustand'
import type { YieldSource, StablecoinPeg, ProtocolHealth } from '@/core/defi'
import type { DataLabel } from '@/core/types'

interface YieldState {
  sources: DataLabel<YieldSource[]> | null
  pegs: DataLabel<StablecoinPeg[]> | null
  protocolHealth: DataLabel<ProtocolHealth[]> | null
  setSources: (sources: DataLabel<YieldSource[]>) => void
  setPegs: (pegs: DataLabel<StablecoinPeg[]>) => void
  setProtocolHealth: (health: DataLabel<ProtocolHealth[]>) => void
}

export const useYieldStore = create<YieldState>((set) => ({
  sources: null,
  pegs: null,
  protocolHealth: null,
  setSources: (sources) => set({ sources }),
  setPegs: (pegs) => set({ pegs }),
  setProtocolHealth: (health) => set({ protocolHealth: health }),
}))
