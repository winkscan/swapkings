// Fair-launch token lookup — resolves a mint to its original creator wallet
// (the "founder" a Guild routes 90% of its fee to) and current market cap,
// gating the Join button on both "is this actually from a qualifying
// launchpad" and the market-cap floor.
//
// Goes through Jupiter's own Token API v2 (the same `lite-api.jup.ag/tokens/
// v2/search` endpoint jupiterInfo.ts already uses for symbol/price/icon)
// rather than pump.fun's own private frontend API directly — verified live
// that pump.fun's frontend-api-v3.pump.fun endpoint enforces a same-origin
// check (Access-Control-Allow-Origin: https://pump.fun only, 403s any other
// Origin), so a real browser call from our own site would always fail.
// Jupiter already indexes each qualifying launch's creator wallet as its own
// `dev` field (confirmed identical to pump.fun's own `creator` field on a
// real token) plus a `launchpad` tag — and, unlike pump.fun's API, is already
// proven to work from the browser in this codebase.
export interface PumpFunTokenInfo {
  mint: string
  creator: string
  marketCapUsd: number
  symbol: string
  name: string
}

// Below this, a token's community is small enough that a Guild for it isn't
// meaningfully different from just routing fees to one person's wallet —
// matches the "at least a real community" bar discussed for what qualifies.
// Set low enough to still welcome young/small community tokens, not just
// already-established ones (lowered from $1M, 2026-08-24 — Alexey wanted
// room for younger communities, not only the big established tokens the
// discovery list already surfaces on its own).
export const GUILD_MARKET_CAP_FLOOR_USD = 100_000

// Only launchpads with the same "anyone can fair-launch, creator earns an
// ongoing share" bonding-curve model as pump.fun qualify — checked live
// against Jupiter's data (2026-08-21): bags.fm isn't tagged by Jupiter's
// `launchpad` field at all, so it can't be identified this way regardless.
//
// met-dbc (Meteora's Dynamic Bonding Curve), jup-studio (Jupiter's own
// launchpad), and moonshot added 2026-08-24 after real due diligence, not
// just going by name — confirmed each has a genuine, permissionless,
// per-token creator with an ongoing economic stake (Meteora DBC:
// `creator_trading_fee_percentage` pre-migration + locked/claimable LP
// post-migration, per docs.meteora.ag; Jup Studio: creators "claim
// accumulated fees by connecting the deployer wallet used to launch the
// token", per docs.jup.ag; Moonshot: fair-launch, creator gets a 20% supply
// allocation). Also checked empirically across ~7 different Jupiter
// discovery windows: every met-dbc/jup-studio/moonshot token sampled had a
// DISTINCT `dev` wallet — no shared/reused address across different tokens.
//
// metadao (DAO/futarchy-based launches) stays deliberately excluded — same
// live check caught its `dev` field reusing the exact same wallet across
// multiple unrelated tokens (a shared platform/factory address, not a real
// per-token founder), confirming the original suspicion. Routing 90% of a
// swapper's fee to the wrong kind of address is exactly the failure mode
// worth staying conservative about.
//
// stonkfun added 2026-09-25 after the same check: Jupiter tags it
// `launchpad: "stonkfun"` (201 tokens seen across discovery windows), each
// token has its own `dev` creator wallet (a handful of wallets launch 2-6
// tokens each — normal repeat launchers, plus the platform team's own wallet
// for STONK itself and a few official tokens; no single shared factory
// address across unrelated tokens like metadao), and the creator earns an
// ongoing share of every trade (0.5% or 1% of the pool fee, paid to their
// wallet) — a real, permissionless, per-token economic stake.
const QUALIFYING_LAUNCHPADS = new Set(['pump.fun', 'letsbonk.fun', 'met-dbc', 'jup-studio', 'moonshot', 'stonkfun'])

interface JupiterTokenSearchResult {
  id?: string
  address?: string
  name?: string
  symbol?: string
  dev?: string
  launchpad?: string
  mcap?: number
  fdv?: number
}

// The market-cap floor is enforced here, once, so every caller — the
// discovery list AND the manual "Don't see your token?" add-by-mint form —
// gets the same guard automatically. Previously only the discovery list
// checked it; a manually-pasted mint could add a dust-cap (or freshly
// launched, possibly-scam) pump.fun token as a joinable house with no floor
// at all, found and fixed 2026-08-24.
function toPumpFunInfo(t: JupiterTokenSearchResult): PumpFunTokenInfo | null {
  const mint = t.id ?? t.address
  if (!mint || !t.launchpad || !QUALIFYING_LAUNCHPADS.has(t.launchpad) || !t.dev) return null
  const marketCapUsd = Number(t.mcap ?? t.fdv ?? 0)
  if (marketCapUsd < GUILD_MARKET_CAP_FLOOR_USD) return null
  return {
    mint,
    creator: t.dev,
    marketCapUsd,
    symbol: t.symbol ?? '',
    name: t.name ?? '',
  }
}

