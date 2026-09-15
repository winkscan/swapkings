import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faInfo } from '@fortawesome/free-solid-svg-icons'
import { useRank, TIERS } from '../useRank'
import { formatUsdCompact } from '../format'
import { DEMO_MODE, MOCK_RANK } from '../mockData'
import { TierInfoModal } from './TierInfoModal'

// Shared tier/volume/discount summary — shown on the Swap panel so the
// incentive to keep swapping is visible right where the user is about to
// make their next swap. Deliberately shows no abstract score number (the old
// "LUCK: 429" line) — a bare sqrt-of-volume integer meant nothing on its own
// once RANK stopped feeding random jackpot odds and became a flat discount
// ladder; the fee discount % it maps to is the number that's actually
// actionable, so that's what's shown instead.
export function RankCard() {
  const [showTierInfo, setShowTierInfo] = useState(false)
  const { publicKey } = useWallet()
  const rank = useRank()

  const hasIdentity = DEMO_MODE || !!publicKey
  const rankLoading = DEMO_MODE ? false : rank.loading
  const { volumeUsd, tier, discountBps } = DEMO_MODE ? MOCK_RANK : rank

  if (!hasIdentity) return null

  // Progress toward the wallet's actual NEXT tier (matches the $ breakpoints
  // shown in TierInfoModal's own table) — previously this bar's end value
  // was a fixed $1M-per-stage milestone unrelated to tier progression at
  // all, which read as a hardcoded/wrong number once someone compared it
  // against the tier table right below it (e.g. an Initiate wallet seeing
  // "$1,000,000" here but "$5K" for Initiate→Adept in the modal). King is
  // already the top tier, so its bar just shows full/no further target.
  // Looked up by name from the real TIERS list (not the `tier` object
  // itself) since DEMO_MODE's MOCK_RANK.tier is a lightweight {name, emoji}
  // stand-in without minVolumeUsd.
  const tierIndex = TIERS.findIndex((t) => t.name === tier.name)
  const currentTier = TIERS[tierIndex] ?? TIERS[0]
  const nextTier = TIERS[tierIndex + 1]
  const stageStart = currentTier.minVolumeUsd
  const stageEnd = nextTier ? nextTier.minVolumeUsd : currentTier.minVolumeUsd
  const stageProgressPct = nextTier
    ? Math.min(100, ((volumeUsd - stageStart) / (stageEnd - stageStart)) * 100)
    : 100

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {rankLoading && <p>Loading…</p>}
      {!rankLoading && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{tier.emoji}</span> {tier.name}
            </div>
            <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
              {discountBps / 100}% fee discount
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--positive)' }}>{formatUsdCompact(volumeUsd)}</div>
              <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
                Lifetime swap volume
              </div>
            </div>
            <button
              onClick={() => setShowTierInfo(true)}
              title="How Rank tiers work"
              style={{
                width: 32,
                height: 32,
                padding: 0,
                borderRadius: '50%',
                background: 'transparent',
                border: '1px solid var(--border-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FontAwesomeIcon icon={faInfo} size="xs" style={{ color: '#fff' }} />
            </button>
          </div>
        </div>
      )}
      {!rankLoading && (
        <div style={{ marginTop: 16 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-input)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${stageProgressPct}%`,
                borderRadius: 3,
                background: 'var(--positive)',
              }}
            />
          </div>
          <div
            className="text-secondary"
            style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}
          >
            <span>${volumeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span>${stageEnd.toLocaleString('en-US')}</span>
          </div>
        </div>
      )}
      {showTierInfo && <TierInfoModal onClose={() => setShowTierInfo(false)} />}
    </div>
  )
}
