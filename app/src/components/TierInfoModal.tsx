import { Modal } from './Modal'

// Display-only ranges matching the on-chain tier thresholds and fee discounts
// (constants.rs / useRank.ts's TIERS score cutoffs are sqrt($), so the
// dollar ranges here are the rounded human-readable version of the same
// breakpoints — keep in sync if those ever change).
const TIER_INFO = [
  { emoji: '🔰', name: 'Initiate', range: '$0 – $5K', discount: '0%' },
  { emoji: '⚔️', name: 'Adept', range: '$5K – $50K', discount: '12.5%' },
  { emoji: '🛡️', name: 'Veteran', range: '$50K – $500K', discount: '25%' },
  { emoji: '🏰', name: 'Lord', range: '$500K – $5M', discount: '37.5%' },
  { emoji: '👑', name: 'King', range: '$5M+', discount: '50%' },
]

export function TierInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>Rank tiers</h2>
      <p className="text-secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        Based on your lifetime swap volume — a guaranteed discount on the platform fee, no chance involved.
      </p>
      <table>
        <thead>
          <tr>
            <th>Tier</th>
            <th>Volume</th>
            <th>Fee discount</th>
          </tr>
        </thead>
        <tbody>
          {TIER_INFO.map((t) => (
            <tr key={t.name}>
              <td>
                {t.emoji} {t.name}
              </td>
              <td className="text-secondary">{t.range}</td>
              <td className="text-positive">{t.discount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}
