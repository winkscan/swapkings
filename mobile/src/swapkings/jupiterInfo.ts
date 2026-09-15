// Off-chain token metadata + USD pricing, both from Jupiter's free "lite" tier —
// no API key needed. Used purely for display (which pool is worth the most, $
// amounts on the winners lists); never touches program logic.

export interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  icon?: string
}

export interface SearchedToken extends TokenInfo {
  mint: string
}

// Jupiter's own `icon` field often points at the token's original launchpad
// storage (arweave/irys gateways, pump.fun's pinata) — confirmed live
// (2026-09-15) that these routinely 404 transiently even for tokens Jupiter
// itself just returned as current, causing most Houses-list icons to fall
// back to the grey placeholder. DexScreener re-hosts token images on its own
// CDN keyed only by mint (no lookup call needed) and was verified reliable
// across the same failing tokens, so it's tried first; Jupiter's `icon`
// stays as a second attempt for anything DexScreener hasn't indexed yet.
export function dexscreenerIconUrl(mint: string): string {
  return `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png?size=lg`
}

export async function getTokenInfos(mints: string[]): Promise<Record<string, TokenInfo>> {
  if (mints.length === 0) return {}
  const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mints.join(',')}`)
  if (!res.ok) return {}
  const data = await res.json()
  const out: Record<string, TokenInfo> = {}
  for (const t of data) {
    out[t.id ?? t.address] = {
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      icon: t.icon,
    }
  }
  return out
}

export async function getUsdPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {}
  const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`)
  if (!res.ok) return {}
  const data = await res.json()
  const out: Record<string, number> = {}
  for (const mint of Object.keys(data)) {
    out[mint] = data[mint]?.usdPrice ?? 0
  }
  return out
}

// Same Jupiter Token API v2 "search" endpoint as getTokenInfos, but here the
// query is free-text (symbol/name), not a mint list — powers the token-picker.
export async function searchTokens(query: string): Promise<SearchedToken[]> {
  const q = query.trim()
  if (!q) return []
  const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`)
  if (!res.ok) return []
  const data = await res.json()
  return (data as any[]).slice(0, 30).map((t) => ({
    mint: t.id ?? t.address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    icon: t.icon,
  }))
}
