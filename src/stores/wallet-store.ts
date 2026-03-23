import { create } from 'zustand'
import type { TokenBalance } from '@/core/defi'
import type { DataLabel } from '@/core/types'

interface WalletState {
  address: string | null
  connected: boolean
  balances: DataLabel<TokenBalance[]> | null
  totalValueUsd: number
  setAddress: (address: string | null) => void
  setConnected: (connected: boolean) => void
  setBalances: (balances: DataLabel<TokenBalance[]>) => void
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  connected: false,
  balances: null,
  totalValueUsd: 0,
  setAddress: (address) => set({ address }),
  setConnected: (connected) => set({ connected }),
  setBalances: (balances) =>
    set({
      balances,
      totalValueUsd: balances.value.reduce((sum, b) => sum + b.valueUsd, 0),
    }),
}))
