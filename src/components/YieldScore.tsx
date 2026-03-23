import { useMemo, useEffect, useState } from 'react'
import { usePositionStore } from '@/stores/position-store'
import { useWalletStore } from '@/stores/wallet-store'
import { useYieldStore } from '@/stores/yield-store'
import { computeYieldScore, type YieldScoreResult } from '@/intelligence/yield-score'
import { isIdleCapital } from '@/adapters/solana/token-registry'
import { getTenantConfig } from '@/config/tenant'

export function YieldScore() {
  const positions = usePositionStore((s) => s.positions)
  const balances = useWalletStore((s) => s.balances)
  const sources = useYieldStore((s) => s.sources)
  const pegs = useYieldStore((s) => s.pegs)
  const tenant = getTenantConfig()

  const scoreResult = useMemo<YieldScoreResult | null>(() => {
    const positionList = positions?.value ?? []
    const sourceList = sources?.value ?? []
    const balanceList = balances?.value ?? []

    if (sourceList.length === 0) return null

    const idleBalances = balanceList
      .filter((b) => isIdleCapital(b.mint) && b.uiAmount > 0)
      .map((b) => ({ mint: b.mint, symbol: b.symbol, valueUsd: b.valueUsd }))

    return computeYieldScore(positionList, idleBalances, sourceList, pegs?.value)
  }, [positions, balances, sources, pegs])

  if (!scoreResult || scoreResult.totalPortfolioValue < 1) {
    return (
      <div className="glass-panel p-6 md:p-8">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-bg-tertiary/60 shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-bg-tertiary/60 shimmer" />
            <div className="h-3 w-48 rounded bg-bg-tertiary/40 shimmer" />
          </div>
        </div>
      </div>
    )
  }

  const { score } = scoreResult
  const scoreColor = score >= 70 ? 'text-accent-green' : score >= 40 ? 'text-accent-yellow' : 'text-accent-red'
  const ringColor = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Work'

  return (
    <div className="glass-panel p-6 md:p-8">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <ScoreRing score={score} color={ringColor} />

        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex items-center gap-2 justify-center sm:justify-start">
            <span className={`text-3xl font-bold font-mono ${scoreColor}`}>{score}</span>
            <span className="text-text-muted text-sm">/100</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              score >= 70 ? 'bg-accent-green/10 text-accent-green'
              : score >= 40 ? 'bg-accent-yellow/10 text-accent-yellow'
              : 'bg-accent-red/10 text-accent-red'
            }`}>{label}</span>
          </div>
          <p className="text-text-secondary text-sm leading-relaxed">
            {tenant
              ? `Your ${tenant.stablecoin} portfolio is ${score}% optimized.`
              : `Your portfolio is ${score}% optimized.`
            }
            {scoreResult.moneyLeftOnTable > 1 && (
              <span className="text-accent-yellow font-medium"> You're leaving money on the table.</span>
            )}
          </p>
        </div>

        <div className="flex flex-row sm:flex-col gap-4 sm:gap-3 text-center sm:text-right">
          <MoneyCounter value={scoreResult.moneyLeftOnTable} label="Left on table/yr" />
          <div>
            <div className="text-lg font-mono font-bold text-accent-green">{scoreResult.currentBlendedApy.toFixed(2)}%</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Current APY</div>
          </div>
          <div>
            <div className="text-lg font-mono font-bold text-text-primary">{scoreResult.bestPossibleApy.toFixed(2)}%</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">Best Possible</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animatedScore / 100) * circumference

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 100)
    return () => clearTimeout(timer)
  }, [score])

  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="6"
        />
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold font-mono text-text-primary">{animatedScore}</span>
      </div>
    </div>
  )
}

function MoneyCounter({ value, label }: { value: number; label: string }) {
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    if (value <= 0) { setDisplayed(0); return }
    const duration = 1200
    const steps = 30
    const increment = value / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= value) {
        setDisplayed(value)
        clearInterval(timer)
      } else {
        setDisplayed(current)
      }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [value])

  if (value < 1) return null

  return (
    <div>
      <div className="text-lg font-mono font-bold text-accent-yellow">
        ${displayed.toFixed(0)}
      </div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider">{label}</div>
    </div>
  )
}
