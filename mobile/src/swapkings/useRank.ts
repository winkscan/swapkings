import { useCallback, useEffect, useRef, useState } from 'react'
import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import {
  fetchPlayerStats,
  discountBpsForScore,
  EMPTY_PLAYER_STATS,
  type PlayerStatsData,
} from './playerStats'

// Background safety-net poll only — real freshness comes from refresh() being
// called right after this wallet's own swap/join/leave.
const POLL_MS = 60_000

// minVolumeUsd ≈ minScore² (score is sqrt of lifetime $). One source of truth
// for both the tier table and the "progress to next tier" bar.
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

// The single shared read of this wallet's PlayerStats — RankScreen reads
// tier/discount, HousesScreen / ReferralScreen read the guild/referrer
// fields off the same `stats` object.
export function useRank() {
  const { connection } = useConnection()
  const { selectedAccount } = useAuthorization()
  const owner = selectedAccount?.publicKey ?? null
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
      if (!owner) return
      if (isFirstLoad.current) setLoading(true)
      try {
        const data = await fetchPlayerStats(connection, owner)
        if (mounted.current) setStats(data)
      } catch (err) {
        // One retry after a short delay covers a transient RPC blip on a
        // post-action refresh without turning every real failure into a
        // silent retry loop (same pattern as the web app).
        console.warn('useRank load failed:', err)
        if (!isRetry) {
          setTimeout(() => load(true), 1500)
        }
      } finally {
        isFirstLoad.current = false
        if (mounted.current) setLoading(false)
      }
    },
    [connection, owner],
  )

  useEffect(() => {
    if (!owner) {
      setStats(EMPTY_PLAYER_STATS)
      setLoading(false)
      return
    }
    isFirstLoad.current = true
    load()
    const interval = setInterval(load, POLL_MS)
    return () => clearInterval(interval)
  }, [owner, load])

  const volumeCents = stats.cumulativeVolumeCents
  const score = isqrt(volumeCents / 100)
  const tier = [...TIERS].reverse().find((t) => score >= t.minScore) ?? TIERS[0]
  const nextTier = TIERS.find((t) => t.minScore > score) ?? null
  const discountBps = discountBpsForScore(score)

  return {
    volumeUsd: volumeCents / 100,
    score,
    tier,
    nextTier,
    discountBps,
    stats,
    loading,
    refresh: load,
  }
}
