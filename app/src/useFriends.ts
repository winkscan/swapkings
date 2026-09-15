import { useEffect, useState } from 'react'
import type { PublicKey } from '@solana/web3.js'
import type { BN } from '@coral-xyz/anchor'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import { getProgram } from './anchorClient'
import { PLAYER_STATS_REFERRER_OFFSET } from './pdas'
import { fetchAllAccountsV2 } from './gpaV2'

export interface FriendRow {
  wallet: string
  earnedUsd: number
}

interface PlayerStatsAccountData {
  depositor: PublicKey
  earnedForReferrerUsdE4: BN
}

// Every PlayerStats account whose `referrer` field is this wallet, i.e.
// everyone this wallet has ever referred — filtered server-side via a memcmp
// rather than fetching every PlayerStats account that's ever existed (see
// PLAYER_STATS_REFERRER_OFFSET). Each account already carries its own
// `earned_for_referrer_cents` (bumped in record_swap.rs whenever that
// friend's swap paid this wallet a referrer share), so this is the one call
// that gets both the friend list and each friend's lifetime contribution —
// no per-friend lookup, no Helius history scan needed. Uses
// getProgramAccountsV2 (1 Helius credit) instead of Anchor's own `.all()`
// (getProgramAccounts, 10 credits) — same filter/result, 10x cheaper
// (confirmed live against Helius's own docs, 2026-08-24).
//
// No recurring poll: still a getProgramAccounts-family call (memcmp narrows
// the *response*, not how much of the account set gets scanned server-side
// to apply the filter), so this fetches once when the Friends page is
// visited and stops — a wallet's referral list doesn't need to update
// mid-visit, revisiting the page is enough (tightened 2026-08-21, see
// project memory).
export function useFriends() {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const [friends, setFriends] = useState<FriendRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!wallet) {
      setFriends([])
      setLoading(false)
      return
    }
    let cancelled = false

    async function load() {
      try {
        const program = getProgram(connection, wallet!)
        const accounts = await fetchAllAccountsV2<PlayerStatsAccountData>(connection, program, 'playerStats', [
          { memcmp: { offset: PLAYER_STATS_REFERRER_OFFSET, bytes: wallet!.publicKey.toBase58() } },
        ])
        const rows: FriendRow[] = accounts
          .map((a) => ({
            wallet: a.account.depositor.toBase58(),
            // Stored on-chain as USD x 10,000, not whole cents — see
            // PlayerStats::earned_for_referrer_usd_e4's own comment.
            earnedUsd: Number(a.account.earnedForReferrerUsdE4.toString()) / 10_000,
          }))
          .sort((a, b) => b.earnedUsd - a.earnedUsd)
        if (!cancelled) setFriends(rows)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [connection, wallet])

  const totalEarnedUsd = friends.reduce((sum, f) => sum + f.earnedUsd, 0)

  return { friends, totalEarnedUsd, loading }
}
