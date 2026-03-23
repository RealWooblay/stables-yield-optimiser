import { Handle, Position } from '@xyflow/react'

interface ProtocolNodeData {
  name: string
}

export function ProtocolNode({ data }: { data: ProtocolNodeData }) {
  return (
    <div className="bg-bg-secondary/90 backdrop-blur-sm border border-accent-purple/30 rounded-2xl px-5 py-4 min-w-[120px] shadow-[0_4px_24px_rgba(139,92,246,0.08)]">
      <Handle type="target" position={Position.Left} style={{ background: '#8b5cf6', width: 8, height: 8, border: '2px solid #0a0b0d' }} />
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Protocol</div>
      <div className="text-sm font-bold text-text-primary capitalize">{data.name}</div>
    </div>
  )
}
