import type { YieldSource } from '@/core/defi'

/**
 * Loop/leverage strategies for USX and eUSX.
 *
 * Two strategy types:
 *
 * Type A — USX recursive loop (Loopscale, 80% LTV):
 *   Supply USX → borrow USX → re-supply → repeat
 *   effectiveAPY = supplyAPY × leverage − borrowAPY × (leverage − 1)
 *   Kamino USX maxLtv = 0 (cannot collateralise USX on Kamino per live API)
 *
 * Type B — eUSX collateral loop (Kamino):
 *   Lock USX → receive eUSX (earns 3.3% vault yield)
 *   Deposit eUSX as Kamino collateral (LTV 0.75 per live API)
 *   Borrow USX → deploy at best rate
 *   effectiveAPY = SOLSTICE_APY + ltv × (deployedAPY − borrowAPY)
 *   Health factor = (eUSX_value × ltv) / borrowed — warn if < 1.3
 */

export interface LoopRates {
  /** Live Kamino USX borrow APY (from kamino-lend adapter). */
  kaminoBorrowApy: number
  /** Live eUSX LTV from Kamino API. */
  eusxLtv: number
  /** Live Loopscale USX borrow APY (from DeFi Llama apyBaseBorrow). */
  loopscaleBorrowApy: number
}

/** Solstice vault base yield — update when team confirms a change. */
const SOLSTICE_VAULT_APY = 3.3

function computeLoopApy(supplyApy: number, borrowApy: number, leverage: number): number {
  return supplyApy * leverage - borrowApy * (leverage - 1)
}

function healthFactor(collateralUsd: number, ltv: number, borrowedUsd: number): number {
  if (borrowedUsd <= 0) return 999
  return (collateralUsd * ltv) / borrowedUsd
}

