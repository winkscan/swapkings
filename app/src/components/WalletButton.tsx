import { useEffect, useRef, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faWallet, faRightFromBracket } from '@fortawesome/free-solid-svg-icons'
import { shortAddr } from '../format'

export function WalletButton() {
  const { connected, publicKey, disconnect } = useWallet()
  const { setVisible } = useWalletModal()
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleClick = () => {
    if (connected) {
      setMenuOpen((v) => !v)
    } else {
      setVisible(true)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleClick}
        title={connected && publicKey ? shortAddr(publicKey.toBase58()) : 'Connect wallet'}
        className={`wallet-btn${connected ? '' : ' wallet-btn--disconnected'}`}
        style={{
          background: connected ? 'var(--bg-elevated)' : 'var(--accent)',
          border: connected ? '1px solid var(--border-strong)' : 'none',
        }}
      >
        <FontAwesomeIcon
          icon={faWallet}
          className="wallet-btn__icon"
          style={{ color: connected ? 'var(--accent)' : 'var(--accent-text-on)', fontSize: 16 }}
        />
        {!connected && (
          <span className="wallet-btn__text" style={{ color: 'var(--accent-text-on)' }}>
            Connect
          </span>
        )}
        {connected && (
          <span
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'var(--positive)',
              border: '2px solid var(--bg)',
            }}
          />
        )}
      </button>

      {menuOpen && connected && publicKey && (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 50,
            right: 0,
            minWidth: 180,
            padding: 8,
            zIndex: 10,
          }}
        >
          <div className="text-secondary" style={{ fontSize: 12, padding: '6px 10px' }}>
            {shortAddr(publicKey.toBase58())}
          </div>
          <button
            onClick={() => {
              disconnect()
              setMenuOpen(false)
            }}
            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none' }}
          >
            <FontAwesomeIcon icon={faRightFromBracket} style={{ marginRight: 8 }} />
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
