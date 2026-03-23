export interface Position {
  id: string
  wallet: string
  protocol: string
  strategy: string
  asset: string
  amount: number
  valueUsd: number
  apy: number
  apySources: ApySource[]
  riskLevel: RiskLevel
  riskFactors: string[]
  entryTimestamp: number
  lastUpdate: number
}

export interface ApySource {
  type: 'base' | 'reward' | 'boost' | 'fee'
  label: string
  apy: number
  token?: string
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface YieldSource {
  poolId?: string
  /** DeFi Llama underlying token mints — used to match tenant stablecoin when pool symbol is generic (e.g. CASH). */
  underlyingMints?: string[]
  protocol: string
  strategy: string
  asset: string
  apy: number
  apySources: ApySource[]
  tvl: number
  riskLevel: RiskLevel
  riskFactors: string[]
  managed: boolean // protocol-managed vs direct
  audited: boolean
  stablecoin?: boolean
}

export interface StablecoinPeg {
  token: string
  symbol: string
  price: number
  deviation: number // from $1
  timestamp: number
}

export interface ProtocolHealth {
  protocol: string
  tvl: number
  tvlChange24h: number
  tvlChange7d: number
  status: 'healthy' | 'warning' | 'critical'
  lastIncident?: string
}

export interface TokenBalance {
  mint: string
  symbol: string
  name: string
  amount: number
  decimals: number
  uiAmount: number
  valueUsd: number
  logoUri?: string
}

export interface WhaleFlow {
  protocol: string
  direction: 'inflow' | 'outflow'
  amount: number
  token: string
  timestamp: number
  txSignature: string
}
