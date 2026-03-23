import { BaseAdapter, createAdapterConfig } from '../base'
import type { AdapterConfig } from '@/core/adapter'

const JUPITER_API = 'https://quote-api.jup.ag/v6'

export interface JupiterQuote {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  priceImpactPct: string
  routePlan: Array<{
    swapInfo: {
      ammKey: string
      label: string
      inputMint: string
      outputMint: string
      inAmount: string
      outAmount: string
      feeAmount: string
      feeMint: string
    }
    percent: number
  }>
  slippageBps: number
  otherAmountThreshold: string
}

export interface JupiterSwapTransaction {
  swapTransaction: string // base64 encoded versioned transaction
  lastValidBlockHeight: number
  prioritizationFeeLamports: number
}

export class JupiterAdapter extends BaseAdapter {
  config: AdapterConfig = createAdapterConfig('jupiter', {
    read: true,
    write: true,
  }, 30_000, 12)

  async initialize(): Promise<void> {
    this.log('Jupiter adapter initialized')
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${JUPITER_API}/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=So11111111111111111111111111111111111111112&amount=1000000&slippageBps=50`)
      return response.ok
    } catch {
      return false
    }
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps = 50
  ): Promise<JupiterQuote | null> {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
      })

      const response = await fetch(`${JUPITER_API}/quote?${params}`)
      if (!response.ok) {
        this.error(`Quote failed: ${response.status}`)
        return null
      }

      return await response.json()
    } catch (err) {
      this.error('Failed to get Jupiter quote', err)
      return null
    }
  }

  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string,
    wrapUnwrapSOL = true
  ): Promise<JupiterSwapTransaction | null> {
    try {
      const response = await fetch(`${JUPITER_API}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey,
          wrapAndUnwrapSol: wrapUnwrapSOL,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      })

      if (!response.ok) {
        this.error(`Swap transaction failed: ${response.status}`)
        return null
      }

      return await response.json()
    } catch (err) {
      this.error('Failed to build swap transaction', err)
      return null
    }
  }
}

export const jupiterAdapter = new JupiterAdapter()
