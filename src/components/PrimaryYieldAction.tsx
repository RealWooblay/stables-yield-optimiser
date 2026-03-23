import { useMemo } from 'react'
import { usePositionStore } from '@/stores/position-store'
import { useWalletStore } from '@/stores/wallet-store'
import { useYieldStore } from '@/stores/yield-store'
import { useUIStore } from '@/stores/ui-store'
import { isIdleCapital } from '@/adapters/solana/token-registry'
import {
  getTenantConfig,
  isTenantEcosystemPosition,
  filterYieldSourcesForTenantActions,
} from '@/config/tenant'
import { sortByRAYS } from '@/intelligence/risk-adjusted-yield'
import type { ActionDiff } from '@/core/mutation'
import type { Position, YieldSource } from '@/core/defi'

/** USD for sizing when Helius didn’t price the token (USX ≈ $1). */
function effectiveUsd(b: { valueUsd: number; uiAmount: number }): number {
  if (Number.isFinite(b.valueUsd) && b.valueUsd > 0.01) return b.valueUsd
  return b.uiAmount
}

function pickBestVenue(pool: YieldSource[], minTvl: number): YieldSource | undefined {
  const viable = pool.filter((s) => s.riskLevel !== 'critical' && s.tvl >= minTvl && s.apy >= 0)
  if (viable.length > 0) return viable.sort((a, b) => b.apy - a.apy)[0]
  const relaxed = pool.filter((s) => s.riskLevel !== 'critical' && s.apy >= 0)
  return relaxed.sort((a, b) => b.apy - a.apy)[0]
}

type PrimaryResult =
  | {
      mode: 'action'
      headline: string
      detail: string
      extraPerYr: number
      diff: ActionDiff
    }
  | {
      mode: 'status'
      headline: string
      detail: string
    }
  | {
      mode: 'loading'
    }

/**
 * Yield simulator: compares wallet + positions to indexed USX-line pools (DeFi Llama + merged mint rows).
 * Does not sign transactions — execution stays in venue UIs.
 */
