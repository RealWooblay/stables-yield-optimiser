import { useWalletStore } from '@/stores/wallet-store'
import { usePositionStore } from '@/stores/position-store'
import { useYieldStore } from '@/stores/yield-store'
import { useUIStore } from '@/stores/ui-store'
import { createLabel } from '@/core/types'
import { startPolling, stopAllPolling, POLL_INTERVALS } from './polling'
import { solanaRpc } from '@/adapters/solana/rpc'
import { heliusAdapter } from '@/adapters/solana/helius'
import { kaminoAdapter } from '@/adapters/defi/kamino'
import { marinadeAdapter } from '@/adapters/defi/marinade'
import { driftAdapter } from '@/adapters/defi/drift'
import { jitoAdapter } from '@/adapters/defi/jito'
import { defiLlamaAdapter } from '@/adapters/data/defillama'
import { stablecoinPegAdapter } from '@/adapters/data/stablecoin-peg'
import { coinGeckoAdapter } from '@/adapters/data/coingecko'
import { lookupMint } from '@/adapters/solana/token-registry'
import type { TokenMeta } from '@/adapters/solana/token-registry'
import type { DefiLlamaPool } from '@/adapters/data/defillama'
import type { YieldSource, Position, TokenBalance } from '@/core/defi'
import { upsertTokenBalance } from '@/db/repositories/token-balances'
import { upsertPosition } from '@/db/repositories/positions'
import { upsertYieldSource } from '@/db/repositories/yield-sources'
import { insertSnapshot } from '@/db/repositories/protocol-snapshots'
import { insertYieldSnapshots } from '@/db/repositories/yield-snapshots'
import { detectYieldDecay } from '@/intelligence/decay-detector'
import { computeLoopStrategies } from '@/intelligence/loop-strategies'
import { exponentAdapter } from '@/adapters/defi/exponent'
import { solsticeAdapter } from '@/adapters/defi/solstice'
import { kaminoLendAdapter, getKaminoLiveRates } from '@/adapters/defi/kamino-lend'
import { getTenantConfig, tenantYieldIndexMints, USX_EUSX_MINT, USX_STABLE_MINT } from '@/config/tenant'

const COINGECKO_IDS = ['solana', 'msol', 'jito-staked-sol', 'lido-staked-sol']

let cachedPrices: Record<string, number> = {}
let pricesCachedAt = 0
const PRICES_TTL_MS = 60_000

let adaptersReady = false

/** Avoid spamming the same peg / decay toast on every poll (60s / 5min). */
const pegToastCooldownMs = 30 * 60_000
const lastPegToastAt = new Map<string, number>()
const decayToastCooldownMs = 60 * 60_000
const lastDecayToastAt = new Map<string, number>()

const IDLE_MINTS = new Set([
  'So11111111111111111111111111111111111111112',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USX_STABLE_MINT,
])

async function ensureAdapters(): Promise<void> {
  if (adaptersReady) return
  await Promise.allSettled([
    solanaRpc.initialize(),
    heliusAdapter.initialize(),
    kaminoAdapter.initialize(),
    marinadeAdapter.initialize(),
    driftAdapter.initialize(),
    jitoAdapter.initialize(),
    defiLlamaAdapter.initialize(),
    stablecoinPegAdapter.initialize(),
    coinGeckoAdapter.initialize(),
    exponentAdapter.initialize(),
  ])
  await defiLlamaAdapter.ensureLoaded().catch(() => {})
  adaptersReady = true
}

async function refreshPrices(): Promise<void> {
  if (Date.now() - pricesCachedAt < PRICES_TTL_MS) return
  try {
    const result = await coinGeckoAdapter.getPrices(COINGECKO_IDS)
    for (const p of result.value) {
      cachedPrices[p.id] = p.price
    }
    pricesCachedAt = Date.now()
  } catch {
    // keep existing
  }
}

function getSolPrice(): number {
  return cachedPrices['solana'] ?? 150
}

