import type { ActionDiff, TransactionStep } from '@/core/mutation'
import { buildPreview } from '@/mutation/preview'
import { RiskBadge } from '@/components/primitives/RiskBadge'
import type { RiskLevel } from '@/core/defi'

interface ActionDiffPanelProps {
  diff: ActionDiff
  onExecute?: () => void
  onCancel?: () => void
}

export function ActionDiffPanel({ diff, onExecute, onCancel }: ActionDiffPanelProps) {
  const preview = buildPreview(diff)
  const risk = preview.risk

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-text-secondary leading-relaxed">{preview.summary}</p>
        <RiskBadge level={risk.level as RiskLevel} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg-tertiary/50 rounded-xl p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">APY Change</div>
          <div className={`font-mono font-semibold text-sm ${diff.apyDelta >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {diff.apyDelta >= 0 ? '+' : ''}{diff.apyDelta.toFixed(2)}%
          </div>
        </div>
        <div className="bg-bg-tertiary/50 rounded-xl p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Annual</div>
          <div className={`font-mono font-semibold text-sm ${diff.projectedAnnualChange >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {diff.projectedAnnualChange >= 0 ? '+' : ''}${diff.projectedAnnualChange.toFixed(0)}
          </div>
        </div>
        <div className="bg-bg-tertiary/50 rounded-xl p-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Fees</div>
          <div className="font-mono font-semibold text-sm text-text-secondary">{diff.estimatedFees} SOL</div>
        </div>
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Steps</div>
        <div className="space-y-1.5">
          {diff.steps.map((step, i) => (
            <StepRow key={step.id} step={step} index={i} />
          ))}
        </div>
      </div>

      {preview.warnings.length > 0 && (
        <div className="space-y-1.5">
          {preview.warnings.slice(0, 2).map((w, i) => (
            <div key={i} className="text-xs text-accent-yellow bg-accent-yellow/5 border border-accent-yellow/15 px-3 py-2 rounded-lg">
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={onExecute} className="btn-primary flex-1 py-2.5">
          Execute
        </button>
        <button onClick={onCancel} className="btn-secondary px-5 py-2.5">
          Cancel
        </button>
      </div>
    </div>
  )
}

function StepRow({ step, index }: { step: TransactionStep; index: number }) {
  const statusConfig: Record<string, { color: string; bg: string }> = {
    pending: { color: 'text-text-muted', bg: 'bg-bg-elevated' },
    signing: { color: 'text-accent-yellow', bg: 'bg-accent-yellow/10' },
    confirming: { color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
    confirmed: { color: 'text-accent-green', bg: 'bg-accent-green/10' },
    failed: { color: 'text-accent-red', bg: 'bg-accent-red/10' },
  }
  const config = statusConfig[step.status] ?? statusConfig.pending

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className={`w-5 h-5 rounded-full ${config.bg} flex items-center justify-center text-[9px] font-bold ${config.color} shrink-0`}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-text-primary">{step.instruction}</span>
      </div>
      {step.txSignature && (
        <span className="text-[9px] font-mono text-text-muted truncate max-w-[80px] opacity-50">{step.txSignature}</span>
      )}
      <span className={`text-[9px] font-semibold capitalize ${config.color}`}>{step.status}</span>
    </div>
  )
}
