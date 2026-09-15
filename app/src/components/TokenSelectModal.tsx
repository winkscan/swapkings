import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { TokenIcon } from './TokenIcon'
import { searchTokens, getTokenInfos, type SearchedToken } from '../jupiterInfo'

const POPULAR_MINTS = [
  'So11111111111111111111111111111111111111112', // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // WIF
]

function TokenRow({ token, onSelect }: { token: SearchedToken; onSelect: (mint: string) => void }) {
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
      <TokenIcon icon={token.icon} alt={token.symbol} size={28} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{token.symbol}</div>
        <div className="text-secondary" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {token.name}
        </div>
      </div>
    </button>
  )
}

export function TokenSelectModal({ onSelect, onClose }: { onSelect: (mint: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [popular, setPopular] = useState<SearchedToken[]>([])
  const [results, setResults] = useState<SearchedToken[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getTokenInfos(POPULAR_MINTS).then((infos) => {
      const rows = POPULAR_MINTS.map((mint) => (infos[mint] ? { mint, ...infos[mint] } : null)).filter(
        (t): t is SearchedToken => t !== null,
      )
      setPopular(rows)
    })
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    const handle = setTimeout(() => {
      searchTokens(query)
        .then(setResults)
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  const handleSelect = (mint: string) => {
    onSelect(mint)
    onClose()
  }

  const list = query.trim() ? results : popular

  return (
    <Modal onClose={onClose}>
      <h2 style={{ marginTop: 0, marginBottom: 12 }}>Select a token</h2>
      <input
        autoFocus
        type="text"
        placeholder="Search by name, symbol, or paste a mint address"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {!query.trim() && (
          <div className="text-secondary" style={{ fontSize: 12, padding: '8px 8px 4px' }}>
            Popular
          </div>
        )}
        {loading && <p style={{ padding: 12 }}>Searching…</p>}
        {!loading && query.trim() && list.length === 0 && <p style={{ padding: 12 }}>No tokens found.</p>}
        {list.map((t) => (
          <TokenRow key={t.mint} token={t} onSelect={handleSelect} />
        ))}
      </div>
    </Modal>
  )
}
