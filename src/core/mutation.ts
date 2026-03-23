export interface FieldDiff<T = unknown> {
  field: string
  before: T
  after: T
  changePercent?: number
}

export interface ActionDiff {
  id: string
  type: 'deposit' | 'withdraw' | 'rebalance' | 'migrate' | 'claim' | 'loop'
  protocol: string
  strategy: string
  diffs: FieldDiff[]
  estimatedFees: number
  estimatedGas: number
  riskDelta: number // positive = riskier
  apyDelta: number // positive = higher yield
  projectedAnnualChange: number // USD
  steps: TransactionStep[]
}

export interface TransactionStep {
  id: string
  label: string
  instruction: string
  status: 'pending' | 'signing' | 'confirming' | 'confirmed' | 'failed'
  txSignature?: string
  error?: string
}
