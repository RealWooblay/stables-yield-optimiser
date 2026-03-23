import { useState, useRef } from 'react'

interface Props {
  onSend: (message: string) => void
  isLoading: boolean
  placeholder?: string
}

export function ChatInput({ onSend, isLoading, placeholder }: Props) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setValue('')
  }

  return (
    <div className="glass-panel p-3 flex items-center gap-3">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}
        placeholder={placeholder ?? 'Ask about your portfolio...'}
        disabled={isLoading}
        className="flex-1 bg-transparent text-text-primary text-sm placeholder:text-text-muted outline-none"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || isLoading}
        className="btn-primary text-xs px-4 py-2 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </span>
        ) : (
          'Send'
        )}
      </button>
    </div>
  )
}
