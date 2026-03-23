import { jupiterAdapter, type JupiterQuote, type JupiterSwapTransaction } from './jupiter'
import type { ActionDiff, TransactionStep } from '@/core/mutation'

export interface TransactionPlan {
  diff: ActionDiff
  quotes: Array<{
    step: TransactionStep
    quote: JupiterQuote | null
    swapTx: JupiterSwapTransaction | null
  }>
  totalFeesLamports: number
  estimatedPriceImpact: number
  ready: boolean
}

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const MSOL_MINT = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So'
const JITOSOL_MINT = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'

const ASSET_TO_MINT: Record<string, string> = {
  'USDC': USDC_MINT,
  'SOL': SOL_MINT,
  'mSOL': MSOL_MINT,
  'JitoSOL': JITOSOL_MINT,
}

function getMint(asset: string): string {
  return ASSET_TO_MINT[asset] ?? USDC_MINT
}

export async function buildTransactionPlan(
  diff: ActionDiff,
  userPublicKey: string,
  inputAsset: string,
  outputAsset: string,
  amountRaw: number
): Promise<TransactionPlan> {
  const quotes: TransactionPlan['quotes'] = []
  let totalFeesLamports = 0
  let totalPriceImpact = 0

  for (const step of diff.steps) {
    if (step.instruction.toLowerCase().includes('swap') || diff.type === 'migrate') {
      const inputMint = getMint(inputAsset)
      const outputMint = getMint(outputAsset)

      if (inputMint !== outputMint && amountRaw > 0) {
        const quote = await jupiterAdapter.getQuote(inputMint, outputMint, amountRaw)
        let swapTx: JupiterSwapTransaction | null = null

        if (quote) {
          totalPriceImpact += parseFloat(quote.priceImpactPct)
          swapTx = await jupiterAdapter.getSwapTransaction(quote, userPublicKey)
          if (swapTx) {
            totalFeesLamports += swapTx.prioritizationFeeLamports
          }
        }

        quotes.push({ step, quote, swapTx })
      } else {
        quotes.push({ step, quote: null, swapTx: null })
      }
    } else {
      quotes.push({ step, quote: null, swapTx: null })
    }
  }

  return {
    diff,
    quotes,
    totalFeesLamports,
    estimatedPriceImpact: totalPriceImpact,
    ready: quotes.some((q) => q.swapTx !== null),
  }
}

export function formatFees(lamports: number): string {
  return `${(lamports / 1e9).toFixed(6)} SOL`
}

export function formatPriceImpact(pct: number): string {
  if (pct < 0.01) return '<0.01%'
  return `${pct.toFixed(2)}%`
}
