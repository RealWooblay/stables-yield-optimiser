import type { TokenBalance, Position } from '@/core/defi'
import { isTenantEcosystemPosition, USX_EUSX_MINT, type TenantConfig } from '@/config/tenant'

export function TenantPortfolioStrip({
  tenant,
  balances,
  positions,
}: {
  tenant: TenantConfig | null
  balances: TokenBalance[]
  positions: Position[]
}) {
  if (!tenant?.stablecoinMint) return null

  const usxWallet = balances.find((b) => b.mint === tenant.stablecoinMint && b.uiAmount > 0)
  const eusxWallet = balances.find((b) => b.mint === USX_EUSX_MINT && b.uiAmount > 0)
  const ecosystem = positions.filter((p) => isTenantEcosystemPosition(p, tenant))

  const usxAmt = usxWallet?.uiAmount ?? 0
  const eusxAmt = eusxWallet?.uiAmount ?? 0
  const deployedUsd = ecosystem.reduce((s, p) => s + p.valueUsd, 0)
  const walletUsd = (usxWallet ? (usxWallet.valueUsd > 0 ? usxWallet.valueUsd : usxWallet.uiAmount) : 0)
  const totalUsd = walletUsd + deployedUsd

  if (totalUsd < 0.01) return null

  const blendedApy =
    totalUsd > 0
      ? ecosystem.reduce((s, p) => s + p.apy * p.valueUsd, 0) / totalUsd
      : 0

  // Build breakdown lines
  const lines: string[] = []
  if (usxAmt > 0.01) lines.push(`${usxAmt.toFixed(2)} USX in wallet`)
  if (eusxAmt > 0.01) lines.push(`${eusxAmt.toFixed(2)} eUSX in wallet`)
  for (const p of ecosystem) {
    if (p.amount > 0.01) lines.push(`${p.amount.toFixed(2)} ${p.asset} on ${p.protocol}`)
  }

  return (
    <div className="rounded-2xl border border-border-primary/40 bg-bg-secondary/15 px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-mono font-semibold tabular-nums text-text-primary">
          {(usxAmt + eusxAmt + ecosystem.reduce((s, p) => s + p.amount, 0)).toFixed(2)} {tenant.stablecoin}
        </span>
        <span className="text-text-muted font-mono text-lg">{blendedApy.toFixed(2)}%</span>
      </div>
      {lines.length > 0 && (
        <p className="text-[10px] text-text-muted/60 mt-1">{lines.join(' · ')}</p>
      )}
    </div>
  )
}
