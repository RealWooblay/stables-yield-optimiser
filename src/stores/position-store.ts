import { create } from 'zustand'
import type { Position } from '@/core/defi'
import type { DataLabel } from '@/core/types'

interface PositionState {
  positions: DataLabel<Position[]> | null
  selectedPositionId: string | null
  totalPositionValue: number
  totalDailyYield: number
  setPositions: (positions: DataLabel<Position[]>) => void
  selectPosition: (id: string | null) => void
}

export const usePositionStore = create<PositionState>((set) => ({
  positions: null,
  selectedPositionId: null,
  totalPositionValue: 0,
  totalDailyYield: 0,
  setPositions: (positions) => {
    const total = positions.value.reduce((sum, p) => sum + p.valueUsd, 0)
    const dailyYield = positions.value.reduce(
      (sum, p) => sum + (p.valueUsd * p.apy) / 365 / 100,
      0
    )
    set({ positions, totalPositionValue: total, totalDailyYield: dailyYield })
  },
  selectPosition: (id) => set({ selectedPositionId: id }),
}))
