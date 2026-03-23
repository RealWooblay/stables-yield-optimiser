import { create } from 'zustand'
import type { AdapterConfig } from '@/core/adapter'

interface ProtocolInfo {
  name: string
  displayName: string
  logoUrl: string
  category: 'lending' | 'staking' | 'vault' | 'dex'
  adapter: AdapterConfig | null
  status: 'active' | 'degraded' | 'down'
}

interface ProtocolState {
  protocols: Map<string, ProtocolInfo>
  registerProtocol: (info: ProtocolInfo) => void
  updateStatus: (name: string, status: ProtocolInfo['status']) => void
  getProtocol: (name: string) => ProtocolInfo | undefined
}

export const useProtocolStore = create<ProtocolState>((set, get) => ({
  protocols: new Map(),
  registerProtocol: (info) =>
    set((s) => {
      const protocols = new Map(s.protocols)
      protocols.set(info.name, info)
      return { protocols }
    }),
  updateStatus: (name, status) =>
    set((s) => {
      const protocols = new Map(s.protocols)
      const existing = protocols.get(name)
      if (existing) protocols.set(name, { ...existing, status })
      return { protocols }
    }),
  getProtocol: (name) => get().protocols.get(name),
}))
