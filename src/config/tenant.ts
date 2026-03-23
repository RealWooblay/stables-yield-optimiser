import type { Position, RiskLevel, YieldSource } from '@/core/defi'

/** Spot USX + Kamino eUSX receipt — both must resolve to USX-line pools from DeFi Llama. */
export const USX_STABLE_MINT = '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG'
export const USX_EUSX_MINT = '3ThdFZQKM6kRyVGLG48kaPg5TRMhYMKY1iCRa9xop1WC'

export interface TenantConfig {
  stablecoin: string
  stablecoinMint: string
  brandName: string
  brandColor: string
  preferredProtocols: string[]
  riskCeiling: RiskLevel
  /**
   * DeFi Llama `project` ids allowed for “next action” (must still pass {@link isTenantYieldSource} for USX/eUSX).
   * Covers Kamino lend/liquidity, Orca pools, Exponent, Solstice issuer vault, etc.
   */
  actionProjectAllowlist?: string[]
}

export interface EcosystemOption {
  id: string
  label: string
  description: string
  live: boolean
}

/** Ecosystems available for selection in the yield optimizer UI. */
export const ECOSYSTEM_OPTIONS: EcosystemOption[] = [
  { id: 'usx', label: 'Solstice', description: 'USX · eUSX', live: true },
  // Add more here as they come online — e.g. { id: 'usdc', label: 'USDC', description: 'USDC', live: false }
]

const TENANT_PRESETS: Record<string, TenantConfig> = {
  usx: {
    stablecoin: 'USX',
    stablecoinMint: USX_STABLE_MINT,
    brandName: 'USX Yield',
    brandColor: '#3b82f6',
    preferredProtocols: [
      'kamino',
      'kamino-lend',
      'kamino-liquidity',
      'orca',
      'orca-dex',
      'raydium-amm',
      'loopscale',
      'exponent',
      'solstice-usx',
      'solstice',
    ],
    riskCeiling: 'medium',
    /** USX/eUSX venues — matches DeFi Llama `project` field exactly. */
    actionProjectAllowlist: [
      'kamino',
      'kamino-lend',
      'kamino-liquidity',
      'orca',
      'orca-dex',
      'raydium-amm',
      'loopscale',
      'exponent',
      'solstice-usx',
      'solstice',
    ],
  },
  usdc: {
    stablecoin: 'USDC',
    stablecoinMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    brandName: 'USDC Yield',
    brandColor: '#2775ca',
    preferredProtocols: ['kamino', 'kamino-lend', 'drift', 'marginfi', 'solend'],
    riskCeiling: 'medium',
  },
}

const tenantId = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TENANT) || 'usx'
let activeTenant: TenantConfig | null = TENANT_PRESETS[tenantId] ?? TENANT_PRESETS.usx!

export function setTenantConfig(config: TenantConfig | null): void {
  activeTenant = config
}

export function setTenantByPreset(presetId: string): void {
  activeTenant = TENANT_PRESETS[presetId] ?? null
}

export function getEcosystemConfig(id: string): TenantConfig | null {
  return TENANT_PRESETS[id] ?? null
}

export function getTenantConfig(): TenantConfig | null {
  return activeTenant
}

/** Mints to query in DeFi Llama so USX/eUSX pools are always in the merged yield set (not only “top TVL” rows). */
export function tenantYieldIndexMints(tenant: TenantConfig): string[] {
  const t = tenant.stablecoin.toUpperCase().replace(/\s/g, '')
  if (t === 'USX') return [tenant.stablecoinMint, USX_EUSX_MINT]
  return [tenant.stablecoinMint]
}

function underlyingMatchesTenantMint(
  s: Pick<YieldSource, 'underlyingMints'>,
  tenant: TenantConfig,
): boolean {
  const hints = tenantYieldIndexMints(tenant)
  const um = s.underlyingMints
  if (!um?.length) return false
  const set = new Set(um.map((m) => m.toLowerCase()))
  return hints.some((h) => set.has(h.toLowerCase()))
}

/**
 * Positions whose asset belongs to the tenant stablecoin line, not mSOL/JLP/etc.
 * For USX: **eUSX is USX-related** — interest-bearing / supply receipt (e.g. Kamino lend), same ecosystem as spot USX.
 */
export function isTenantEcosystemPosition(p: Position, tenant: TenantConfig): boolean {
  const t = tenant.stablecoin.toUpperCase().replace(/\s/g, '')
  const a = (p.asset || '').toUpperCase()
  if (a === t) return true
  if (t === 'USX') {
    // eUSX matches via includes('USX'); EUSX / kUSX aliases included explicitly
    return a.includes('USX') || a.includes('EUSX') || a === 'KUSX'
  }
  return a.includes(t)
}

/**
 * Yield pools that stay in the tenant stablecoin line (USX/eUSX venues, etc.).
 * Used so we never suggest USDC/USDT products for a USX-only product.
 */
export function isTenantYieldSource(
  s: Pick<YieldSource, 'asset' | 'strategy' | 'protocol'> & { underlyingMints?: string[] },
  tenant: TenantConfig,
): boolean {
  const t = tenant.stablecoin.toUpperCase().replace(/\s/g, '')
  if (underlyingMatchesTenantMint(s, tenant)) return true
  const hay = `${s.asset} ${s.strategy} ${s.protocol}`
  const hayUp = hay.toUpperCase()
  if (t === 'USX') {
    return /\bUSX\b|\bEUSX\b|\bKUSX\b/i.test(hay)
  }
  return hayUp.includes(t)
}

/** Yield rows for “what to do next” — tenant line + optional project allowlist (Kamino USX only, etc.). */
export function filterYieldSourcesForTenantActions(sources: YieldSource[], tenant: TenantConfig): YieldSource[] {
  const line = sources.filter((s) => isTenantYieldSource(s, tenant))
  const allow = tenant.actionProjectAllowlist
  if (!allow?.length) return line

  const allowSet = new Set(allow.map((p) => p.toLowerCase()))
  const strict = line.filter((s) => allowSet.has(s.protocol.toLowerCase()))
  if (strict.length > 0) return strict
  if (line.length > 0) return line

  // Last resort: allowlisted protocols whose pool text clearly references USX line (Llama sometimes omits mints / uses odd symbols).
  const t = tenant.stablecoin.toUpperCase().replace(/\s/g, '')
  if (t === 'USX') {
    const loose = sources.filter((s) => {
      if (!allowSet.has(s.protocol.toLowerCase())) return false
      const h = `${s.asset} ${s.strategy} ${s.protocol}`
      return /\bUSX\b|\bEUSX\b|\bKUSX\b|USX|EUSX|KUSX/i.test(h)
    })
    if (loose.length > 0) return loose
  }

  return line
}

export function filterSourcesForTenant<T extends { protocol: string; asset: string; riskLevel: string; stablecoin?: boolean }>(
  sources: T[],
  tenant: TenantConfig
): T[] {
  const riskOrder: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 }
  const ceiling = riskOrder[tenant.riskCeiling] ?? 2
  const preferredSet = new Set(tenant.preferredProtocols.map(p => p.toLowerCase()))

  return sources.filter((s) => {
    const riskVal = riskOrder[s.riskLevel] ?? 3
    if (riskVal > ceiling) return false
    if (preferredSet.size > 0 && !preferredSet.has(s.protocol.toLowerCase())) return false
    return true
  })
}
