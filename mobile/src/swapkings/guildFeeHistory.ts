import { useEffect, useState } from 'react'
import { fetchFromCache } from './cacheWorker'

export interface GuildFeeRow {
  signature: string
  blockTime: number
  mint: string
  founderWallet: string
  tokenAmountUi: number
  usdAmount: number
}

// Cache-only on mobile — the web app's own version of this hook (see
// app/src/useGuildFeeHistory.ts) falls back to calling Helius's Enhanced
// Transaction History API directly, deriving the API key from its own RPC
// endpoint's query string (VITE_RPC_ENDPOINT already embeds it there, an
// accepted tradeoff on web). Mobile's RPC_ENDPOINT is the cache Worker's own
// /rpc proxy, which deliberately never exposes the real Helius key to any
// client (see jupiter.ts's own comment on why the key moved server-side in
// the first place) — so there's no key to derive here, and that's correct,
// not a missing feature. The cache path alone (`/guild-fees`, refreshed
// every 2 minutes, Cloudflare-backed) is reliable enough on its own.
export function useGuildFeeHistory(founderWalletsSize: number) {
  const [rows, setRows] = useState<GuildFeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (founderWalletsSize === 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const cached = await fetchFromCache<{ updatedAt: number; rows: GuildFeeRow[] }>('/guild-fees')
        if (!cancelled) setRows(cached?.rows ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [founderWalletsSize])

  return { rows, loading, error }
}
