import { useIntelligenceStore } from '@/stores/intelligence-store'
import { usePositionStore } from '@/stores/position-store'
import { useYieldStore } from '@/stores/yield-store'
import { useUIStore } from '@/stores/ui-store'
import { generateYieldStory, detectAnomalies, surfaceOpportunities } from '@/intelligence/pipeline'
import { isIntelligenceAvailable } from '@/intelligence/client'
import { computePositionDiff } from '@/mutation/diff'
import { IntentPanel } from './IntentPanel'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

export function IntelligenceView() {
  const { connected } = useWallet()
  const { setVisible } = useWalletModal()
  const { positions } = usePositionStore()
  const { sources, pegs, protocolHealth } = useYieldStore()
  const {
    yieldStory,
    anomalies,
    opportunities,
    isGenerating,
    setYieldStory,
    addAnomaly,
    acknowledgeAnomaly,
    setOpportunities,
    setIsGenerating,
  } = useIntelligenceStore()

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-6 hero-gradient">
        <div className="text-3xl opacity-10">✦</div>
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-2 tracking-tight">AI Intelligence</h2>
          <p className="text-text-secondary text-sm max-w-sm leading-relaxed">
            Connect your wallet to access AI-powered yield intelligence and natural language deployment.
          </p>
        </div>
        <button onClick={() => setVisible(true)} className="btn-primary">Connect Wallet</button>
      </div>
    )
  }

  if (!isIntelligenceAvailable()) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-6 hero-gradient">
        <div className="text-3xl opacity-10">✦</div>
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-2 tracking-tight">AI Intelligence</h2>
          <p className="text-text-secondary text-sm max-w-sm leading-relaxed">
            Set <code className="bg-bg-tertiary/80 px-1.5 py-0.5 rounded-md text-text-primary text-xs font-mono">VITE_ANTHROPIC_API_KEY</code>{' '}
            in your <code className="bg-bg-tertiary/80 px-1.5 py-0.5 rounded-md text-text-primary text-xs font-mono">.env</code> file to enable
            Claude-powered yield intelligence.
          </p>
        </div>
      </div>
    )
  }

  const handleGenerateStory = async () => {
    setIsGenerating(true)
    try {
      const story = await generateYieldStory(positions?.value ?? [], sources?.value ?? [])
      if (story) setYieldStory(story)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDetectAnomalies = async () => {
    setIsGenerating(true)
    try {
      const detected = await detectAnomalies(
        positions?.value ?? [],
        pegs?.value ?? [],
        protocolHealth?.value ?? []
      )
      detected.forEach(addAnomaly)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleFindOpportunities = async () => {
    setIsGenerating(true)
    try {
      const opps = await surfaceOpportunities(positions?.value ?? [], sources?.value ?? [])
      setOpportunities(opps)
    } finally {
      setIsGenerating(false)
    }
  }

  const openActionPanel = useUIStore((s) => s.openActionPanel)

  const handleActOnOpportunity = (opp: typeof opportunities[0]) => {
    const source = (sources?.value ?? []).find(
      (s) => s.protocol === opp.protocol && s.strategy === opp.strategy
    )
    if (!source) return

    const currentPosition = (positions?.value ?? [])[0]
    if (currentPosition) {
      const diff = computePositionDiff(currentPosition, source, currentPosition.valueUsd)
      openActionPanel(diff)
    } else {
      const idlePosition = {
        id: 'idle-capital',
        wallet: '',
        protocol: 'wallet',
        strategy: 'Idle Balance',
        asset: source.asset,
        amount: 0,
        valueUsd: 0,
        apy: 0,
        apySources: [] as { type: 'base'; label: string; apy: number }[],
        riskLevel: 'low' as const,
        riskFactors: [] as string[],
        entryTimestamp: Date.now(),
        lastUpdate: Date.now(),
      }
      const diff = computePositionDiff(idlePosition, source, 0)
      openActionPanel(diff)
    }
  }

  const activeAnomalies = anomalies.filter((a) => !a.acknowledged)

  return (
    <div className="space-y-6 fade-in">
      <h1 className="text-xl font-bold text-text-primary tracking-tight">AI Intelligence</h1>

      <IntentPanel />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ActionCard
          title="Yield Story"
          description="Narrative breakdown of how and why you earn"
          icon="○"
          accent="blue"
          disabled={isGenerating}
          onClick={handleGenerateStory}
        />
        <ActionCard
          title="Anomaly Detection"
          description="Scan for unusual protocol behavior and risks"
          icon="△"
          accent="yellow"
          disabled={isGenerating}
          badge={activeAnomalies.length > 0 ? String(activeAnomalies.length) : undefined}
          onClick={handleDetectAnomalies}
        />
        <ActionCard
          title="Opportunities"
          description="Find higher-yield alternatives for your positions"
          icon="↗"
          accent="green"
          disabled={isGenerating}
          badge={opportunities.length > 0 ? String(opportunities.length) : undefined}
          onClick={handleFindOpportunities}
        />
      </div>

      {isGenerating && (
        <div className="glass-panel p-8 text-center">
          <div className="w-6 h-6 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-text-secondary">Analyzing with Claude...</div>
        </div>
      )}

      {yieldStory && (
        <div className="glass-panel p-5 md:p-6 space-y-4 fade-in">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text-primary tracking-tight">Your Yield Story</h2>
            <span className="text-[10px] text-text-muted font-mono">
              {new Date(yieldStory.generatedAt).toLocaleTimeString()}
            </span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{yieldStory.summary}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg-tertiary/50 rounded-xl p-3.5">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Est. Annual Earnings</div>
              <div className="text-xl font-mono font-bold text-accent-green">
                ${yieldStory.totalEarnings.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-bg-tertiary/50 rounded-xl p-3.5">
              <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Top Source</div>
              <div className="text-sm text-text-primary font-medium">{yieldStory.topSource}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Risk Assessment</div>
            <p className="text-sm text-text-secondary leading-relaxed">{yieldStory.riskAssessment}</p>
          </div>
          <div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Recommendations</div>
            <ul className="space-y-2">
              {yieldStory.recommendations.map((rec, i) => (
                <li key={i} className="text-sm text-text-secondary flex items-start gap-2.5 leading-relaxed">
                  <span className="text-accent-blue shrink-0 mt-0.5 text-xs">→</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeAnomalies.length > 0 && (
        <div className="glass-panel p-5 md:p-6">
          <h2 className="text-sm font-bold text-text-primary tracking-tight mb-4">Anomalies</h2>
          <div className="space-y-2">
            {activeAnomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className={`p-3.5 rounded-xl border ${
                  anomaly.severity === 'critical'
                    ? 'border-accent-red/30 bg-accent-red/5'
                    : anomaly.severity === 'warning'
                    ? 'border-accent-yellow/30 bg-accent-yellow/5'
                    : 'border-border-primary'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary">{anomaly.title}</div>
                    <div className="text-xs text-text-secondary mt-1 leading-relaxed">{anomaly.description}</div>
                    <div className="text-[10px] text-text-muted mt-1 capitalize">{anomaly.protocol}</div>
                  </div>
                  <button
                    onClick={() => acknowledgeAnomaly(anomaly.id)}
                    className="btn-ghost text-text-muted hover:text-text-primary shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {opportunities.length > 0 && (
        <div className="glass-panel p-5 md:p-6">
          <h2 className="text-sm font-bold text-text-primary tracking-tight mb-4">Opportunities</h2>
          <div className="space-y-2">
            {opportunities.map((opp) => (
              <div
                key={opp.id}
                className="p-3.5 rounded-xl border border-border-primary/60 hover:border-accent-green/20 transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary capitalize">
                      {opp.protocol} — {opp.strategy}
                    </div>
                    <div className="text-xs text-text-secondary mt-1 leading-relaxed">{opp.reason}</div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                    <div className="text-sm font-mono font-semibold text-accent-green">{opp.currentApy.toFixed(2)}%</div>
                    <div className="text-xs font-mono text-accent-green">+${opp.projectedGain.toFixed(0)}/yr</div>
                    <button
                      onClick={() => handleActOnOpportunity(opp)}
                      className="btn-ghost bg-accent-green/8 text-accent-green hover:bg-accent-green/15"
                    >
                      Act
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface ActionCardProps {
  title: string
  description: string
  icon: string
  accent: 'blue' | 'yellow' | 'green'
  disabled?: boolean
  badge?: string
  onClick: () => void
}

function ActionCard({ title, description, icon, accent, disabled, badge, onClick }: ActionCardProps) {
  const accentClass = {
    blue: 'hover:border-accent-blue/20 text-accent-blue',
    yellow: 'hover:border-accent-yellow/20 text-accent-yellow',
    green: 'hover:border-accent-green/20 text-accent-green',
  }[accent]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`glass-panel p-4 text-left transition-all duration-200 disabled:opacity-40 btn-press relative ${accentClass.split(' ')[0]}`}
    >
      {badge && (
        <span className="absolute top-3 right-3 bg-accent-blue text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
          {badge}
        </span>
      )}
      <span className={`text-lg ${accentClass.split(' ')[1]}`}>{icon}</span>
      <div className="text-sm font-semibold text-text-primary mt-2">{title}</div>
      <div className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</div>
    </button>
  )
}
