import { useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import type { PublicKey } from '@solana/web3.js'
import { Modal } from './Modal'
import { TokenIcon } from './TokenIcon'
import { getWalletTokens, type WalletToken } from '../walletTokens'

function TokenRow({ token, onSelect }: { token: WalletToken; onSelect: (mint: string) => void }) {
  return (
    <button
      onClick={() => onSelect(token.mint)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        background: 'transparent',
        border: 'none',
        padding: '10px 8px',
        textAlign: 'left',
      }}
    >
      <TokenIcon icon={token.icon} mint={token.mint} alt={token.symbol} size={28} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{token.symbol}</div>
        <div className="text-secondary" style={{ fontSize: 12 }}>
          {token.name}
        </div>
      </div>
      <div className="text-secondary" style={{ fontSize: 13, flexShrink: 0 }}>
        {token.uiAmount.toLocaleString('en-US', { maximumFractionDigits: 4 })}
      </div>
    </button>
  )
}

export function WalletTokenSelectModal({
  owner,
  onSelect,
  onClose,
}: {
  owner: PublicKey
  onSelect: (mint: string) => void
  onClose: () => void
}) {
  const { connection } = useConnection()
  const [tokens, setTokens] = useState<WalletToken[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getWalletTokens(connection, owner).then((t) => {
      if (!cancelled) setTokens(t)
    })
    return () => {
      cancelled = true
    }
  }, [connection, owner])

  const handleSelect = (mint: string) => {
    onSelect(mint)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>Your tokens</h2>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {tokens === null && <p style={{ padding: 12 }}>Loading…</p>}
        {tokens !== null && tokens.length === 0 && <p style={{ padding: 12 }}>No tokens found in this wallet.</p>}
        {tokens?.map((t) => (
          <TokenRow key={t.mint} token={t} onSelect={handleSelect} />
        ))}
      </div>
    </Modal>
  )
}
