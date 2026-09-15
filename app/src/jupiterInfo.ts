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
