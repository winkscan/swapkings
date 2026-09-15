import { useWallet } from '@solana/wallet-adapter-react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons'
import { NavBar } from '../components/NavBar'
import { ReferralCard } from '../components/ReferralCard'
import { FriendsSummaryCard, FriendsTableCard } from '../components/FriendsList'
import { Footer } from '../components/Footer'
import { useFriends } from '../useFriends'
import { useRank } from '../useRank'
import { ZERO_PUBKEY } from '../pdas'

// Home for referral/social features. Order (per Alexey's request 2026-08-24):
// summary stats (white card) → the invite-link card → the detail table of
// every wallet referred so far. NavBar only links here once a wallet is
// connected, but the route itself stays directly reachable regardless
// (shared link, back/forward, a wallet disconnecting mid-visit) —
// ReferralCard shows its own Connect-wallet prompt in that case, and the
// summary/table are simply omitted rather than showing an all-zero stat and
// an empty table underneath it.
export function FriendsPage() {
  const { connected } = useWallet()
  const { friends, totalEarnedUsd, loading } = useFriends()
  const rank = useRank()
  const hasReferrer = !rank.stats.referrer.equals(ZERO_PUBKEY)

  return (
    <div className="app" style={{ maxWidth: 640, margin: '0 auto', paddingLeft: 16, paddingRight: 16 }}>
      <NavBar />

      {/* Pulled out of ReferralCard into its own top-of-page block — Alexey's
          explicit ask 2026-08-25 — so it reads as a standalone confirmation
          ("you're set up") rather than a small caption easy to miss under
          the invite-link card. */}
      {connected && hasReferrer && (
        <div
          className="card"
          style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}
        >
          <FontAwesomeIcon icon={faCircleCheck} style={{ fontSize: 20, color: 'var(--positive)', flexShrink: 0 }} />
          <span className="text-secondary" style={{ fontSize: 13 }}>
            You were invited by someone — thanks for joining!
          </span>
        </div>
      )}

      {connected && <FriendsSummaryCard friends={friends} totalEarnedUsd={totalEarnedUsd} loading={loading} />}
      <ReferralCard />
      {connected && <FriendsTableCard friends={friends} totalEarnedUsd={totalEarnedUsd} loading={loading} />}

      <Footer />
    </div>
  )
}