function getLstPrice(symbol: string): number {
  const sol = getSolPrice()
  if (symbol === 'mSOL') return cachedPrices['msol'] ?? sol * 1.07
  if (symbol === 'JitoSOL') return cachedPrices['jito-staked-sol'] ?? sol * 1.07
  if (symbol === 'stSOL') return cachedPrices['lido-staked-sol'] ?? sol * 1.06
  return sol
}

/** Kamino eUSX (interest-bearing USX) — same mint may appear as eUSX on explorers */
const EUSX_MINT = USX_EUSX_MINT

/** DeFi Llama `project` matches our registry slug (kamino-lend, marinade-finance, …). */
function protocolMatchesSlug(protocol: string, slugs: string[]): boolean {
  const p = protocol.toLowerCase()
  return slugs.some((sl) => {
    const s = sl.toLowerCase()
    // Exact or sub-product only (e.g. kamino-lend-…). Avoid matching kamino-liquidity when slug is kamino-lend.
    return p === s || p.startsWith(`${s}-`)
  })
}

/**
 * Pick the canonical pool for a registry token: right venue + keyword match, then **highest TVL**.
 * (Taking max APY across all pools that list a mint picks random 40%+ farms — not your Kamino supply rate.)
 */
function pickYieldSourceForRegistry(sources: YieldSource[], meta: TokenMeta): YieldSource | undefined {
  const bySlug = sources.filter((s) => protocolMatchesSlug(s.protocol, meta.defiLlamaSlugs))
  if (bySlug.length === 0) return undefined
  const sym = meta.symbol.toLowerCase()
  const hay = (s: YieldSource) => `${s.strategy} ${s.asset}`.toLowerCase()
  const keywordMatch = bySlug.filter((s) => {
    const h = hay(s)
    return h.includes(sym) || (sym.includes('usx') && h.includes('usx'))
  })
  const pool = keywordMatch.length > 0 ? keywordMatch : bySlug
  return pool.reduce((a, b) => (b.tvl > a.tvl ? b : a), pool[0])
}

function filterPoolsByRegistrySlugs(pools: DefiLlamaPool[], meta: TokenMeta | undefined): DefiLlamaPool[] {
  if (!meta || pools.length === 0) return pools
  const filtered = pools.filter((p) => protocolMatchesSlug(p.project, meta.defiLlamaSlugs))
  return filtered.length > 0 ? filtered : []
}

/** Prefer the deepest pool (canonical market), not the highest APY outlier. */
function pickPoolLargestTvl(pools: DefiLlamaPool[]): DefiLlamaPool | null {
  if (pools.length === 0) return null
  return pools.reduce((a, b) => (b.tvlUsd > a.tvlUsd ? b : a), pools[0])
}

function apyFromDefiLlamaPool(pool: DefiLlamaPool): { apy: number; apySources: Position['apySources'] } {
  const effectiveApy =
    pool.apy != null && pool.apy > 0
      ? pool.apy
      : [pool.apyBase, pool.apyReward].filter((x): x is number => x != null && !Number.isNaN(x)).reduce((a, b) => a + b, 0)
  return {
    apy: effectiveApy > 0 ? effectiveApy : pool.apy ?? 0,
    apySources: [
      ...(pool.apyBase != null ? [{ type: 'base' as const, label: 'Base APY', apy: pool.apyBase }] : []),
      ...(pool.apyReward != null ? [{ type: 'reward' as const, label: 'Reward APY', apy: pool.apyReward }] : []),
    ],
  }
}

function getTokenPrice(symbol: string, mint?: string): number {
  if (mint === EUSX_MINT) return 1
  if (mint) {
    const meta = lookupMint(mint)
    if (meta) {
      const s = meta.symbol.toUpperCase()
      if (s.includes('USX') || s.includes('EUSX') || ['USDC', 'USDT', 'USDH'].includes(s)) return 1
    }
  }
  const u = symbol.toUpperCase()
  if (symbol === 'SOL') return getSolPrice()
  if (['USDC', 'USDT', 'USX', 'USDH', 'UXD', 'USDY'].includes(u)) return 1
  if (u.includes('EUSX') || u === 'KUSX' || (u.includes('USX') && u !== 'USDC')) return 1
  if (symbol.toUpperCase().includes('SOL')) return getLstPrice(symbol)
  return 0
}

