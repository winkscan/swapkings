import { useEffect, useState } from 'react'
import type { BN } from '@coral-xyz/anchor'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import { getProgram } from './anchorClient'
import { readonlyWallet } from './readonlyWallet'
import { fetchFromCache } from './cacheWorker'
import { fetchAllAccountsV2 } from './gpaV2'

// Platform-wide lifetime swap volume — identical for every visitor, so this
// prefers the shared Cloudflare Worker cache (refreshed once every hour
// server-side, see ../cloudflare-worker) over querying Helius directly.
// Falls back to a direct on-chain scan if the cache is unset (local dev) or
// unreachable — same unbounded-scan call this used to make on every single
// page load before the cache existed, just now a last resort instead of the
// default path. That fallback uses getProgramAccountsV2 (1 Helius credit)
// instead of Anchor's own `.all()` (getProgramAccounts, 10 credits) — same
// result, 10x cheaper (confirmed live against Helius's own docs, 2026-08-24).
//
// No recurring poll either way: a platform-wide vanity stat doesn't need
// to update mid-visit (tightened 2026-08-21, see project memory).
export function useAllTimeVolume() {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
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
        const program = getProgram(connection, wallet ?? readonlyWallet)
        const allStats = await fetchAllAccountsV2<{ cumulativeVolumeCents: BN }>(connection, program, 'playerStats')
        const totalCents = allStats.reduce(
          (sum, s) => sum + Number(s.account.cumulativeVolumeCents.toString()),
          0,
        )
        if (!cancelled) setVolumeUsd(totalCents / 100)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [connection, wallet])

  return { volumeUsd, loading }
}
