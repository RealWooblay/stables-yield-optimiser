import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { usePositionStore } from '@/stores/position-store'
import { useWalletStore } from '@/stores/wallet-store'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { WalletNode } from './nodes/WalletNode'
import { AssetNode } from './nodes/AssetNode'
import { StrategyNode } from './nodes/StrategyNode'
import { ProtocolNode } from './nodes/ProtocolNode'
import { useMemo } from 'react'
import type { Position } from '@/core/defi'

const nodeTypes = {
  wallet: WalletNode,
  asset: AssetNode,
  strategy: StrategyNode,
  protocol: ProtocolNode,
}

function buildGraph(address: string, positionList: Position[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  nodes.push({
    id: 'wallet',
    type: 'wallet',
    position: { x: 0, y: 150 },
    data: {
      address,
      totalValue: positionList.reduce((s, p) => s + p.valueUsd, 0),
    },
  })

  const assetGroups = new Map<string, Position[]>()
  for (const p of positionList) {
    const group = assetGroups.get(p.asset) ?? []
    group.push(p)
    assetGroups.set(p.asset, group)
  }

  let assetY = 0
  const protocolYMap = new Map<string, number>()
  let protocolY = 0

  for (const [asset, assetPositions] of assetGroups) {
    const assetId = `asset-${asset}`
    const totalAssetValue = assetPositions.reduce((s, p) => s + p.valueUsd, 0)

    nodes.push({
      id: assetId,
      type: 'asset',
      position: { x: 240, y: assetY },
      data: { symbol: asset, totalValue: totalAssetValue },
    })

    edges.push({
      id: `wallet-${assetId}`,
      source: 'wallet',
      target: assetId,
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    })

    let stratY = assetY
    for (const position of assetPositions) {
      const stratId = `strategy-${position.id}`
      nodes.push({
        id: stratId,
        type: 'strategy',
        position: { x: 480, y: stratY },
        data: {
          name: position.strategy,
          apy: position.apy,
          value: position.valueUsd,
          riskLevel: position.riskLevel,
        },
      })

      edges.push({
        id: `${assetId}-${stratId}`,
        source: assetId,
        target: stratId,
        animated: true,
        style: { stroke: '#10b981', strokeWidth: 1.5 },
        label: `$${position.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        labelStyle: { fill: '#5a6478', fontSize: 10 },
      })

      const protoId = `protocol-${position.protocol}`
      if (!protocolYMap.has(position.protocol)) {
        protocolYMap.set(position.protocol, protocolY)
        nodes.push({
          id: protoId,
          type: 'protocol',
          position: { x: 740, y: protocolY },
          data: { name: position.protocol },
        })
        protocolY += 110
      }

      edges.push({
        id: `${stratId}-${protoId}`,
        source: stratId,
        target: protoId,
        style: { stroke: '#8b5cf6', strokeWidth: 1 },
      })

      stratY += 120
    }

    assetY += Math.max(assetPositions.length * 120, 150)
  }

  return { nodes, edges }
}

export function PositionGraphView() {
  const { connected } = useWallet()
  const { setVisible } = useWalletModal()
  const { address } = useWalletStore()
  const { positions } = usePositionStore()

  const { nodes, edges } = useMemo(() => {
    const positionList = positions?.value ?? []
    if (!connected || !address || positionList.length === 0) {
      return { nodes: [], edges: [] }
    }
    return buildGraph(address, positionList)
  }, [connected, address, positions])

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-6 hero-gradient">
        <div className="text-3xl opacity-10">◉</div>
        <div>
          <h2 className="text-xl font-bold text-text-primary mb-2 tracking-tight">Position Graph</h2>
          <p className="text-text-secondary text-sm max-w-sm leading-relaxed">
            Connect your wallet to visualize your yield positions as an interactive flow graph.
          </p>
        </div>
        <button onClick={() => setVisible(true)} className="btn-primary">Connect Wallet</button>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 hero-gradient">
        <div className="text-3xl opacity-10">◉</div>
        <p className="text-text-muted text-sm">No positions to display yet.</p>
      </div>
    )
  }

  return (
    <div className="h-full rounded-2xl overflow-hidden border border-border-primary/60">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1f2330" gap={20} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  )
}
