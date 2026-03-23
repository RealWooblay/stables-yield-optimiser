import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui-store'

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts)
  const removeToast = useUIStore((s) => s.removeToast)

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number
  onDismiss: () => void
}

const TOAST_ICONS: Record<string, string> = {
  info: '○',
  success: '✓',
  warning: '△',
  error: '✕',
}

function ToastItem({ type, title, message, duration = 5000, onDismiss }: ToastItemProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onDismiss, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onDismiss])

  const accentColor = {
    info: 'border-l-accent-blue',
    success: 'border-l-accent-green',
    warning: 'border-l-accent-yellow',
    error: 'border-l-accent-red',
  }[type]

  const iconColor = {
    info: 'text-accent-blue',
    success: 'text-accent-green',
    warning: 'text-accent-yellow',
    error: 'text-accent-red',
  }[type]

  return (
    <div
      className={`pointer-events-auto glass-panel border-l-[3px] ${accentColor} p-3.5 animate-toast cursor-pointer transition-all btn-press`}
      onClick={onDismiss}
    >
      <div className="flex items-start gap-2.5">
        <span className={`text-sm mt-px ${iconColor}`}>{TOAST_ICONS[type]}</span>
        <div>
          <div className="text-sm font-semibold text-text-primary">{title}</div>
          {message && <div className="text-xs text-text-secondary mt-0.5 leading-relaxed">{message}</div>}
        </div>
      </div>
    </div>
  )
}
