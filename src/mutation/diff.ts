import type { ActionDiff } from '@/core/mutation'
import type { Position, YieldSource } from '@/core/defi'

/** Build a deposit action for idle capital → yield source. */
export function buildDepositAction(
  amount: number,
  asset: string,
  target: YieldSource,
): ActionDiff {
  return {
    id: `deposit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'deposit',
    protocol: target.protocol,
    strategy: target.strategy,
    diffs: [
      { field: 'amount', before: 0, after: amount },
      { field: 'apy', before: 0, after: target.apy, changePercent: 100 },
    ],
    estimatedFees: 0.001,
    estimatedGas: 200_000,
    riskDelta: target.riskLevel === 'high' ? 2 : target.riskLevel === 'medium' ? 1 : 0,
    apyDelta: target.apy,
    projectedAnnualChange: (amount * target.apy) / 100,
    steps: [{
      id: `deposit-${target.protocol}`,
      label: `Deposit ${asset} into ${target.protocol}`,
      instruction: `Deposit ~$${amount.toFixed(0)} ${asset} into ${target.strategy} on ${target.protocol}`,
      status: 'pending',
    }],
  }
}

/** Build a migrate action for moving between yield venues. */
export function buildMigrateAction(
  current: Position,
  target: YieldSource,
  amount: number,
): ActionDiff {
  const apyDelta = target.apy - current.apy
  const riskMap = { low: 1, medium: 2, high: 3, critical: 4 }

  return {
    id: `migrate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'migrate',
    protocol: target.protocol,
    strategy: target.strategy,
    diffs: [
      { field: 'protocol', before: current.protocol, after: target.protocol },
      { field: 'strategy', before: current.strategy, after: target.strategy },
      { field: 'apy', before: current.apy, after: target.apy, changePercent: current.apy > 0 ? (apyDelta / current.apy) * 100 : 100 },
    ],
    estimatedFees: 0.002,
    estimatedGas: 400_000,
    riskDelta: riskMap[target.riskLevel] - riskMap[current.riskLevel],
    apyDelta,
    projectedAnnualChange: (amount * apyDelta) / 100,
    steps: [
      {
        id: 'withdraw',
        label: `Withdraw from ${current.protocol}`,
        instruction: `Withdraw ~$${amount.toFixed(0)} ${current.asset} from ${current.strategy}`,
        status: 'pending',
      },
      {
        id: 'deposit',
        label: `Deposit into ${target.protocol}`,
        instruction: `Deposit into ${target.strategy} on ${target.protocol}`,
        status: 'pending',
      },
    ],
  }
}

/** Build a loop action (supply → borrow → re-supply). */
export function buildLoopAction(
  amount: number,
  asset: string,
  target: YieldSource,
): ActionDiff {
  const leverage = target.strategy.includes('3x') ? 3 : 2

  return {
    id: `loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'loop',
    protocol: target.protocol,
    strategy: target.strategy,
    diffs: [
      { field: 'amount', before: 0, after: amount },
      { field: 'apy', before: 0, after: target.apy, changePercent: 100 },
      { field: 'leverage', before: 1, after: leverage },
    ],
    estimatedFees: 0.003,
    estimatedGas: 600_000,
    riskDelta: leverage >= 3 ? 3 : 2,
    apyDelta: target.apy,
    projectedAnnualChange: (amount * target.apy) / 100,
    steps: [
      { id: 'supply', label: `Supply ${asset}`, instruction: `Supply ~$${amount.toFixed(0)} ${asset} to ${target.protocol}`, status: 'pending' },
      { id: 'borrow', label: `Borrow ${asset}`, instruction: `Borrow ${asset} against collateral (${leverage}x leverage)`, status: 'pending' },
      { id: 'resupply', label: `Re-supply ${asset}`, instruction: `Re-deposit borrowed ${asset} to compound yield`, status: 'pending' },
    ],
  }
}

/**
 * Build an eUSX collateral loop action.
 * If usxToConvert > 0, prepends a "convert USX → eUSX" step.
 */
export function buildEusxLoopAction(
  eusxAmount: number,
  target: YieldSource,
  usxToConvert = 0,
): ActionDiff {
  const deployVenue = target.strategy.replace(/eUSX (leverage|max leverage) loop → /i, '') || target.protocol
  const convertStep = usxToConvert > 0 ? [{
    id: 'convert-usx',
    label: `Convert ~$${usxToConvert.toFixed(0)} USX → eUSX`,
    instruction: `Go to app.solstice.finance → swap ~$${usxToConvert.toFixed(0)} USX for eUSX so you have enough eUSX to deposit as collateral`,
    status: 'pending' as const,
  }] : []

  return {
    id: `eusx-loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'loop',
    protocol: target.protocol,
    strategy: target.strategy,
    diffs: [
      { field: 'amount', before: 0, after: eusxAmount },
      { field: 'apy', before: 0, after: target.apy, changePercent: 100 },
    ],
    estimatedFees: 0.004,
    estimatedGas: 800_000,
    riskDelta: target.riskLevel === 'high' ? 3 : 2,
    apyDelta: target.apy,
    projectedAnnualChange: (eusxAmount * target.apy) / 100,
    steps: [
      ...convertStep,
      { id: 'deposit-eusx', label: 'Deposit eUSX on Kamino as collateral', instruction: `Deposit ~$${eusxAmount.toFixed(0)} eUSX as collateral on app.kamino.finance — eUSX continues earning its base yield while deposited`, status: 'pending' },
      { id: 'borrow-usx', label: 'Borrow USX against your eUSX', instruction: 'Borrow USX from Kamino — keep borrow below 75% LTV to avoid liquidation', status: 'pending' },
      { id: 'deploy-usx', label: `Deposit borrowed USX on ${deployVenue}`, instruction: `Deposit the borrowed USX into ${deployVenue} to stack additional yield on top of your eUSX base rate`, status: 'pending' },
    ],
  }
}

/** @deprecated Use buildDepositAction / buildMigrateAction / buildLoopAction instead. */
export function computePositionDiff(
  current: Position,
  target: YieldSource,
  amount: number
): ActionDiff {
  // Route to the correct builder
  if (current.protocol === 'wallet' || current.apy === 0) {
    // eUSX collateral loop: distinct multi-step flow
    if ((target.poolId ?? '').startsWith('eusx-loop') || /eusx.*loop/i.test(target.strategy)) {
      return buildEusxLoopAction(amount, target)
    }
    // USX recursive loop
    if (target.strategy.toLowerCase().includes('loop')) {
      return buildLoopAction(amount, current.asset, target)
    }
    return buildDepositAction(amount, current.asset, target)
  }
  return buildMigrateAction(current, target, amount)
}
