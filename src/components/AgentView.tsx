import { useMemo } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { usePositionStore } from '@/stores/position-store'
import { useWalletStore } from '@/stores/wallet-store'
import { useYieldStore } from '@/stores/yield-store'
import { TenantPortfolioStrip } from './TenantPortfolioStrip'
import { OptimizeAllButton } from './OptimizeAllButton'
import { computeYieldScore } from '@/intelligence/yield-score'
import { isIdleCapital } from '@/adapters/solana/token-registry'
import { getTenantConfig, isTenantEcosystemPosition, USX_EUSX_MINT } from '@/config/tenant'

export function AgentView() {
  const { connected } = useWallet()
  const { setVisible } = useWalletModal()
  const tenant = getTenantConfig()

  if (!connected) {
    return <HeroScreen onConnect={() => setVisible(true)} tenant={tenant} />
  }

  return <ConnectedView />
}

function ConnectedView() {
  const positions = usePositionStore((s) => s.positions)
  const balances = useWalletStore((s) => s.balances)
  const sources = useYieldStore((s) => s.sources)

  const positionList = positions?.value ?? []
  const balanceList = balances?.value ?? []
  const sourceList = sources?.value ?? []

  const tenantCfg = getTenantConfig()

  // Include both USX and eUSX for scoring
  const idleBalancesForScore = tenantCfg
    ? balanceList.filter(
        (b) => (b.mint === tenantCfg.stablecoinMint || b.mint === USX_EUSX_MINT) && b.uiAmount > 0 && b.valueUsd > 0.5,
      )
    : balanceList.filter((b) => isIdleCapital(b.mint) && b.uiAmount > 0 && b.valueUsd > 0.5)

  const positionsForScore = tenantCfg
    ? positionList.filter((p) => isTenantEcosystemPosition(p, tenantCfg))
    : positionList

  const scoreResult = useMemo(() => {
    if (sourceList.length === 0 && positionsForScore.length === 0 && idleBalancesForScore.length === 0) {
      return null
    }
    return computeYieldScore(positionsForScore, idleBalancesForScore, sourceList)
  }, [sourceList, positionsForScore, idleBalancesForScore])

  const dataReady = balanceList.length > 0 || positionList.length > 0

  return (
    <div className="flex flex-col h-full w-full max-w-lg mx-auto px-4">
      {scoreResult && scoreResult.totalPortfolioValue > 0 && (
        <div className="shrink-0 py-3 text-sm border-b border-border-primary/20">
          <span className="text-text-muted">Total </span>
          <span className="font-mono font-semibold text-text-primary">
            ${scoreResult.totalPortfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-4">
        {!dataReady ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-5 h-5 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
            <span className="text-xs text-text-muted">Loading wallet…</span>
          </div>
        ) : (
          <div className="space-y-5">
            <TenantPortfolioStrip tenant={tenantCfg} balances={balanceList} positions={positionList} />
            <OptimizeAllButton />
          </div>
        )}
      </div>
    </div>
  )
}

function HeroScreen({ onConnect, tenant }: { onConnect: () => void; tenant: ReturnType<typeof getTenantConfig> }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-6 px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          {tenant ? `${tenant.stablecoin} yield` : 'Yield'}
        </h1>
        <p className="text-text-secondary text-sm max-w-xs mx-auto">
          {tenant
            ? `Compare ${tenant.stablecoin} yield across pools. No custody — you execute in venue apps.`
            : 'Connect to compare yield across pools.'}
        </p>
      </div>
      <button type="button" onClick={onConnect} className="btn-primary px-8 py-2.5 rounded-xl text-sm font-semibold w-full max-w-xs">
        Connect wallet
      </button>
    </div>
  )
}
