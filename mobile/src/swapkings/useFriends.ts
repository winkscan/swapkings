import { useEffect, useState } from 'react'
import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import { getProgram } from './anchorClient'
import { PLAYER_STATS_REFERRER_OFFSET } from './pdas'
import { fetchAllAccountsV2 } from './gpaV2'
import { decodePlayerStats, type RawPlayerStats } from './accountDecode'

export interface FriendRow {
  wallet: string
  earnedUsd: number
}

// Every PlayerStats account whose `referrer` field is this wallet, i.e.
// everyone this wallet has ever referred — same memcmp-filtered approach as
// the web app's own useFriends.ts, ported to this app's manual decode (see
// accountDecode.ts's own comment on why Anchor's coder can't be trusted here).
// One call gets both the friend list and each friend's lifetime contribution
// (earned_for_referrer_usd_e4, bumped in record_swap.rs) — no per-friend
// lookup, no history scan.
export function useFriends() {
  const { connection } = useConnection()
  const { selectedAccount } = useAuthorization()
  const owner = selectedAccount?.publicKey ?? null
  const [friends, setFriends] = useState<FriendRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!owner) {
      setFriends([])
      setLoading(false)
      return
    }
    let cancelled = false

    async function load() {
      try {
        const program = getProgram(connection, owner)
        const accounts = await fetchAllAccountsV2<RawPlayerStats>(
          connection,
          program,
          'playerStats',
          [{ memcmp: { offset: PLAYER_STATS_REFERRER_OFFSET, bytes: owner!.toBase58() } }],
          decodePlayerStats,
        )
        const rows: FriendRow[] = accounts
          .map((a) => ({
            wallet: a.account.depositor.toBase58(),
            earnedUsd: a.account.earnedForReferrerUsdE4 / 10_000,
          }))
          .sort((a, b) => b.earnedUsd - a.earnedUsd)
        if (!cancelled) setFriends(rows)
      } catch (err) {
        console.warn('useFriends load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [connection, owner])

  const totalEarnedUsd = friends.reduce((sum, f) => sum + f.earnedUsd, 0)

  return { friends, totalEarnedUsd, loading }
}
