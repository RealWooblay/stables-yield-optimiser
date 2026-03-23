export interface PollConfig {
  key: string
  intervalMs: number
  fn: () => Promise<void>
  enabled: boolean
}

const activePollIntervals = new Map<string, ReturnType<typeof setInterval>>()

export const POLL_INTERVALS = {
  positions: 30_000,
  apy: 300_000,
  protocolHealth: 600_000,
  pegMonitor: 60_000,
  balances: 30_000,
} as const

export function startPolling(config: PollConfig): void {
  stopPolling(config.key)
  if (!config.enabled) return

  // Run immediately
  config.fn().catch(console.error)

  const interval = setInterval(() => {
    config.fn().catch(console.error)
  }, config.intervalMs)

  activePollIntervals.set(config.key, interval)
}

export function stopPolling(key: string): void {
  const interval = activePollIntervals.get(key)
  if (interval) {
    clearInterval(interval)
    activePollIntervals.delete(key)
  }
}

export function stopAllPolling(): void {
  for (const key of activePollIntervals.keys()) {
    stopPolling(key)
  }
}
