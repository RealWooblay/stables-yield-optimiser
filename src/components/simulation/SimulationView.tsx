import { useState, useEffect, useMemo } from 'react'
import { useSimulationStore } from '@/stores/simulation-store'
import { usePositionStore } from '@/stores/position-store'
import { useYieldStore } from '@/stores/yield-store'
import { useWalletStore } from '@/stores/wallet-store'
import { runSimulation, compareStrategies } from '@/simulation/engine'
import { SCENARIO_TEMPLATES } from '@/simulation/scenarios'
import type { SimulationConfig, StrategyConfig } from '@/core/simulation'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { getTenantConfig, isTenantEcosystemPosition, isTenantYieldSource } from '@/config/tenant'

interface SimulationViewProps {
  /** When true, parent already ensured wallet; hide connect gate and extra chrome. */
  embedded?: boolean
}

export function SimulationView({ embedded = false }: SimulationViewProps) {
  const { connected } = useWallet()
  const { setVisible } = useWalletModal()
  const { positions } = usePositionStore()
  const { sources } = useYieldStore()
  const balances = useWalletStore((s) => s.balances)
  const {
    scenarioParams,
    results,
    comparison,
    isRunning,
    setScenarioParams,
    setResults,
    setComparison,
    setIsRunning,
  } = useSimulationStore()

  const tenant = getTenantConfig()

  const portfolioPrincipal = useMemo(() => {
    const raw = positions?.value ?? []
    const posList = tenant ? raw.filter((p) => isTenantEcosystemPosition(p, tenant)) : raw
    const posUsd = posList.reduce((s, p) => s + p.valueUsd, 0)
    let idleUsd = 0
    if (tenant) {
      const w = balances?.value?.find((b) => b.mint === tenant.stablecoinMint && b.uiAmount > 0)
      idleUsd = w ? (w.valueUsd > 0 ? w.valueUsd : w.uiAmount) : 0
    }
    const t = posUsd + idleUsd
    return t >= 1 ? Math.round(t) : 10_000
  }, [positions?.value, balances?.value, tenant])

  const [principal, setPrincipal] = useState(10_000)
  const [durationDays, setDurationDays] = useState(90)
  const [selectedScenario, setSelectedScenario] = useState('baseline')

  useEffect(() => {
    if (portfolioPrincipal >= 1) setPrincipal(portfolioPrincipal)
  }, [portfolioPrincipal])

  if (!embedded && !connected) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
        <p className="text-sm text-text-secondary">Connect your wallet to run simulations.</p>
        <button type="button" onClick={() => setVisible(true)} className="btn-primary">
          Connect Wallet
        </button>
      </div>
    )
  }

  const handleRun = () => {
    setIsRunning(true)

    const rawPos = positions?.value ?? []
    const positionList = tenant ? rawPos.filter((p) => isTenantEcosystemPosition(p, tenant)) : rawPos
    const rawSources = sources?.value ?? []
    const tenantSources = tenant ? rawSources.filter((s) => isTenantYieldSource(s, tenant)) : rawSources

    const positionStrategies: StrategyConfig[] = positionList.map((p) => ({
      protocol: p.protocol,
      strategy: p.strategy,
      allocation: 1.0,
      currentApy: Math.max(p.apy, 0.01),
    }))

    const altStrategies: StrategyConfig[] = tenantSources
      .filter((s) => !positionList.some((p) => p.protocol === s.protocol && p.strategy === s.strategy))
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 6)
      .map((s) => ({
        protocol: s.protocol,
        strategy: s.strategy,
        allocation: 1.0,
        currentApy: Math.max(s.apy, 0.01),
      }))

    let strategies = [...positionStrategies, ...altStrategies]

    if (strategies.length === 0) {
      const fallbackApy = 2.4
      strategies = [
        {
          protocol: 'kamino-lend',
          strategy: tenant?.stablecoin === 'USX' ? 'USX supply (illustrative)' : `${tenant?.stablecoin ?? 'Stable'} lend (illustrative)`,
          allocation: 1.0,
          currentApy: fallbackApy,
        },
      ]
    }

    const tenantAsset = tenant?.stablecoin ?? 'USDC'
    const config: SimulationConfig = {
      principal,
      asset: tenantAsset,
      durationDays,
      strategies,
    }

    try {
      const simResults = runSimulation(config, scenarioParams)
      setResults(simResults)

      const currentLabel =
        positionList.length > 0 ? `${positionList[0].protocol} - ${positionList[0].strategy}` : undefined

      setComparison(
        compareStrategies(simResults, currentLabel, {
          sameStablecoinScope: !!tenant,
          stablecoinLabel: tenant?.stablecoin,
        }),
      )
    } catch (e) {
      console.error('[SimulationView]', e)
      setResults([])
      setComparison(null)
    } finally {
      setIsRunning(false)
    }
  }

  const applyTemplate = (id: string) => {
    setSelectedScenario(id)
    const tpl = SCENARIO_TEMPLATES.find((t) => t.id === id)
    if (tpl) setScenarioParams(tpl.params)
  }

  return (
    <div className={`space-y-5 ${embedded ? '' : 'fade-in'}`}>
      {!embedded && (
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Simulation</h2>
      )}

      <div className="rounded-xl border border-border-primary/40 bg-bg-tertiary/20 p-4 md:p-5">
        <h3 className="text-xs font-semibold text-text-primary mb-3">Inputs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              Principal (USD)
            </label>
            <input
              type="number"
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value))}
              className="w-full bg-bg-primary/80 border border-border-primary/60 rounded-xl px-3.5 py-2.5 text-text-primary font-mono text-sm focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Duration (days)</label>
            <input
              type="number"
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full bg-bg-primary/80 border border-border-primary/60 rounded-xl px-3.5 py-2.5 text-text-primary font-mono text-sm focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">
              APY modifier <span className="font-mono text-text-primary">{scenarioParams.apyChange}x</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={scenarioParams.apyChange}
              onChange={(e) => setScenarioParams({ apyChange: Number(e.target.value) })}
              className="w-full mt-2 accent-accent-blue"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border-primary/40 bg-bg-tertiary/20 p-4 md:p-5">
        <h3 className="text-xs font-semibold text-text-primary mb-3">Scenarios</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {SCENARIO_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => applyTemplate(tpl.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedScenario === tpl.id
                  ? 'border-accent-blue/40 bg-accent-blue/10'
                  : 'border-border-primary/50 hover:bg-bg-primary/40'
              }`}
            >
              <div className="text-sm font-medium text-text-primary">{tpl.name}</div>
              <div className="text-[11px] text-text-muted mt-0.5 leading-snug">{tpl.description}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={isRunning}
        className="btn-primary w-full py-3 rounded-xl"
      >
        {isRunning ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Running…
          </span>
        ) : (
          'Run simulation'
        )}
      </button>

      {results && results.length > 0 && (
        <div className="rounded-xl border border-border-primary/40 bg-bg-tertiary/20 p-4 md:p-5">
          <h3 className="text-xs font-semibold text-text-primary mb-1">Results</h3>
          <p className="text-[11px] text-text-muted mb-3">
            {durationDays}d · ${principal.toLocaleString()} · {tenant?.stablecoin ?? 'asset'}-scoped strategies
          </p>
          <div className="space-y-1">
            {[...results].sort((a, b) => b.totalReturn - a.totalReturn).map((result, i) => (
              <div
                key={`${result.strategyLabel}-${i}`}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
                  i === 0 ? 'bg-accent-green/5 border border-accent-green/15' : 'hover:bg-bg-primary/30'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary font-medium truncate">{result.strategyLabel}</div>
                  <div className="text-[11px] text-text-muted">
                    Risk {result.riskScore.toFixed(0)} · DD {(result.maxDrawdown * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <div className="text-sm font-mono font-semibold text-accent-green">
                    +${result.totalReturn.toFixed(2)}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted">{result.effectiveApy.toFixed(2)}% APY</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {comparison && (
        <div className="rounded-xl border border-border-primary/30 bg-bg-secondary/15 p-4">
          <h3 className="text-xs font-semibold text-text-primary mb-2">Modeled comparison</h3>
          <p className="text-sm text-text-secondary leading-relaxed">{comparison.recommendation}</p>
          {comparison.missedYield > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-accent-yellow/5 border border-accent-yellow/15 text-sm text-accent-yellow">
              Delta vs baseline: +${comparison.missedYield.toFixed(2)} over the simulated window
            </div>
          )}
        </div>
      )}
    </div>
  )
}