export function PrimaryYieldAction() {
  const tenant = getTenantConfig()
  const positions = usePositionStore((s) => s.positions)
  const balances = useWalletStore((s) => s.balances)
  const sources = useYieldStore((s) => s.sources)
  const pegs = useYieldStore((s) => s.pegs)
  const openActionPanel = useUIStore((s) => s.openActionPanel)

  const result = useMemo((): PrimaryResult => {
    const sourceList = sources?.value ?? []
    if (sourceList.length === 0) {
      return { mode: 'loading' }
    }

    const ranked = sortByRAYS(sourceList, pegs?.value)
    const pool = tenant ? filterYieldSourcesForTenantActions(ranked, tenant) : ranked

    const rawPositions = positions?.value ?? []
    const positionList = tenant
      ? rawPositions.filter((p) => isTenantEcosystemPosition(p, tenant))
      : rawPositions
    const balanceList = balances?.value ?? []

    // Index row missing (should be rare after mint-merge in sync) — still show a simulation from on-chain positions.
    if (pool.length === 0) {
      if (positionList.length > 0) {
        const main = largestPosition(positionList)
        return {
          mode: 'status',
          headline: 'Simulation from your positions',
          detail: `We see ~$${main.valueUsd.toFixed(0)} in ${main.protocol} at ~${main.apy.toFixed(2)}% (${main.asset}). Indexed USX pools didn’t load into this view yet — pull to refresh or wait for the next APY poll. You can still compare venues in Kamino using these numbers as a baseline.`,
        }
      }
      return {
        mode: 'status',
        headline: 'Waiting on USX pool rows',
        detail:
          'Yield sources are loading. If this persists, the DeFi Llama feed may be blocked — check network / ad blockers.',
      }
    }

    const minTvl = tenant?.stablecoin === 'USX' ? 25_000 : 1_000_000
    const venueForDeploy = pickBestVenue(pool, minTvl)
    if (!venueForDeploy) {
      return {
        mode: 'status',
        headline: 'Couldn’t pick a comparison venue',
        detail: 'Pools were filtered by TVL/risk. Try again after the yield feed refreshes.',
      }
    }

    const idleBalances = balanceList.filter((b) => {
      if (b.uiAmount <= 0) return false
      if (tenant) {
        if (b.mint !== tenant.stablecoinMint) return false
        return effectiveUsd(b) > 0.5
      }
      return isIdleCapital(b.mint) && effectiveUsd(b) > 0.5
    })

    interface Cand {
      extraPerYr: number
      headline: string
      detail: string
      diff: ActionDiff
    }
    const candidates: Cand[] = []

    for (const idle of idleBalances) {
      const usd = effectiveUsd(idle)
      const extraPerYr = (usd * venueForDeploy.apy) / 100
      if (extraPerYr < 0.15) continue
      candidates.push({
        extraPerYr,
        headline: `Deploy idle ${idle.symbol}`,
        detail: `${venueForDeploy.protocol} · ${venueForDeploy.strategy} · ${venueForDeploy.apy.toFixed(2)}% (~+$${extraPerYr.toFixed(0)}/yr on ~$${usd.toFixed(0)})`,
        diff: {
          id: `deploy-${Date.now()}`,
          type: 'deposit',
          protocol: venueForDeploy.protocol,
          strategy: venueForDeploy.strategy,
          diffs: [
            { field: 'amount', before: 0, after: usd },
            { field: 'apy', before: 0, after: venueForDeploy.apy, changePercent: 100 },
          ],
          estimatedFees: 0.001,
          estimatedGas: 200_000,
          riskDelta: 0,
          apyDelta: venueForDeploy.apy,
          projectedAnnualChange: extraPerYr,
          steps: [
            {
              id: 'step-1',
              label: `Deposit ${idle.symbol}`,
              instruction: `Deposit ~$${usd.toFixed(0)} ${idle.symbol} into ${venueForDeploy.strategy} (${venueForDeploy.protocol})`,
              status: 'pending',
            },
          ],
        },
      })
    }

    for (const pos of positionList) {
      const better = pool.find(
        (s) =>
          s.apy > pos.apy + 0.05 &&
          s.riskLevel !== 'critical' &&
          s.tvl >= 10_000 &&
          !(s.protocol === pos.protocol && s.strategy === pos.strategy),
      )
      if (!better) continue
      const apyGain = better.apy - pos.apy
      const extraPerYr = (pos.valueUsd * apyGain) / 100
      if (extraPerYr < 0.15) continue
      candidates.push({
        extraPerYr,
        headline: `Switch to a higher USX APY`,
        detail: `${better.protocol} · ${better.strategy} · +${apyGain.toFixed(2)}% vs your current (~+$${extraPerYr.toFixed(0)}/yr on ~$${pos.valueUsd.toFixed(0)})`,
        diff: {
          id: `move-${Date.now()}`,
          type: 'migrate',
          protocol: better.protocol,
          strategy: better.strategy,
          diffs: [
            { field: 'protocol', before: pos.protocol, after: better.protocol },
            { field: 'strategy', before: pos.strategy, after: better.strategy },
            { field: 'apy', before: pos.apy, after: better.apy, changePercent: ((better.apy - pos.apy) / (pos.apy || 1)) * 100 },
          ],
          estimatedFees: 0.002,
          estimatedGas: 400_000,
          riskDelta: 0,
          apyDelta: apyGain,
          projectedAnnualChange: extraPerYr,
          steps: [
            { id: 'w', label: 'Withdraw', instruction: `From ${pos.strategy}`, status: 'pending' },
            { id: 'd', label: 'Deposit', instruction: `Into ${better.strategy}`, status: 'pending' },
          ],
        },
      })
    }

    if (candidates.length > 0) {
      const best = candidates.sort((a, b) => b.extraPerYr - a.extraPerYr)[0]
      return {
        mode: 'action',
        headline: best.headline,
        detail: best.detail,
        extraPerYr: best.extraPerYr,
        diff: best.diff,
      }
    }

    // Deployed but no “better” row — show real numbers from positions (not “done”).
    if (positionList.length > 0) {
      const main = largestPosition(positionList)
      const indexBest = pool.reduce((a, b) => (b.apy > a.apy ? b : a), pool[0])
      const beats =
        indexBest.apy > main.apy + 0.05 &&
        !(indexBest.protocol === main.protocol && indexBest.strategy === main.strategy)

      if (beats) {
        // Should have been caught above — safety net migrate
        const apyGain = indexBest.apy - main.apy
        const extraPerYr = (main.valueUsd * apyGain) / 100
        return {
          mode: 'action',
          headline: 'Switch to a higher USX APY',
          detail: `${indexBest.protocol} · ${indexBest.strategy} · +${apyGain.toFixed(2)}% (~+$${extraPerYr.toFixed(0)}/yr)`,
          extraPerYr,
          diff: {
            id: `move-fallback-${Date.now()}`,
            type: 'migrate',
            protocol: indexBest.protocol,
            strategy: indexBest.strategy,
            diffs: [
              { field: 'protocol', before: main.protocol, after: indexBest.protocol },
              { field: 'strategy', before: main.strategy, after: indexBest.strategy },
              { field: 'apy', before: main.apy, after: indexBest.apy, changePercent: apyGain * 10 },
            ],
            estimatedFees: 0.002,
            estimatedGas: 400_000,
            riskDelta: 0,
            apyDelta: apyGain,
            projectedAnnualChange: extraPerYr,
            steps: [
              { id: 'w', label: 'Withdraw', instruction: `From ${main.strategy}`, status: 'pending' },
              { id: 'd', label: 'Deposit', instruction: `Into ${indexBest.strategy}`, status: 'pending' },
            ],
          },
        }
      }

      return {
        mode: 'status',
        headline: `Deployed ${main.asset} in ${main.protocol}`,
        detail: `~$${main.valueUsd.toFixed(0)} at ~${main.apy.toFixed(2)}% APY (from our index). Best USX row in the index right now is ~${indexBest.apy.toFixed(2)}% (${indexBest.protocol}). If that’s not higher than your position, there’s nothing to switch to here yet — execute deposits in the Kamino app when you’re ready.`,
      }
    }

    if (idleBalances.length === 0) {
      return {
        mode: 'status',
        headline: 'No idle USX in this wallet',
        detail:
          'If all USX is already in Kamino as eUSX, that’s expected. Add USX to this wallet to see a deploy suggestion, or confirm the wallet you connected matches Kamino.',
      }
    }

    return {
      mode: 'status',
      headline: 'Couldn’t size a deploy',
      detail: 'Idle USX is too small for our $/yr threshold, or pricing is missing. Try again after balances refresh.',
    }
  }, [positions, balances, sources, pegs, tenant])

  const sym = tenant?.stablecoin ?? 'stablecoin'

  if (result.mode === 'loading') {
    return (
      <div className="rounded-2xl border border-border-primary/30 bg-bg-secondary/20 px-5 py-8 text-center">
        <p className="text-sm text-text-muted">Loading yield index…</p>
      </div>
    )
  }

  if (result.mode === 'status') {
    return (
      <div className="rounded-2xl border border-border-primary/35 bg-bg-secondary/20 px-5 py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Yield simulation</p>
        <h2 className="text-lg font-semibold text-text-primary mt-2">{result.headline}</h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">{result.detail}</p>
        <p className="text-[11px] text-text-muted mt-4">
          Simulator only: blends your wallet + DeFi Llama index data. It does not move funds — execute in Kamino / the venue app.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-accent-green/25 bg-gradient-to-b from-accent-green/5 to-transparent p-6 md:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-green">Simulated next move</p>
      <h2 className="text-xl font-semibold text-text-primary mt-2 tracking-tight">{result.headline}</h2>
      <p className="text-sm text-text-secondary mt-3 leading-relaxed">{result.detail}</p>
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={() => openActionPanel(result.diff)}
          className="btn-primary w-full sm:w-auto px-8 py-3 rounded-xl text-base font-semibold"
        >
          Review intent
        </button>
        <span className="text-[10px] text-text-muted text-center sm:text-left leading-relaxed">
          {sym} line · source: on-chain + DeFi Llama · simulated, not a signed tx
        </span>
      </div>
    </div>
  )
}

function largestPosition(positions: Position[]): Position {
  return positions.reduce((a, b) => (b.valueUsd > a.valueUsd ? b : a), positions[0])
}
