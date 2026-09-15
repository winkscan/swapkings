import { useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy, faUserPlus, faCheck, faWallet, faCircleCheck, faCircleXmark } from '@fortawesome/free-solid-svg-icons'
import { useRank } from '../useRank'
import { claimReferralCode, referralLink } from '../useReferral'
import { referralCodeToString } from '../pdas'
import { wasCancelled, friendlyErrorMessage } from '../walletErrors'
import { Modal } from './Modal'

export function ReferralCard() {
  const { connection } = useConnection()
  const { sendTransaction, connected } = useWallet()
  const wallet = useAnchorWallet()
  const { setVisible: setWalletModalVisible } = useWalletModal()
  const rank = useRank()
  const [claiming, setClaiming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [localCode, setLocalCode] = useState<string | null>(null)
  // We're asking the wallet to sign a real transaction, same as a swap — the
  // user should always be able to see whether it actually went through, not
  // just a small inline error line easy to miss (or, before this fix, no
  // feedback at all on a rejection — see claimReferralCode's own comment on
  // why Cancel used to look like it did nothing).
  const [claimResult, setClaimResult] = useState<{ ok: true } | { ok: false; cancelled: boolean; message: string } | null>(
    null,
  )

  // Same "public pages shouldn't go blank without a wallet" fix already
  // applied to SwapPanel/DepositPanel/useVaultData earlier this project —
  // NavBar only links to /friends once connected, but the route itself is
  // still directly reachable (shared link, browser back/forward, a wallet
  // that disconnects mid-visit), and a bare `return null` here left the
  // whole page showing nothing but the nav bar in that case.
  if (!connected) {
    return (
      <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontWeight: 600 }}>Invite friends</div>
        <div className="text-secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>
          Earn 50% of their platform fee on every swap they make, permanently.
        </div>
        <button
          onClick={() => setWalletModalVisible(true)}
          className="primary"
          style={{ width: 'auto', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <FontAwesomeIcon icon={faWallet} />
          Connect wallet
        </button>
      </div>
    )
  }

  const code = localCode ?? (rank.stats.myReferralCode.length > 0 ? referralCodeToString(rank.stats.myReferralCode) : null)

  const handleClaim = async () => {
    if (!wallet) return
    setClaiming(true)
    try {
      const newCode = await claimReferralCode(connection, wallet, sendTransaction)
      setLocalCode(newCode)
      setClaimResult({ ok: true })
    } catch (err) {
      console.error(err)
      setClaimResult({ ok: false, cancelled: wasCancelled(err), message: friendlyErrorMessage(err) })
    } finally {
      setClaiming(false)
    }
  }

  const handleCopy = () => {
    if (!code) return
    navigator.clipboard.writeText(referralLink(code)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>Invite friends</div>
          <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>
            Earn 50% of their platform fee on every swap they make, permanently.
          </div>
        </div>
        {code ? (
          <button onClick={handleCopy} style={{ width: 'auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
            {copied ? 'Copied' : 'Copy link'}
          </button>
        ) : (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="primary"
            style={{ width: 'auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <FontAwesomeIcon icon={faUserPlus} />
            {claiming ? 'Getting your link…' : 'Get my link'}
          </button>
        )}
      </div>
      {claimResult && (
        <Modal onClose={() => setClaimResult(null)}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <FontAwesomeIcon
              icon={claimResult.ok ? faCircleCheck : faCircleXmark}
              style={{ fontSize: 56, color: claimResult.ok ? 'var(--positive)' : '#ff5c5c' }}
            />
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>
              {claimResult.ok ? 'Link ready' : claimResult.cancelled ? 'Cancelled' : 'Failed'}
            </div>
            {!claimResult.ok && !claimResult.cancelled && (
              <div className="text-secondary" style={{ fontSize: 12, marginTop: 12, wordBreak: 'break-word' }}>
                {claimResult.message}
              </div>
            )}
            <button onClick={() => setClaimResult(null)} style={{ marginTop: 20 }}>
              {claimResult.ok ? 'Nice' : 'Try again'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
