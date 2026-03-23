import { usePositionStore } from '@/stores/position-store'
import { useWalletStore } from '@/stores/wallet-store'
import { isIdleCapital } from '@/adapters/solana/token-registry'
import { getTenantConfig, isTenantEcosystemPosition } from '@/config/tenant'
import type { Position, TokenBalance } from '@/core/defi'

export function PortfolioGrid() {
  const positions = usePositionStore((s) => s.positions)
  const balances = useWalletStore((s) => s.balances)

  const tenant = getTenantConfig()
  const positionListRaw = positions?.value ?? []
  const positionList = tenant
    ? positionListRaw.filter((p) => isTenantEcosystemPosition(p, tenant))
    : positionListRaw
  const balanceList = balances?.value ?? []

  const idleBalances = balanceList.filter((b) => {
    if (b.uiAmount <= 0 || b.valueUsd <= 0.01) return false
    if (tenant) {
      return b.mint === tenant.stablecoinMint
    }
    return isIdleCapital(b.mint)
  })

  if (positionList.length === 0 && idleBalances.length === 0) {
    return (
      <div className="glass-panel p-6">
        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-3">Your Portfolio</h2>
        <div className="text-center py-8">
          <div className="text-2xl opacity-10 mb-2">◫</div>
          <p className="text-sm text-text-muted">No positions or balances detected yet.</p>
          <p className="text-xs text-text-muted/70 mt-1">Data syncs automatically after wallet connection.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider px-1">Your Portfolio</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {positionList.map((pos) => (
          <PositionCard key={pos.id} position={pos} />
        ))}
        {idleBalances.map((bal) => (
          <IdleCard key={bal.mint} balance={bal} />
        ))}
      </div>
    </div>
  )
}

function PositionCard({ position }: { position: Position }) {
  const apyColor = position.apy >= 8 ? 'text-accent-green' : position.apy >= 3 ? 'text-accent-blue' : 'text-text-muted'
  const dailyYield = (position.valueUsd * position.apy) / 365 / 100

  return (
    <div className="glass-panel p-4 group hover:border-accent-blue/20 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-base font-bold text-text-primary">{position.asset}</div>
          <div className="text-xs text-text-muted capitalize">{position.protocol}</div>
        </div>
        <div className={`text-lg font-mono font-bold ${apyColor}`}>
          {position.apy.toFixed(1)}%
        </div>
      </div>

      <div className="text-xs text-text-muted mb-2 truncate">{position.strategy}</div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-lg font-mono font-semibold text-text-primary">
            ${position.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-text-muted">
            {position.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {position.asset}
          </div>
        </div>
        {dailyYield > 0.001 && (
          <div className="text-right">
            <div className="text-xs font-mono text-accent-green">+${dailyYield.toFixed(2)}/day</div>
            <div className="text-[10px] text-text-muted">
              +${(dailyYield * 365).toFixed(0)}/yr
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border-primary/40">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${
            position.riskLevel === 'low' ? 'bg-accent-green'
            : position.riskLevel === 'medium' ? 'bg-accent-yellow'
            : 'bg-accent-red'
          }`} />
          <span className="text-[10px] text-text-muted capitalize">{position.riskLevel} risk</span>
        </div>
      </div>
    </div>
  )
}

function IdleCard({ balance }: { balance: TokenBalance }) {
  return (
    <div className="glass-panel p-4 border-accent-yellow/10 group hover:border-accent-yellow/25 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-base font-bold text-text-primary">{balance.symbol}</div>
          <div className="text-xs text-accent-yellow">Idle Capital</div>
        </div>
        <div className="text-lg font-mono font-bold text-text-muted">
          0.0%
        </div>
      </div>

      <div className="text-xs text-text-muted mb-2">Sitting in wallet — earning nothing</div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-lg font-mono font-semibold text-text-primary">
            ${balance.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[10px] text-text-muted">
            {balance.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {balance.symbol}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-accent-yellow">$0/day</div>
          <div className="text-[10px] text-text-muted">
            Earning nothing
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border-primary/40">
        <div className="text-[10px] text-accent-yellow">Deploy this capital to start earning yield</div>
      </div>
    </div>
  )
}
