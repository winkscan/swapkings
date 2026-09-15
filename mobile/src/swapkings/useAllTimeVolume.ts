import { useEffect, useState } from 'react'
import { useConnection } from '../utils/ConnectionProvider'
import { getProgram } from './anchorClient'
import { fetchFromCache } from './cacheWorker'
import { fetchAllAccountsV2 } from './gpaV2'
import { decodePlayerStats, type RawPlayerStats } from './accountDecode'

// Platform-wide lifetime swap volume — identical for every visitor, so prefer
// the shared Cloudflare Worker cache (refreshed hourly server-side). Falls
// back to a direct getProgramAccountsV2 scan (1 Helius credit) only if the
// cache is unreachable. No recurring poll — a platform-wide vanity stat
// doesn't need to update mid-visit.
export function useAllTimeVolume() {
  const { connection } = useConnection()
  const [volumeUsd, setVolumeUsd] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const cached = await fetchFromCache<{ volumeUsd: number }>('/all-time-volume')
        if (cached) {
          if (!cancelled) setVolumeUsd(cached.volumeUsd)
          return
        }
        const program = getProgram(connection)
        // Manual decode (decodePlayerStats), not Anchor's coder — see
        // accountDecode.ts's own comment for why (a real Hermes-only crash,
        // confirmed live 2026-09-11).
        const allStats = await fetchAllAccountsV2<RawPlayerStats>(
          connection,
          program,
          'playerStats',
          [],
          decodePlayerStats,
        )
        const totalCents = allStats.reduce((sum, s) => sum + s.account.cumulativeVolumeCents, 0)
        if (!cancelled) setVolumeUsd(totalCents / 100)
      } catch (err) {
        console.warn('useAllTimeVolume load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [connection])

  return { volumeUsd, loading }
}
