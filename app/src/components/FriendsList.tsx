import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUserGroup } from '@fortawesome/free-solid-svg-icons'
import type { FriendRow } from '../useFriends'
import { shortAddr, formatUsdCompact } from '../format'

interface FriendsListProps {
  friends: FriendRow[]
  totalEarnedUsd: number
  loading: boolean
}

// Summary highlight (white card, per Alexey's request 2026-08-24 — split out
// of the combined FriendsList component so FriendsPage can put this ABOVE
// the referral-link card, with the detail table below it instead). Takes
// useFriends()'s own return values as props rather than calling the hook
// itself, so FriendsPage.tsx's single useFriends() call (shared with
// FriendsTable below) doesn't turn into two separate on-chain reads for the
// same data.
export function FriendsSummaryCard({ friends, totalEarnedUsd, loading }: FriendsListProps) {
  return (
    <div className="card" style={{ marginBottom: 16, background: '#fff', border: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#000' }}>{loading ? '…' : friends.length}</div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FontAwesomeIcon icon={faUserGroup} />
            Friends invited
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#000' }}>
            {loading ? '…' : formatUsdCompact(totalEarnedUsd)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>Total earned</div>
        </div>
      </div>
    </div>
  )
}

// Each row's lifetime earned $ reads straight off that friend's own on-chain
// PlayerStats — see useFriends.ts for why no per-friend RPC call or history
// scan is needed.
export function FriendsTableCard({ friends, loading }: FriendsListProps) {
  return (
    <div className="card">
      {loading && <p style={{ padding: 20 }}>Loading…</p>}
      {!loading && friends.length === 0 && (
        <p style={{ padding: 20 }}>No friends yet — share your link above to start earning.</p>
      )}
      {!loading && friends.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Friend</th>
              <th>Earned</th>
            </tr>
          </thead>
          <tbody>
            {friends.map((f) => (
              <tr key={f.wallet}>
                <td className="text-secondary">{shortAddr(f.wallet)}</td>
                <td className="text-positive">{formatUsdCompact(f.earnedUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
