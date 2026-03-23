import { Handle, Position } from '@xyflow/react'

interface AssetNodeData {
  symbol: string
  totalValue: number
}

export function AssetNode({ data }: { data: AssetNodeData }) {
  return (
    <div className="bg-bg-secondary/90 backdrop-blur-sm border border-border-primary/60 rounded-2xl px-5 py-4 min-w-[120px] shadow-lg">
      <Handle type="target" position={Position.Left} style={{ background: '#3b82f6', width: 8, height: 8, border: '2px solid #0a0b0d' }} />
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Asset</div>
      <div className="text-base font-bold text-text-primary">{data.symbol}</div>
      <div className="text-xs font-mono text-text-secondary mt-1.5">
        ${data.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#10b981', width: 8, height: 8, border: '2px solid #0a0b0d' }} />
    </div>
  )
}
