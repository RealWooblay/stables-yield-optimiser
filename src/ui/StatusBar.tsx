import { useWalletStore } from '@/stores/wallet-store'
import { usePositionStore } from '@/stores/position-store'
import { useYieldStore } from '@/stores/yield-store'
import { getFreshness } from '@/core/types'

export function StatusBar() {
  const { connected, balances } = useWalletStore()
  const { positions, totalDailyYield } = usePositionStore()
  const { pegs } = useYieldStore()

  const balanceFreshness = balances ? getFreshness(balances) : null
  const positionFreshness = positions ? getFreshness(positions) : null

  return (
    <footer className="h-7 bg-bg-secondary/80 backdrop-blur-sm border-t border-border-primary flex items-center px-4 text-[10px] shrink-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <StatusIndicator
          label="Network"
          status={connected ? 'connected' : 'disconnected'}
        />
        <StatusIndicator
          label="Balances"
          status={balanceFreshness ?? 'none'}
        />
        <StatusIndicator
          label="Positions"
          status={positionFreshness ?? 'none'}
        />
      </div>

      <div className="flex items-center gap-4">
        {totalDailyYield > 0 && (
          <span className="text-accent-green font-mono font-semibold">
            +${totalDailyYield.toFixed(4)}/day
          </span>
        )}
        {pegs?.value.map((peg) => (
          <span
            key={peg.symbol}
            className={`font-mono ${
              peg.deviation > 0.005 ? 'text-accent-red' : 'text-text-muted'
            }`}
          >
            {peg.symbol}: ${peg.price.toFixed(4)}
          </span>
        ))}
      </div>
    </footer>
  )
}

function StatusIndicator({ label, status }: { label: string; status: string }) {
  const dotClass = status === 'connected' || status === 'fresh'
    ? 'bg-accent-green'
    : status === 'stale'
    ? 'bg-accent-yellow'
    : status === 'expired'
    ? 'bg-accent-red'
    : 'bg-text-muted/50'

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1 h-1 rounded-full ${dotClass}`} />
      <span className="text-text-muted">{label}</span>
    </div>
  )
}
