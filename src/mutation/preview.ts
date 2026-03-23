import type { ActionDiff } from '@/core/mutation'
import { assessActionRisk, type RiskAssessment } from './risk'

export interface TransactionPreview {
  diff: ActionDiff
  risk: RiskAssessment
  summary: string
  estimatedTime: string
  warnings: string[]
}

export function buildPreview(diff: ActionDiff): TransactionPreview {
  const risk = assessActionRisk(diff)
  const warnings: string[] = []

  if (risk.level === 'high' || risk.level === 'critical') {
    warnings.push('This action has elevated risk. Review carefully.')
  }

  if (diff.apyDelta < 0) {
    warnings.push(`This action will reduce your APY by ${Math.abs(diff.apyDelta).toFixed(2)}%`)
  }

  if (diff.riskDelta > 0) {
    warnings.push('This action increases your overall risk exposure')
  }

  if (diff.steps.length > 2) {
    warnings.push('This action requires multiple transactions and may take several minutes')
  }

  const apyChange = diff.apyDelta > 0
    ? `+${diff.apyDelta.toFixed(2)}% APY`
    : `${diff.apyDelta.toFixed(2)}% APY`

  const summary = diff.type === 'migrate'
    ? `Migrate to ${diff.protocol} ${diff.strategy} (${apyChange}, est. $${diff.projectedAnnualChange.toFixed(2)}/yr)`
    : `Rebalance to ${diff.strategy} (${apyChange}, est. $${diff.projectedAnnualChange.toFixed(2)}/yr)`

  const estimatedTime = diff.steps.length > 1
    ? `~${diff.steps.length * 30}s`
    : '~15s'

  return { diff, risk, summary, estimatedTime, warnings }
}
