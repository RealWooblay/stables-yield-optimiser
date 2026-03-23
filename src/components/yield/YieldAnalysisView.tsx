import { useMemo } from 'react'
import { usePositionStore } from '@/stores/position-store'
import { useYieldStore } from '@/stores/yield-store'
import { useUIStore } from '@/stores/ui-store'
import { RiskBadge } from '@/components/primitives/RiskBadge'
import { FreshnessDot } from '@/components/primitives/FreshnessDot'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { findMissedYield } from '@/simulation/comparator'
import { computePositionDiff } from '@/mutation/diff'
import { sortByRAYS, type RAYSScore } from '@/intelligence/risk-adjusted-yield'
import { PortfolioOptimizer } from './PortfolioOptimizer'

export function YieldAnalysisView() {
  const { connected } = useWallet()
  const { setVisible } = useWalletModal()
  const { positions } = usePositionStore()
  const { sources } = useYieldStore()
  const openActionPanel = useUIStore((s) => s.openActionPanel)

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-6 hero-gradient">
        <div className="text-3xl opacity-10">↗</div>
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-2 tracking-tight">Yield Analysis</h2>
          <p className="text-text-secondary text-sm max-w-sm leading-relaxed">
            Connect your wallet to discover optimization opportunities and compare yield sources.
          </p>
        </div>
        <button onClick={() => setVisible(true)} className="btn-primary">Connect Wallet</button>
      </div>
    )
  }

  const positionList = positions?.value ?? []
  const sourceList = sources?.value ?? []
  const pegs = useYieldStore((s) => s.pegs)
  const missed = findMissedYield(positionList, sourceList)

  const rankedSources = useMemo(
    () => sortByRAYS(sourceList, pegs?.value ?? undefined),
    [sourceList, pegs]
  )

  const handleOptimize = (positionId: string, targetProtocol: string, targetStrategy: string) => {
    const position = positionList.find((p) => p.id === positionId)
    const target = sourceList.find((s) => s.protocol === targetProtocol && s.strategy === targetStrategy)
    if (!position || !target) return
    const diff = computePositionDiff(position, target, position.valueUsd)
    openActionPanel(diff)
  }

  const handleDepositIdleCapital = (source: typeof sourceList[0]) => {
    const idlePosition = {
      id: 'idle-capital',
      wallet: '',
      protocol: 'wallet',
      strategy: 'Idle Balance',
      asset: source.asset,
      amount: 0,
      valueUsd: 0,
      apy: 0,
      apySources: [],
      riskLevel: 'low' as const,
      riskFactors: [],
      entryTimestamp: Date.now(),
      lastUpdate: Date.now(),
    }
    const diff = computePositionDiff(idlePosition, source, 0)
    openActionPanel(diff)
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">Yield Analysis</h1>
        <div className="flex items-center gap-2">
          {sources && <FreshnessDot label={sources} showAge />}
        </div>
      </div>

      {missed.length > 0 && (
        <div className="glass-panel p-5 border-l-[3px] border-l-accent-yellow">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent-yellow text-sm">△</span>
            <span className="text-xs font-bold text-accent-yellow uppercase tracking-wider">Optimization Opportunities</span>
          </div>
          <div className="space-y-3">
            {missed.slice(0, 5).map(({ position, bestAlternative, missedAnnual }) => (
              <div key={position.id} className="flex items-center justify-between gap-4">
                <div className="text-sm text-text-secondary min-w-0 leading-relaxed">
                  Switching <span className="text-text-primary font-medium">{position.strategy}</span> to{' '}
                  <span className="text-text-primary font-medium">{bestAlternative.strategy}</span> ({bestAlternative.protocol}) could earn{' '}
                  <span className="text-accent-green font-mono font-semibold">+${missedAnnual.toFixed(0)}/yr</span>
                </div>
                <button
                  onClick={() => handleOptimize(position.id, bestAlternative.protocol, bestAlternative.strategy)}
                  className="btn-ghost shrink-0 bg-accent-green/8 text-accent-green hover:bg-accent-green/15"
                >
                  Optimize
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <PortfolioOptimizer />

      {positionList.length > 0 && (
        <div className="glass-panel p-5 md:p-6">
          <h2 className="text-sm font-bold text-text-primary tracking-tight mb-4">Current Earnings</h2>
          <div className="space-y-5">
            {positionList.map((position) => {
              const dailyEarning = (position.valueUsd * position.apy) / 365 / 100
              return (
                <div key={position.id}>
                  <div className="flex items-center justify-between mb-2.5">
                    <div>
                      <span className="text-sm text-text-primary font-medium">{position.strategy}</span>
                      <span className="text-xs text-text-muted ml-2 capitalize">{position.protocol}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono text-accent-green font-semibold">+${dailyEarning.toFixed(4)}/day</div>
                      <div className="text-[10px] text-text-muted">{position.apy.toFixed(2)}% APY</div>
                    </div>
                  </div>

                  {position.apySources.length > 0 && (
                    <>
                      <div className="flex h-5 rounded-lg overflow-hidden gap-px">
                        {position.apySources.map((source, i) => {
                          const widthPercent = position.apy > 0 ? (source.apy / position.apy) * 100 : 0
                          const colors: Record<string, string> = {
                            base: 'bg-accent-blue',
                            reward: 'bg-accent-purple',
                            boost: 'bg-accent-green',
                            fee: 'bg-accent-yellow',
                          }
                          return (
                            <div
                              key={i}
                              className={`${colors[source.type] ?? 'bg-accent-blue'} flex items-center justify-center transition-all`}
                              style={{ width: `${widthPercent}%` }}
                              title={`${source.label}: ${source.apy.toFixed(1)}%`}
                            >
                              <span className="text-[10px] text-white/90 font-mono font-semibold px-1 truncate">
                                {source.apy.toFixed(1)}%
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex gap-3 mt-1.5">
                        {position.apySources.map((source, i) => (
                          <span key={i} className="text-[10px] text-text-muted">{source.label}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {rankedSources.length > 0 && (
        <div className="glass-panel p-5 md:p-6">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-text-primary tracking-tight">
              Available Yield Sources
            </h2>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mt-1">Sorted by Risk-Adjusted Yield Score (RAYS)</p>
          </div>
          <div className="overflow-x-auto -mx-5 px-5 md:-mx-6 md:px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-text-muted border-b border-border-primary uppercase tracking-wider">
                  <th className="pb-3 font-semibold">RAYS</th>
                  <th className="pb-3 font-semibold">Protocol</th>
                  <th className="pb-3 font-semibold">Strategy</th>
                  <th className="pb-3 font-semibold text-right">APY</th>
                  <th className="pb-3 font-semibold text-right">Adj. APY</th>
                  <th className="pb-3 font-semibold text-right">TVL</th>
                  <th className="pb-3 font-semibold">Risk</th>
                  <th className="pb-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {rankedSources.slice(0, 30).map((source, i) => (
                  <tr key={i} className="border-b border-border-primary/20 last:border-0 hover:bg-bg-tertiary/30 transition-all duration-150 group">
                    <td className="py-3">
                      <RAYSBadge rays={source.rays} />
                    </td>
                    <td className="py-3 text-text-primary capitalize font-medium text-xs">{source.protocol}</td>
                    <td className="py-3 text-text-muted text-xs max-w-[200px] truncate">{source.strategy}</td>
                    <td className="py-3 font-mono text-text-muted text-right text-xs">
                      {source.apy.toFixed(2)}%
                    </td>
                    <td className="py-3 font-mono text-accent-green text-right text-xs font-semibold">
                      {source.rays.adjustedApy.toFixed(2)}%
                    </td>
                    <td className="py-3 font-mono text-text-muted text-xs text-right">
                      ${(source.tvl / 1_000_000).toFixed(1)}M
                    </td>
                    <td className="py-3">
                      <RiskBadge level={source.riskLevel} showLabel={false} />
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleDepositIdleCapital(source)}
                        className="btn-ghost text-[10px] text-accent-blue opacity-0 group-hover:opacity-100 transition-opacity bg-accent-blue/8 hover:bg-accent-blue/15"
                      >
                        Deposit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {positionList.length === 0 && rankedSources.length === 0 && (
        <div className="glass-panel p-10 text-center">
          <div className="w-6 h-6 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-muted text-sm">Loading yield data...</p>
        </div>
      )}
    </div>
  )
}

function RAYSBadge({ rays }: { rays: RAYSScore }) {
  const gradeColor = {
    A: 'text-accent-green bg-accent-green/8',
    B: 'text-accent-blue bg-accent-blue/8',
    C: 'text-accent-yellow bg-accent-yellow/8',
    D: 'text-accent-red/70 bg-accent-red/5',
    F: 'text-accent-red bg-accent-red/8',
  }[rays.grade]

  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${gradeColor}`}>
        {rays.grade}
      </span>
      <span className="text-[10px] font-mono text-text-muted">{rays.score}</span>
    </div>
  )
}
