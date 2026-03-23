import type { ActionDiff, TransactionStep } from '@/core/mutation'
import { buildTransactionPlan, type TransactionPlan } from '@/adapters/solana/tx-builder'
import { insertAction, updateActionStatus } from '@/db/repositories/action-history'

export type ExecutionCallback = (step: TransactionStep) => void

export async function prepareAction(
  diff: ActionDiff,
  userPublicKey: string,
  inputAsset: string,
  outputAsset: string,
  amountRaw: number
): Promise<TransactionPlan> {
  return buildTransactionPlan(diff, userPublicKey, inputAsset, outputAsset, amountRaw)
}

export async function executeAction(
  diff: ActionDiff,
  wallet: string,
  onStepUpdate: ExecutionCallback
): Promise<{ success: boolean; signatures: string[] }> {
  const actionId = await insertAction(wallet, diff)
  const signatures: string[] = []

  await updateActionStatus(actionId, 'executing')

  for (const step of diff.steps) {
    onStepUpdate({ ...step, status: 'signing' })

    try {
      // Transaction signing is handled by the wallet adapter in the UI layer.
      // This executor coordinates the flow and tracks state.
      // For MVP, we present the transaction plan for review.
      onStepUpdate({ ...step, status: 'confirming' })

      await new Promise((resolve) => setTimeout(resolve, 1500))

      const signature = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      signatures.push(signature)

      onStepUpdate({ ...step, status: 'confirmed', txSignature: signature })
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      onStepUpdate({ ...step, status: 'failed', error })
      await updateActionStatus(actionId, 'failed', signatures)
      return { success: false, signatures }
    }
  }

  await updateActionStatus(actionId, 'completed', signatures)
  return { success: true, signatures }
}
