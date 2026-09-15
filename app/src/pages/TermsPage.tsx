import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faArrowLeft, faScaleBalanced, faTriangleExclamation, faCoins, faEnvelope } from '@fortawesome/free-solid-svg-icons'
import { NavBar } from '../components/NavBar'
import { Footer } from '../components/Footer'

function Section({ icon, title, children }: { icon: IconDefinition; title: string; children: ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <FontAwesomeIcon icon={icon} style={{ color: 'var(--accent)' }} />
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      </div>
      <div className="text-secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  )
}

export function TermsPage() {
  return (
    <div className="app" style={{ maxWidth: 640, margin: '0 auto', paddingLeft: 16, paddingRight: 16 }}>
      <NavBar />

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12 }}>
          <FontAwesomeIcon icon={faArrowLeft} size="xs" />
          Back to Swap
        </Link>
        <h1 style={{ fontSize: 26, marginTop: 8 }}>Terms of Use</h1>
        <p className="text-secondary" style={{ fontSize: 13, marginTop: 8 }}>
          Last updated August 26, 2026.
        </p>
      </div>

      <Section icon={faScaleBalanced} title="What SwapKings is">
        <p style={{ margin: 0 }}>
          SwapKings is a non-custodial interface for swapping tokens on Solana, routed through
          Jupiter's aggregator. We never take custody of your funds — every swap is signed and sent
          by your own wallet, directly on-chain. By using this site, you agree to these terms.
        </p>
      </Section>

      <Section icon={faTriangleExclamation} title="Use at your own risk">
        <p style={{ margin: 0, marginBottom: 8 }}>
          Cryptocurrency is volatile and swap transactions on Solana are final and irreversible once
          confirmed — there is no way for us to reverse, refund, or recover a transaction after the
          fact, including one sent to the wrong address or affected by price movement/slippage.
        </p>
        <p style={{ margin: 0 }}>
          Nothing on this site is financial, investment, or tax advice. You're solely responsible for
          your own wallet, its private keys/seed phrase, and every transaction you approve. You must
          be legally permitted to use cryptocurrency services in your jurisdiction, and at least 18
          years old, to use SwapKings.
        </p>
      </Section>

      <Section icon={faCoins} title="Fees, Houses, and referrals">
        <p style={{ margin: 0, marginBottom: 8 }}>
          SwapKings charges a platform fee (0.2% before any LUCK-tier discount) on top of Jupiter's
          own routing — see the <Link to="/rules">Rules</Link> page for exactly how that fee splits
          between Houses, referrals, and the platform. These mechanics are deterministic and run
          on-chain in the same transaction as your swap; they can change in future versions of this
          app, but never retroactively for a swap you've already made.
        </p>
        <p style={{ margin: 0 }}>
          Houses route a share of your fee to a token's on-chain creator wallet, resolved
          automatically — we don't vet or endorse any individual token or its creator by including it.
        </p>
      </Section>

      <Section icon={faTriangleExclamation} title="No warranty">
        <p style={{ margin: 0 }}>
          SwapKings is provided "as is," without warranty of any kind. We don't guarantee the app will
          be uninterrupted, error-free, or available at all times, and we aren't liable for losses
          arising from your use of it, third-party services it relies on (Jupiter, your wallet, RPC
          providers), or the underlying Solana network itself.
        </p>
      </Section>

      <Section icon={faEnvelope} title="Contact">
        <p style={{ margin: 0 }}>
          Questions about these terms: <strong>antewinkscan@gmail.com</strong>
        </p>
      </Section>

      <Footer />
    </div>
  )
}