export async function getPumpFunTokenInfo(mint: string): Promise<PumpFunTokenInfo | null> {
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`)
    if (!res.ok) return null
    const data: JupiterTokenSearchResult[] = await res.json()
    const token = data.find((t) => (t.id ?? t.address) === mint)
    if (!token) return null
    // Only QUALIFYING_LAUNCHPADS tokens qualify as guilds — `dev` is
    // Jupiter's name for the same wallet pump.fun itself calls `creator`.
    return toPumpFunInfo(token)
  } catch {
    return null
  }
}

export interface TokenMarketInfo {
  symbol: string
  marketCapUsd: number
}

// Display-only lookup for a house's CURRENT symbol/market cap — deliberately
// no launchpad/floor gating (unlike toPumpFunInfo/getPumpFunTokenInfo),
// since this is only ever called for a house that's already real on-chain
// (it passed that gate once, at join time) — a price dip since then, or the
// token simply not being in Jupiter's own top-100-per-ranking-window
// discovery lists any more, shouldn't make its market cap silently vanish
// from the Houses table. That's exactly the gap this fills: the discovery
// list only covers whatever's currently trending in one of Jupiter's
// ranking windows, so any house that was manually added, or fell out of
// those windows, gets marketCapUsd: undefined from discovery alone. Batches
// every mint needing this into one search call (comma-joined, same as
// getTokenInfos already does) rather than one request per house.
export async function getTokenMarketInfos(mints: string[]): Promise<Record<string, TokenMarketInfo>> {
  if (mints.length === 0) return {}
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mints.join(',')}`)
    if (!res.ok) return {}
    const data: JupiterTokenSearchResult[] = await res.json()
    const out: Record<string, TokenMarketInfo> = {}
    for (const t of data) {
      const mint = t.id ?? t.address
      if (!mint) continue
      out[mint] = { symbol: t.symbol ?? '', marketCapUsd: Number(t.mcap ?? t.fdv ?? 0) }
    }
    return out
  } catch {
    return {}
  }
}

// Candidate pump.fun tokens for the Guilds page's browse list. Each of these
// Jupiter ranking endpoints caps at 100 results server-side regardless of the
// requested limit, and any single one (e.g. just 24h organic score) only
// covers ~45 pump.fun tokens above the market-cap floor — a real but narrow,
// activity-biased slice, nowhere near pump.fun's own few-hundred-token
// count at this cap. Querying several different ranking windows in parallel
// and de-duping by mint (verified empirically: ~140 unique pump.fun tokens
// this way, vs ~45 from one window alone) gets meaningfully closer without
// needing pump.fun's own listing endpoint, which — like its single-coin
// endpoint — is Origin-locked to pump.fun's own site (see the module comment
// above) and would need a backend proxy to call at all. Still not
// exhaustive: a real full list would need either that proxy or pump.fun's
// blocked API server-side.
// Widened from 7 to 11 windows, 2026-08-27: a one-off manual audit (asked
// to compile every real pump.fun token >= $100k mcap) queried these same 7
// plus 4 more (organicscore/5m, trending/6h, traded/6h, traded/1h) and
// found several real, qualifying tokens that only showed up via those 4 —
// i.e. real houses this list was silently missing. Same one-call-per-window
// cost shape as before, just more of them.
const DISCOVERY_ENDPOINTS = [
  'https://lite-api.jup.ag/tokens/v2/toporganicscore/24h?limit=100',
  'https://lite-api.jup.ag/tokens/v2/toporganicscore/6h?limit=100',
  'https://lite-api.jup.ag/tokens/v2/toporganicscore/1h?limit=100',
  'https://lite-api.jup.ag/tokens/v2/toporganicscore/5m?limit=100',
  'https://lite-api.jup.ag/tokens/v2/toptrending/24h?limit=100',
  'https://lite-api.jup.ag/tokens/v2/toptrending/6h?limit=100',
  'https://lite-api.jup.ag/tokens/v2/toptrending/1h?limit=100',
  'https://lite-api.jup.ag/tokens/v2/toptraded/24h?limit=100',
  'https://lite-api.jup.ag/tokens/v2/toptraded/6h?limit=100',
  'https://lite-api.jup.ag/tokens/v2/toptraded/1h?limit=100',
  'https://lite-api.jup.ag/tokens/v2/recent?limit=100',
]

export async function getPumpFunCandidates(): Promise<PumpFunTokenInfo[]> {
  const results = await Promise.all(
    DISCOVERY_ENDPOINTS.map(async (url) => {
      try {
        const res = await fetch(url)
        if (!res.ok) return []
        return (await res.json()) as JupiterTokenSearchResult[]
      } catch {
        return []
      }
    }),
  )

  const byMint = new Map<string, PumpFunTokenInfo>()
  for (const token of results.flat()) {
    const info = toPumpFunInfo(token)
    if (info && !byMint.has(info.mint)) {
      byMint.set(info.mint, info)
    }
  }

  return [...byMint.values()].sort((a, b) => b.marketCapUsd - a.marketCapUsd)
}
