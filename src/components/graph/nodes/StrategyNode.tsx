import { Handle, Position } from '@xyflow/react'
import type { RiskLevel } from '@/core/defi'

interface StrategyNodeData {
  name: string
  apy: number
  value: number
  riskLevel: RiskLevel
}

const riskBorder: Record<RiskLevel, string> = {
  low: 'rgba(16,185,129,0.4)',
  medium: 'rgba(245,158,11,0.4)',
  high: 'rgba(239,68,68,0.4)',
  critical: 'rgba(239,68,68,0.5)',
}

export function StrategyNode({ data }: { data: StrategyNodeData }) {
  const borderColor = riskBorder[data.riskLevel]

  return (
    <div
      className="bg-bg-secondary/90 backdrop-blur-sm rounded-2xl px-5 py-4 min-w-[180px] shadow-lg"
      style={{ border: `1.5px solid ${borderColor}` }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#10b981', width: 8, height: 8, border: '2px solid #0a0b0d' }} />
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Strategy</div>
      <div className="text-sm font-semibold text-text-primary leading-tight">{data.name}</div>
      <div className="flex items-center justify-between mt-2.5">
        <span className="text-sm font-mono text-accent-green font-bold">{data.apy.toFixed(2)}%</span>
        <span className="text-xs font-mono text-text-muted">
          ${data.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#8b5cf6', width: 8, height: 8, border: '2px solid #0a0b0d' }} />
    </div>
  )
}
