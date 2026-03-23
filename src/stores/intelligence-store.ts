import { create } from 'zustand'

export interface YieldStory {
  summary: string
  totalEarnings: number
  topSource: string
  riskAssessment: string
  recommendations: string[]
  generatedAt: number
}

export interface Anomaly {
  id: string
  type: 'apy_drop' | 'tvl_outflow' | 'peg_deviation' | 'whale_movement'
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  protocol: string
  detectedAt: number
  acknowledged: boolean
}

export interface Opportunity {
  id: string
  protocol: string
  strategy: string
  currentApy: number
  projectedGain: number
  riskLevel: string
  reason: string
  detectedAt: number
}

interface IntelligenceState {
  yieldStory: YieldStory | null
  anomalies: Anomaly[]
  opportunities: Opportunity[]
  isGenerating: boolean
  setYieldStory: (story: YieldStory) => void
  addAnomaly: (anomaly: Anomaly) => void
  acknowledgeAnomaly: (id: string) => void
  setOpportunities: (opportunities: Opportunity[]) => void
  setIsGenerating: (generating: boolean) => void
}

export const useIntelligenceStore = create<IntelligenceState>((set) => ({
  yieldStory: null,
  anomalies: [],
  opportunities: [],
  isGenerating: false,
  setYieldStory: (story) => set({ yieldStory: story }),
  addAnomaly: (anomaly) => set((s) => ({ anomalies: [anomaly, ...s.anomalies] })),
  acknowledgeAnomaly: (id) =>
    set((s) => ({
      anomalies: s.anomalies.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
    })),
  setOpportunities: (opportunities) => set({ opportunities }),
  setIsGenerating: (generating) => set({ isGenerating: generating }),
}))