export function computeLoopStrategies(sources: YieldSource[], rates?: Partial<LoopRates>): YieldSource[] {
  const loops: YieldSource[] = []

  // Resolve live borrow rates — fall back only if live rates unavailable
  const kaminoBorrow = rates?.kaminoBorrowApy ?? 2.5  // Kamino API live: 2.50%
  const eusxLtv = rates?.eusxLtv ?? 0.75              // Kamino API live: 0.75
  const loopscaleBorrow = rates?.loopscaleBorrowApy ?? 2.0  // DeFi Llama apyBaseBorrow fallback

  // ── Type A: Loopscale USX recursive loop ──────────────────────────────────
  const loopscaleUSX = sources.find(
    (s) => s.protocol === 'loopscale' && /usx/i.test(s.asset + s.strategy) && s.apy > 0
  )

  if (loopscaleUSX) {
    // 2x loop: 1 recursion at 80% LTV → 1.8× exposure
    const apy2x = computeLoopApy(loopscaleUSX.apy, loopscaleBorrow, 1.8)
    if (apy2x > loopscaleUSX.apy) {
      const hf2x = healthFactor(100, 0.8, 80)
      loops.push({
        poolId: `loop-2x-loopscale`,
        protocol: 'loopscale',
        strategy: 'USX 2× loop',
        asset: 'USX',
        apy: parseFloat(apy2x.toFixed(2)),
        apySources: [
          { type: 'base', label: `1.8× supply (${loopscaleUSX.apy.toFixed(2)}%)`, apy: loopscaleUSX.apy * 1.8 },
          { type: 'fee', label: `Borrow cost (${loopscaleBorrow.toFixed(2)}%)`, apy: -loopscaleBorrow * 0.8 },
        ],
        tvl: loopscaleUSX.tvl,
        riskLevel: 'medium',
        riskFactors: [
          'Smart contract risk',
          `Liquidation risk — health factor ${hf2x.toFixed(2)} at 80% LTV`,
          'Borrow rate variable',
        ],
        managed: false,
        audited: loopscaleUSX.audited,
        stablecoin: true,
      })
    }

    // 3x loop: 2 recursions at 80% LTV → 2.44× exposure
    const apy3x = computeLoopApy(loopscaleUSX.apy, loopscaleBorrow, 2.44)
    if (apy3x > loopscaleUSX.apy) {
      const hf3x = healthFactor(244, 0.8, 144)
      loops.push({
        poolId: `loop-3x-loopscale`,
        protocol: 'loopscale',
        strategy: 'USX 3× loop',
        asset: 'USX',
        apy: parseFloat(apy3x.toFixed(2)),
        apySources: [
          { type: 'base', label: `2.44× supply (${loopscaleUSX.apy.toFixed(2)}%)`, apy: loopscaleUSX.apy * 2.44 },
          { type: 'fee', label: `Borrow cost (${loopscaleBorrow.toFixed(2)}%)`, apy: -loopscaleBorrow * 1.44 },
        ],
        tvl: loopscaleUSX.tvl,
        riskLevel: 'high',
        riskFactors: [
          'Smart contract risk',
          `Liquidation risk — health factor ${hf3x.toFixed(2)} at 80% LTV`,
          'Borrow rate variable',
          'Requires active monitoring',
        ],
        managed: false,
        audited: loopscaleUSX.audited,
        stablecoin: true,
      })
    }
  }

  // ── Type B: eUSX collateral loop (Kamino) ─────────────────────────────────
  // Best USX deployment rate from all non-loop sources
  // Exclude Solstice: it's the source of eUSX, not a venue to deploy borrowed USX into
  const usxDirect = sources
    .filter((s) => /usx/i.test(s.asset) && !s.strategy.toLowerCase().includes('loop') && s.apy > 0 && s.riskLevel !== 'critical'
      && s.protocol !== 'solstice' && s.protocol !== 'solstice-usx')
    .sort((a, b) => b.apy - a.apy)

  if (usxDirect.length > 0) {
    const best = usxDirect[0]

    // Conservative eUSX loop: borrow 50% of LTV (safe, HF ≈ 1.5)
    const conservativeBorrow = eusxLtv * 0.667 // ~50% LTV
    const conservativeApy = SOLSTICE_VAULT_APY + conservativeBorrow * (best.apy - kaminoBorrow)
    const conservativeHF = healthFactor(100, eusxLtv, conservativeBorrow * 100)

    if (conservativeApy > SOLSTICE_VAULT_APY) {
      loops.push({
        poolId: `eusx-loop-conservative`,
        protocol: 'kamino',
        strategy: `eUSX leverage loop → ${best.protocol}`,
        asset: 'eUSX',
        apy: parseFloat(conservativeApy.toFixed(2)),
        apySources: [
          { type: 'base', label: `Solstice vault yield`, apy: SOLSTICE_VAULT_APY },
          { type: 'reward', label: `Deployed: ${best.strategy} (${best.apy.toFixed(2)}%)`, apy: conservativeBorrow * best.apy },
          { type: 'fee', label: `Kamino borrow (${kaminoBorrow.toFixed(2)}%)`, apy: -conservativeBorrow * kaminoBorrow },
        ],
        tvl: best.tvl,
        riskLevel: 'medium',
        riskFactors: [
          'Smart contract risk',
          `Health factor ${conservativeHF.toFixed(2)} — liquidation risk if eUSX depegs`,
          'Requires first locking USX in Solstice vault',
          `Kamino borrow rate variable (currently ${kaminoBorrow.toFixed(2)}%)`,
        ],
        managed: false,
        audited: true,
        stablecoin: true,
      })
    }

    // Aggressive eUSX loop: borrow at full LTV (HF ≈ 1.0 — only for aggressive profile)
    const aggressiveBorrow = eusxLtv * 0.95 // 95% of max LTV
    const aggressiveApy = SOLSTICE_VAULT_APY + aggressiveBorrow * (best.apy - kaminoBorrow)
    const aggressiveHF = healthFactor(100, eusxLtv, aggressiveBorrow * 100)

    if (aggressiveApy > conservativeApy) {
      loops.push({
        poolId: `eusx-loop-aggressive`,
        protocol: 'kamino',
        strategy: `eUSX max leverage loop → ${best.protocol}`,
        asset: 'eUSX',
        apy: parseFloat(aggressiveApy.toFixed(2)),
        apySources: [
          { type: 'base', label: `Solstice vault yield`, apy: SOLSTICE_VAULT_APY },
          { type: 'reward', label: `Deployed at ${best.apy.toFixed(2)}%`, apy: aggressiveBorrow * best.apy },
          { type: 'fee', label: `Kamino borrow cost`, apy: -aggressiveBorrow * kaminoBorrow },
        ],
        tvl: best.tvl,
        riskLevel: 'high',
        riskFactors: [
          'Smart contract risk',
          `Health factor ${aggressiveHF.toFixed(2)} — near liquidation threshold`,
          'Requires first locking USX in Solstice vault',
          'Active management required',
        ],
        managed: false,
        audited: true,
        stablecoin: true,
      })
    }
  }

  return loops
}