/** Yield receipt / supply token for USX ecosystem — must become a position, not dropped */
function isUsxEcosystemDeployToken(balance: TokenBalance): boolean {
  if (balance.mint === EUSX_MINT) return true
  const u = (balance.symbol || '').toUpperCase()
  if (u.includes('EUSX')) return true
  return u.includes('USX') && balance.mint !== USX_STABLE_MINT
}

async function loadBalances(wallet: string): Promise<void> {
  try {
    await refreshPrices()

    let rawBalances: TokenBalance[]

    const heliusResult = await heliusAdapter.getEnhancedBalances(wallet)
    if (heliusResult.value.length > 0) {
      rawBalances = heliusResult.value
    } else {
      const rpcResult = await solanaRpc.getTokenBalances(wallet)
      rawBalances = rpcResult.value
    }

    const enriched = rawBalances.map((b) => ({
      ...b,
      valueUsd: b.valueUsd > 0 ? b.valueUsd : b.uiAmount * getTokenPrice(b.symbol, b.mint),
    }))

    const label = createLabel(enriched, 'solana-rpc', {
      confidence: 'high',
      staleDuration: 30_000,
      expiredDuration: 120_000,
    })

    useWalletStore.getState().setBalances(label)
    Promise.allSettled(enriched.map((b) => upsertTokenBalance(wallet, b))).catch(() => {})
  } catch (err) {
    console.error('[sync] loadBalances failed', err)
  }
}

