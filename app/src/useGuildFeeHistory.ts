import { useEffect, useState } from 'react'
import { fetchGuildFeeTransactions, type GuildFeeTx } from './heliusHistory'
import { getUsdPrices } from './jupiterInfo'
import { fetchFromCache } from './cacheWorker'

export interface GuildFeeRow extends GuildFeeTx {
  // Live-price estimate (current price x raw token amount) — same
  // approximation style already used for on-chain usd_cents elsewhere in
  // this app (swapExecutor.ts), not a historical price at the time of that
  // specific transaction.
  usdAmount: number
}

// Every real direct call here costs money — Helius's metered Enhanced
// Transaction History API, likely their most heavily-weighted endpoint —
// so this prefers the shared Cloudflare Worker cache (see
// ../cloudflare-worker, refreshed once every 2 minutes server-side) over
// calling Helius directly. Falls back to a direct call only if the cache is
// unset (local dev) or unreachable. A manual "Refresh" click was the first
// version of this; Alexey flagged it as an open abuse vector (a script
// could just hammer the button). Fixed over several passes, 2026-08-21 (see
// project memory): removed the user-triggerable refetch, then the
// background poll entirely, then finally moved the whole thing behind the
// shared cache — a historical fee log doesn't need per-visitor Helius
// traffic at all, one server-side fetch every 2 minutes covers every
// visitor at once.
export function useGuildFeeHistory(founderWallets: Set<string>) {
  const [rows, setRows] = useState<GuildFeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  useEffect(() => {
    if (founderWallets.size === 0) {
      setLoading(false)
      return
    }
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const cached = await fetchFromCache<{ updatedAt: number; rows: GuildFeeRow[] }>('/guild-fees')
        if (cached) {
          if (!cancelled) {
            setRows(cached.rows)
            setLastUpdated(cached.updatedAt)
          }
          return
        }

        const newRows = await fetchGuildFeeTransactions(founderWallets)
        const mints = [...new Set(newRows.map((r) => r.mint))]
        const prices = await getUsdPrices(mints)
        if (cancelled) return
        setRows(newRows.map((r) => ({ ...r, usdAmount: (prices[r.mint] ?? 0) * r.tokenAmountUi })))
        setLastUpdated(Date.now())
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
    // founderWallets is a fresh Set each render (see GuildsPage's useMemo) —
    // keyed on its size rather than identity, so this only re-fetches when
    // the underlying guild list actually changes membership count, not on
    // every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [founderWallets.size])

  return { rows, loading, error, lastUpdated }
}
