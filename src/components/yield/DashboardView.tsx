import { useState, useEffect } from 'react'
import { useWalletStore } from '@/stores/wallet-store'
import { usePositionStore } from '@/stores/position-store'
import { useYieldStore } from '@/stores/yield-store'
import { MetricCard } from '@/components/primitives/MetricCard'
import { PositionCard } from '@/components/wallet/PositionCard'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { getActionHistory, type ActionHistoryRow } from '@/db/repositories/action-history'

export function DashboardView() {
  const { connected } = useWallet()
  const { setVisible } = useWalletModal()
  const { totalValueUsd, balances } = useWalletStore()
  const { positions, totalPositionValue, totalDailyYield } = usePositionStore()
  const { sources } = useYieldStore()

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-8 hero-gradient">
        <div className="space-y-2 fade-in">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-accent-blue shadow-[0_0_12px_rgba(59,130,246,0.6)] animate-subtle-pulse" />
            <span className="text-sm font-medium text-accent-blue tracking-wide uppercase">Yield Intelligence</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-text-primary tracking-tight leading-tight">
            Maximize your<br/>
            <span className="bg-gradient-to-r from-accent-blue to-accent-purple bg-clip-text text-transparent">DeFi yield</span>
          </h1>
          <p className="text-text-secondary max-w-md text-base leading-relaxed mt-4 mx-auto">
            Connect your Solana wallet to discover yield opportunities, optimize positions, and deploy capital with AI-powered intelligence.
          </p>
        </div>
        <button
          onClick={() => setVisible(true)}
          className="btn-primary text-base px-8 py-3 rounded-2xl"
        >
          Connect Wallet
        </button>
        <div className="grid grid-cols-3 gap-8 mt-4 text-center fade-in" style={{ animationDelay: '0.1s' }}>
          <div>
            <div className="text-2xl font-bold text-text-primary font-mono">{sources?.value.length ?? '—'}</div>
            <div className="text-xs text-text-muted mt-1">Yield Sources</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-text-primary font-mono">4+</div>
            <div className="text-xs text-text-muted mt-1">Protocols</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-accent-green font-mono">Live</div>
            <div className="text-xs text-text-muted mt-1">Real-time Data</div>
          </div>
        </div>
      </div>
    )
  }

  const positionList = positions?.value ?? []
  const isLoading = positions === null
  const weightedApy = totalPositionValue > 0
    ? positionList.reduce((sum, p) => sum + (p.apy * p.valueUsd) / totalPositionValue, 0)
    : 0

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-subtle-pulse" />
          Live
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          title="Total Value"
          value={`$${(totalValueUsd + totalPositionValue).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          subtitle="Wallet + Positions"
          label={balances ?? undefined}
        />
        <MetricCard
          title="Position Value"
          value={`$${totalPositionValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          subtitle={isLoading ? 'Loading...' : `${positionList.length} active position${positionList.length !== 1 ? 's' : ''}`}
          label={positions ?? undefined}
        />
        <MetricCard
          title="Blended APY"
          value={isLoading ? '—' : `${weightedApy.toFixed(2)}%`}
          subtitle="Weighted average"
          label={positions ?? undefined}
        />
        <MetricCard
          title="Daily Yield"
          value={isLoading ? '—' : `+$${totalDailyYield.toFixed(2)}`}
          subtitle={isLoading ? 'Loading...' : `$${(totalDailyYield * 365).toFixed(0)}/year projected`}
          label={positions ?? undefined}
          trend={totalDailyYield > 0 ? { value: weightedApy, label: 'APY' } : undefined}
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Active Positions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="glass-panel p-5 space-y-3">
                <div className="h-4 w-36 shimmer rounded-lg" />
                <div className="h-3 w-24 shimmer rounded-lg" />
                <div className="flex gap-4 pt-1">
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="h-10 flex-1 shimmer rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && positionList.length > 0 && (
        <div className="slide-up">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            Active Positions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {positionList.map((position) => (
              <PositionCard key={position.id} position={position} />
            ))}
          </div>
        </div>
      )}

      {!isLoading && positionList.length === 0 && (
        <div className="glass-panel p-10 text-center slide-up">
          <div className="text-3xl opacity-15 mb-4">◉</div>
          <p className="text-text-secondary text-sm mb-1">No yield positions detected</p>
          <p className="text-text-muted text-xs">
            Hold mSOL, JitoSOL, JLP, or other yield-bearing tokens to see them here.
          </p>
        </div>
      )}

      <ActionHistorySection />
    </div>
  )
}

function ActionHistorySection() {
  const { address } = useWalletStore()
  const [history, setHistory] = useState<ActionHistoryRow[]>([])

  useEffect(() => {
    if (!address) return
    getActionHistory(address).then(setHistory).catch(() => {})
  }, [address])

  if (history.length === 0) return null

  const statusColor: Record<string, string> = {
    pending: 'text-accent-yellow',
    executing: 'text-accent-blue',
    completed: 'text-accent-green',
    failed: 'text-accent-red',
  }

  return (
    <div className="slide-up">
      <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
        Recent Actions
      </h2>
      <div className="space-y-2">
        {history.slice(0, 5).map((action) => (
          <div key={action.id} className="glass-panel p-3.5 flex items-center justify-between hover:border-border-accent/10 transition-all">
            <div className="min-w-0">
              <div className="text-sm text-text-primary capitalize font-medium">
                {action.actionType} — {action.protocol} {action.strategy}
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                {new Date(action.createdAt).toLocaleString()}
              </div>
            </div>
            <span className={`text-xs font-semibold capitalize ${statusColor[action.status] ?? 'text-text-muted'}`}>
              {action.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
