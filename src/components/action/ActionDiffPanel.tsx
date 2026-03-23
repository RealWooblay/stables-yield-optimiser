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
    <div className="space-y-5 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-text-secondary leading-relaxed">{preview.summary}</p>
        </div>
        <RiskBadge level={risk.level as RiskLevel} />
      </div>

      <div className="space-y-px rounded-xl overflow-hidden">
        {diff.diffs.map((d, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-3 px-3.5 bg-bg-tertiary/50 text-sm"
          >
            <span className="text-text-muted capitalize text-xs">{d.field}</span>
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-text-muted">{String(d.before)}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" className="text-text-muted/50 shrink-0">
                <path d="M4 6h4M6.5 4l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span className={
                d.changePercent !== undefined && d.changePercent > 0
                  ? 'text-accent-green font-semibold'
                  : 'text-text-primary'
              }>
                {String(d.after)}
              </span>
              {d.changePercent !== undefined && (
                <span className={`text-[10px] ${d.changePercent > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                  ({d.changePercent > 0 ? '+' : ''}{d.changePercent.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg-tertiary/50 rounded-xl p-3.5">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">APY Change</div>
          <div className={`font-mono font-semibold ${diff.apyDelta >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {diff.apyDelta >= 0 ? '+' : ''}{diff.apyDelta.toFixed(2)}%
          </div>
        </div>
        <div className="bg-bg-tertiary/50 rounded-xl p-3.5">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Annual Impact</div>
          <div className={`font-mono font-semibold ${diff.projectedAnnualChange >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            {diff.projectedAnnualChange >= 0 ? '+' : ''}${diff.projectedAnnualChange.toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-tertiary/50 rounded-xl p-3.5">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Est. Fees</div>
          <div className="font-mono font-semibold text-text-secondary">{diff.estimatedFees} SOL</div>
        </div>
      </div>

      {risk.factors.length > 0 && (
        <div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Risk Factors</div>
          <div className="space-y-1.5">
            {risk.factors.map((f, i) => (
              <div key={i} className="text-xs text-text-secondary bg-bg-tertiary/60 rounded-xl px-3.5 py-2.5 leading-relaxed">
                <span className="text-text-primary font-semibold">{f.name}</span> — {f.description}
              </div>
            ))}
          </div>
        </div>
      )}

      {preview.warnings.length > 0 && (
        <div className="space-y-1.5">
          {preview.warnings.map((w, i) => (
            <div key={i} className="text-xs text-accent-yellow bg-accent-yellow/5 border border-accent-yellow/15 px-3.5 py-2.5 rounded-xl leading-relaxed">
              {w}
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2.5">Transaction Steps</div>
        <div className="space-y-2">
          {diff.steps.map((step, i) => (
            <StepRow key={step.id} step={step} index={i} />
          ))}
        </div>
        <div className="text-[10px] text-text-muted mt-2.5 uppercase tracking-wider">Est. time: {preview.estimatedTime}</div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onExecute}
          className="btn-primary flex-1 py-3"
        >
          Execute
        </button>
        <button
          onClick={onCancel}
          className="btn-secondary px-6 py-3"
        >
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
    <div className="flex items-start gap-3">
      <div className={`w-6 h-6 rounded-full ${config.bg} flex items-center justify-center text-[10px] font-bold ${config.color} shrink-0 mt-0.5`}>
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary font-medium">{step.label}</div>
        <div className="text-xs text-text-muted mt-0.5">{step.instruction}</div>
        {step.txSignature && (
          <div className="text-[10px] font-mono text-text-muted truncate mt-0.5 opacity-60">{step.txSignature}</div>
        )}
      </div>
      <span className={`text-[10px] font-semibold capitalize tracking-wide ${config.color}`}>{step.status}</span>
    </div>
  )
}
