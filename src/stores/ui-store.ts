import { create } from 'zustand'
import type { ActionDiff } from '@/core/mutation'

interface Toast {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number
}

interface UIState {
  toasts: Toast[]
  isLoading: boolean
  activeAction: ActionDiff | null
  actionPanelOpen: boolean
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  setLoading: (loading: boolean) => void
  openActionPanel: (action: ActionDiff) => void
  closeActionPanel: () => void
}

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  isLoading: false,
  activeAction: null,
  actionPanelOpen: false,
  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }],
    })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setLoading: (loading) => set({ isLoading: loading }),
  openActionPanel: (action) => set({ activeAction: action, actionPanelOpen: true }),
  closeActionPanel: () => set({ activeAction: null, actionPanelOpen: false }),
}))
