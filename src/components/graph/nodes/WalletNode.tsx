import { Handle, Position } from '@xyflow/react'

interface WalletNodeData {
  address: string
  totalValue: number
}

export function WalletNode({ data }: { data: WalletNodeData }) {
  const short = `${data.address.slice(0, 4)}...${data.address.slice(-4)}`

  return (
    <div className="bg-bg-secondary/90 backdrop-blur-sm border-2 border-accent-blue/50 rounded-2xl px-5 py-4 min-w-[150px] shadow-[0_4px_24px_rgba(59,130,246,0.12)]">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Wallet</div>
      <div className="text-sm font-mono text-text-primary font-medium">{short}</div>
      <div className="text-sm font-mono text-accent-blue font-bold mt-1.5">
        ${data.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#3b82f6', width: 8, height: 8, border: '2px solid #0a0b0d' }} />
    </div>
  )
}