async function detectPositionsFromBalances(wallet: string, balances: TokenBalance[]): Promise<Position[]> {
  const positions: Position[] = []
  let kaminoUsxFallbackCache: number | null = null

  async function getKaminoUsxLendApyFallback(): Promise<number> {
    if (kaminoUsxFallbackCache != null) return kaminoUsxFallbackCache
    try {
      const yd = await defiLlamaAdapter.getYieldSourcesByProtocol(['kamino-lend'])
      const rows = yd.value.filter(
        (s) => /usx/i.test(`${s.strategy} ${s.asset}`),
      )
      const pick =
        rows.length > 0 ? rows.reduce((a, b) => (b.tvl > a.tvl ? b : a), rows[0]) : null
      let ap = pick?.apy ?? 0
      if (ap < 0.05 && pick?.apySources?.length) {
        ap = pick.apySources.reduce((s, x) => s + x.apy, 0)
      }
      // Also try live Kamino lending API
      if (!ap || ap < 0.05) {
        const liveRates = await getKaminoLiveRates()
        if (liveRates && liveRates.usxSupplyApy > 0) ap = liveRates.usxSupplyApy
      }
      kaminoUsxFallbackCache = ap > 0.05 ? ap : null
    } catch {
      kaminoUsxFallbackCache = null
    }
    return kaminoUsxFallbackCache ?? 0
  }

  const tenant = getTenantConfig()

  for (const balance of balances) {
    if (balance.uiAmount <= 0) continue
    if (IDLE_MINTS.has(balance.mint)) continue

    // Tenant filter: only USX/eUSX line tokens — nothing else
    if (tenant) {
      const isUsxLine =
        balance.mint === EUSX_MINT ||
        balance.mint === USX_STABLE_MINT ||
        isUsxEcosystemDeployToken(balance)
      if (!isUsxLine) continue
    }

    const registryMeta = lookupMint(balance.mint)

    let protocol = registryMeta?.protocol ?? ''
    let strategy = registryMeta?.strategy ?? ''
    let apy = 0
    let apySources: Position['apySources'] = []
    let matched = false

    // Tier 0: Registry-first — same venue as the product (e.g. Kamino lend), then deepest pool by TVL.
    // Old behavior: max APY over every pool that listed the mint → 40%+ “phantom” APY vs ~2% Kamino net.
    if (registryMeta) {
      try {
        const yieldData = await defiLlamaAdapter.getYieldSourcesByProtocol(registryMeta.defiLlamaSlugs)
        const match = pickYieldSourceForRegistry(yieldData.value, registryMeta)
        if (match) {
          protocol = registryMeta.protocol
          strategy = match.strategy
          apy = match.apy
          apySources = match.apySources

          matched = true
        }
      } catch {
        // fall through
      }
    }

    // Tier 1: mint index — if registry exists, only pools from those venues; pick largest TVL (not max APY).
    if (!matched) {
      const mintPoolsRaw = await defiLlamaAdapter.getPoolsByMint(balance.mint)
      const mintPools = registryMeta
        ? filterPoolsByRegistrySlugs(mintPoolsRaw, registryMeta)
        : mintPoolsRaw
      const best = pickPoolLargestTvl(mintPools)
      if (best) {
        protocol = protocol || best.project
        strategy = strategy || best.symbol
        const ap = apyFromDefiLlamaPool(best)
        apy = ap.apy
        apySources = ap.apySources

        matched = true
      }
    }

    // Tier 2: symbol index (same rules as tier 1)
    if (!matched && balance.symbol && balance.symbol !== 'UNKNOWN' && balance.symbol.length >= 2) {
      const symbolPoolsRaw = await defiLlamaAdapter.getPoolsBySymbol(balance.symbol)
      const symbolPools = registryMeta
        ? filterPoolsByRegistrySlugs(symbolPoolsRaw, registryMeta)
        : symbolPoolsRaw
      const best = pickPoolLargestTvl(symbolPools)
      if (best) {
        protocol = protocol || best.project
        strategy = strategy || best.symbol
        const ap = apyFromDefiLlamaPool(best)
        apy = ap.apy
        apySources = ap.apySources

        matched = true
      }
    }

    // Tier 3: USX ecosystem receipts (unknown mint) — Kamino USX, deepest pool
    if (!matched && isUsxEcosystemDeployToken(balance)) {
      matched = true
      protocol = protocol || 'kamino'
      strategy = strategy || `${balance.symbol || 'eUSX'} · supply`
      try {
        const yieldData = await defiLlamaAdapter.getYieldSourcesByProtocol(['kamino-lend'])
        const rows = yieldData.value
        if (rows.length > 0) {
          const usx = rows.filter(
            (s) => s.strategy.toUpperCase().includes('USX') || s.asset.toUpperCase().includes('USX'),
          )
          const match =
            usx.length > 0
              ? usx.reduce((a, b) => (b.tvl > a.tvl ? b : a), usx[0])
              : rows.reduce((a, b) => (b.tvl > a.tvl ? b : a), rows[0])
          apy = match.apy
          apySources = match.apySources

        }
      } catch {
        // keep APY 0
      }
    }

    if (!matched && !registryMeta) continue

    const price = getTokenPrice(balance.symbol, balance.mint)
    const valueUsd = balance.valueUsd > 0 ? balance.valueUsd : balance.uiAmount * price
    if (valueUsd < 0.01 && !matched) continue

    if (matched && apy < 0.05 && valueUsd >= 0.01) {
      const isUsxLine =
        balance.mint === EUSX_MINT ||
        isUsxEcosystemDeployToken(balance) ||
        (registryMeta != null && registryMeta.symbol.toUpperCase().includes('USX'))
      if (isUsxLine) {
        const fb = await getKaminoUsxLendApyFallback()
        if (fb > apy) {
          apy = fb
          if (apySources.length === 0) {
            apySources = [{ type: 'base', label: 'Supply APY (index)', apy: fb }]
          }
        }
      }
    }

    // Display eUSX as "USX" — it's the same line (Kamino interest-bearing receipt)
    const displayAsset = registryMeta?.symbol === 'eUSX' ? 'USX' : (balance.symbol || balance.mint.slice(0, 6))
    const displayStrategy = registryMeta?.strategy || strategy || balance.symbol || 'Unknown Strategy'

    positions.push({
      id: `${protocol || 'unknown'}-${wallet.slice(0, 8)}-${balance.symbol || balance.mint.slice(0, 6)}`,
      wallet,
      protocol: protocol || 'unknown',
      strategy: displayStrategy,
      asset: displayAsset,
      amount: balance.uiAmount,
      valueUsd,
      apy,
      apySources,
      riskLevel: 'low', // positions are verified user holdings — risk is on the source, not the position
      riskFactors: ['Smart contract risk'],
      entryTimestamp: Date.now() - 30 * 86400_000,
      lastUpdate: Date.now(),
    })
  }

  return positions
}

