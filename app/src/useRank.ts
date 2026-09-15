import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import { fetchPlayerStats, discountBpsForScore, EMPTY_PLAYER_STATS, type PlayerStatsData } from './playerStats'

// A single-account read (getAccountInfo-equivalent), far cheaper per call
// than a getProgramAccounts scan — but still 8s meant 450 calls/hour from
// every open tab (Swap or Houses), for data that only actually changes
// right after THIS wallet's own swap/join/leave. Cut to 60s as a background
// safety net; real freshness now comes from `refresh()` being called
// directly after those actions (SwapPanel, GuildsPage) instead of waiting
// on a timer — cheaper and feels more instant than any poll interval could.
const POLL_MS = 60_000

// minVolumeUsd is the rounded, human-facing version of minScore (score is
// sqrt($), so minScore^2 ≈ minVolumeUsd) — kept as its own field rather than
// computed on the fly so this is the one place both TierInfoModal's table
// and RankCard's "progress to next tier" bar read the same round numbers
// from (previously duplicated as TierInfoModal's own separate TIER_INFO
// list, and RankCard used an unrelated fixed $1M-per-stage milestone instead
// of the wallet's actual next tier — confirmed a real point of confusion,
// 2026-08-22: the progress bar's end value didn't match the tier table right
// below it).
export const TIERS = [
  { name: 'Initiate', emoji: '🔰', minScore: 0, minVolumeUsd: 0, discountBps: 0 },
  { name: 'Adept', emoji: '⚔️', minScore: 71, minVolumeUsd: 5_000, discountBps: 1_250 },
  { name: 'Veteran', emoji: '🛡️', minScore: 224, minVolumeUsd: 50_000, discountBps: 2_500 },
  { name: 'Lord', emoji: '🏰', minScore: 708, minVolumeUsd: 500_000, discountBps: 3_750 },
  { name: 'King', emoji: '👑', minScore: 2237, minVolumeUsd: 5_000_000, discountBps: 5_000 },
]

function isqrt(n: number) {
  if (n <= 0) return 0
  return Math.floor(Math.sqrt(n))
}

// The single shared poll of this wallet's PlayerStats — RankCard reads
// tier/discount off it, GuildsPage/ReferralCard read the guild/referrer
// fields off the same `stats` object, so a wallet's state is only ever
// fetched from one place. `score` (sqrt of lifetime $ volume) stays purely
// an internal tier-lookup detail — never shown in the UI, since a bare
// number like "429" doesn't mean anything to a user on its own; the tier
// name + $ volume + discount % it maps to are what's actually displayed.
export function useRank() {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const [stats, setStats] = useState<PlayerStatsData>(EMPTY_PLAYER_STATS)
  const [loading, setLoading] = useState(true)

  const isFirstLoad = useRef(true)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    async (isRetry = false) => {
      if (!wallet) return
      // Only show the loading state on the very first fetch — background polls
      // and manual refreshes should swap in fresh data quietly, not flash "…".
      if (isFirstLoad.current) setLoading(true)
      try {
        const data = await fetchPlayerStats(connection, wallet)
        if (mounted.current) setStats(data)
      } catch (err) {
        // A refresh() call right after a join/leave (see GuildsPage.tsx) used
        // to just throw silently on any transient RPC hiccup — nothing
        // caught it, so `stats` stayed on its pre-action value until the
        // next POLL_MS tick (up to 60s) or a full page reload. Confirmed
        // live 2026-08-25: right after switching RPC calls through the new
        // proxy Worker, a join's "Your house" banner occasionally didn't
        // appear until a manual refresh — exactly this gap. One retry after
        // a short delay covers a transient blip without turning every real,
        // persistent failure into a silent retry loop.
        console.warn('useRank load failed:', err)
        if (!isRetry) {
          setTimeout(() => load(true), 1500)
        }
      } finally {
        isFirstLoad.current = false
        if (mounted.current) setLoading(false)
      }
    },
    [connection, wallet],
  )

  useEffect(() => {
    if (!wallet) return
    isFirstLoad.current = true
    load()
    const interval = setInterval(load, POLL_MS)
    return () => clearInterval(interval)
  }, [wallet, load])

  const volumeCents = stats.cumulativeVolumeCents
  const score = isqrt(volumeCents / 100) // cents -> dollars, then sqrt (matches Rust isqrt)
  const tier = [...TIERS].reverse().find((t) => score >= t.minScore) ?? TIERS[0]
  const discountBps = discountBpsForScore(score)

  return { volumeUsd: volumeCents / 100, score, tier, discountBps, stats, loading, refresh: load }
}