async function loadPositions(wallet: string): Promise<void> {
  try {
    const walletState = useWalletStore.getState()
    const balances = walletState.balances?.value ?? []
    const positions = await detectPositionsFromBalances(wallet, balances)

    const label = createLabel(positions, 'on-chain', {
      confidence: 'high',
      staleDuration: 30_000,
      expiredDuration: 120_000,
    })
    usePositionStore.getState().setPositions(label)
    Promise.allSettled(positions.map((p) => upsertPosition(p))).catch(() => {})
  } catch (err) {
    console.error('[sync] loadPositions failed', err)
  }
}

async function loadYieldSources(): Promise<void> {
  try {
    const results = await Promise.allSettled([
      defiLlamaAdapter.getSolanaYields(),
      kaminoAdapter.getYieldSources(),
      kaminoLendAdapter.getYieldSources(),
      marinadeAdapter.getYieldSources(),
      driftAdapter.getYieldSources(),
      jitoAdapter.getYieldSources(),
      exponentAdapter.getYieldSources(),
      solsticeAdapter.getYieldSources(),
    ])

    const all: YieldSource[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        all.push(...result.value.value)
      }
    }

    /** Always include tenant stable + receipt mints (USX/eUSX) — top-50 Solana TVL often omits them. */
    const tenant = getTenantConfig()
    if (tenant?.stablecoinMint) {
      try {
        await defiLlamaAdapter.ensureLoaded()
        const poolIdsSeen = new Set(
          all.map((s) => s.poolId).filter((id): id is string => Boolean(id)),
        )
        for (const mint of tenantYieldIndexMints(tenant)) {
          const pools = await defiLlamaAdapter.getPoolsByMint(mint)
          for (const p of pools) {
            const ys = defiLlamaAdapter.poolToYieldSource(p)
            if (ys.poolId) {
              if (poolIdsSeen.has(ys.poolId)) continue
              poolIdsSeen.add(ys.poolId)
            }
            all.push(ys)
          }
        }
        const bySymbol = await defiLlamaAdapter.getPoolsBySymbol(tenant.stablecoin)
        for (const p of bySymbol) {
          const ys = defiLlamaAdapter.poolToYieldSource(p)
          if (ys.poolId) {
            if (poolIdsSeen.has(ys.poolId)) continue
            poolIdsSeen.add(ys.poolId)
          }
          all.push(ys)
        }
      } catch (e) {
        console.warn('[sync] tenant mint/symbol yield merge failed', e)
      }
    }

    const seen = new Map<string, YieldSource>()
    for (const source of all) {
      const key = source.poolId ?? `${source.protocol}-${source.strategy}`
      const existing = seen.get(key)
      if (!existing || (source.audited && !existing.audited)) {
        seen.set(key, source)
      }
    }

    // Add computed loop strategies — pass live rates if available
    const liveRates = await getKaminoLiveRates().catch(() => null)
    const loopscalePool = Array.from(seen.values()).find(
      (s) => s.protocol === 'loopscale' && /usx/i.test(s.asset) && s.apy > 0
    )
    const loopscaleBorrow = (loopscalePool as (YieldSource & { apyBaseBorrow?: number }) | undefined)?.apyBaseBorrow ?? 2.0

    const loops = computeLoopStrategies(Array.from(seen.values()), {
      kaminoBorrowApy: liveRates?.usxBorrowApy,
      eusxLtv: liveRates?.eusxLtv,
      loopscaleBorrowApy: loopscaleBorrow,
    })
    for (const loop of loops) {
      const key = loop.poolId ?? `${loop.protocol}-${loop.strategy}`
      if (!seen.has(key)) seen.set(key, loop)
    }

    const deduplicated = Array.from(seen.values())
      .sort((a, b) => b.apy - a.apy)

    const label = createLabel(deduplicated, 'multi-source', {
      confidence: 'medium',
      staleDuration: 300_000,
      expiredDuration: 900_000,
    })

    useYieldStore.getState().setSources(label)
    Promise.allSettled(deduplicated.map((s) => upsertYieldSource(s))).catch(() => {})

    insertYieldSnapshots(deduplicated).catch(() => {})

    const positionStore = usePositionStore.getState()
    if (positionStore.positions?.value.length) {
      detectYieldDecay(positionStore.positions.value, deduplicated)
        .then((alerts) => {
          const now = Date.now()
          for (const alert of alerts) {
            const key = `${alert.protocol}:${alert.strategy}`
            const last = lastDecayToastAt.get(key) ?? 0
            if (now - last < decayToastCooldownMs) continue
            lastDecayToastAt.set(key, now)
            useUIStore.getState().addToast({
              type: 'warning',
              title: `Yield Decay: ${alert.strategy}`,
              message: `APY dropped ${alert.decayPercent.toFixed(0)}% (${alert.previousApy.toFixed(1)}% → ${alert.currentApy.toFixed(1)}%) over ${alert.periodDays}d.${
                alert.bestAlternative
                  ? ` Consider ${alert.bestAlternative.protocol} ${alert.bestAlternative.strategy} at ${alert.bestAlternative.apy.toFixed(1)}%.`
                  : ''
              }`,
              duration: 15_000,
            })
          }
        })
        .catch(() => {})
    }

    const protocolTvls = new Map<string, number>()
    for (const source of deduplicated) {
      protocolTvls.set(source.protocol, (protocolTvls.get(source.protocol) ?? 0) + source.tvl)
    }
    for (const [protocol, tvl] of protocolTvls) {
      insertSnapshot({
        protocol,
        tvl,
        tvlChange24h: 0,
        tvlChange7d: 0,
        status: 'healthy',
      }).catch(() => {})
    }
  } catch (err) {
    console.error('[sync] loadYieldSources failed', err)
  }
}

async function loadPegs(): Promise<void> {
  try {
    const pegs = await stablecoinPegAdapter.getPegs()
    useYieldStore.getState().setPegs(pegs)

    const pegNow = Date.now()
    for (const peg of pegs.value) {
      if (peg.deviation > 0.005) {
        const last = lastPegToastAt.get(peg.symbol) ?? 0
        if (pegNow - last < pegToastCooldownMs) continue
        lastPegToastAt.set(peg.symbol, pegNow)
        useUIStore.getState().addToast({
          type: 'warning',
          title: `${peg.symbol} Depeg Alert`,
          message: `${peg.symbol} is at $${peg.price.toFixed(4)} (${(peg.deviation * 100).toFixed(2)}% off peg)`,
          duration: 10_000,
        })
      }
    }
  } catch (err) {
    console.error('[sync] loadPegs failed', err)
  }
}

export function startDataSync(wallet: string): void {
  stopAllPolling()
  adaptersReady = false

  ensureAdapters()
    .then(async () => {
      // Balances must land before positions (race caused $0 Kamino / deploy values on Helius)
      await loadBalances(wallet)
      await loadPositions(wallet)
      void loadYieldSources()
      void loadPegs()

      startPolling({
        key: 'balances',
        intervalMs: POLL_INTERVALS.balances,
        enabled: true,
        fn: () => loadBalances(wallet),
      })

      startPolling({
        key: 'positions',
        intervalMs: POLL_INTERVALS.positions,
        enabled: true,
        fn: () => loadPositions(wallet),
      })

      startPolling({
        key: 'apy',
        intervalMs: POLL_INTERVALS.apy,
        enabled: true,
        fn: loadYieldSources,
      })

      startPolling({
        key: 'pegMonitor',
        intervalMs: POLL_INTERVALS.pegMonitor,
        enabled: true,
        fn: loadPegs,
      })

      console.log(`[sync] Started for ${wallet.slice(0, 8)}...`)
    })
    .catch(console.error)
}

export function stopDataSync(): void {
  stopAllPolling()
  adaptersReady = false
  console.log('[sync] Stopped')
}
