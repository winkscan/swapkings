import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faArrowLeft, faShieldHalved, faDatabase, faCookieBite, faEnvelope } from '@fortawesome/free-solid-svg-icons'
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

export function PrivacyPage() {
  return (
    <div className="app" style={{ maxWidth: 640, margin: '0 auto', paddingLeft: 16, paddingRight: 16 }}>
      <NavBar />

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12 }}>
          <FontAwesomeIcon icon={faArrowLeft} size="xs" />
          Back to Swap
        </Link>
        <h1 style={{ fontSize: 26, marginTop: 8 }}>Privacy Policy</h1>
        <p className="text-secondary" style={{ fontSize: 13, marginTop: 8 }}>
          Last updated August 26, 2026.
        </p>
      </div>

      <Section icon={faShieldHalved} title="The short version">
        <p style={{ margin: 0 }}>
          SwapKings is non-custodial — we never hold your funds and we never ask for a password,
          email, or ID to use the app. There's no account to create. The only thing tying your
          activity together on our side is your wallet's public address, which is public on Solana
          anyway.
        </p>
      </Section>

      <Section icon={faDatabase} title="What we actually store">
        <p style={{ margin: 0, marginBottom: 8 }}>
          Our on-chain program records, per wallet address: cumulative swap volume (for your LUCK
          tier), your current Crew, and your referrer if you have one. All of this is public Solana
          blockchain data — it isn't private, and it isn't stored anywhere off-chain by us beyond
          what the blockchain itself already keeps.
        </p>
        <p style={{ margin: 0 }}>
          We don't collect your name, email, IP address, or device information, and we don't run any
          analytics or tracking scripts on this site — there's nothing installed that watches how you
          use it.
        </p>
      </Section>

      <Section icon={faCookieBite} title="Local storage">
        <p style={{ margin: 0 }}>
          The app saves a couple of small values directly in your own browser's local storage — a
          pending referral code if you followed a friend's link, and whether you've dismissed the
          onboarding screen. This never leaves your device or gets sent to us; clearing your
          browser's site data removes it.
        </p>
      </Section>

      <Section icon={faDatabase} title="Third parties involved in a swap">
        <p style={{ margin: 0, marginBottom: 8 }}>
          Completing a swap necessarily involves a few outside services, each only seeing what a
          normal Solana transaction requires:
        </p>
        <p style={{ margin: 0 }}>
          <strong>Jupiter</strong> (routing your swap), <strong>Helius</strong> (the RPC provider we
          use to talk to the Solana blockchain), and your own <strong>wallet app</strong> (Phantom,
          Solflare, or whichever you connect). None of them get anything from us beyond your public
          wallet address and the transaction itself — the same information anyone could already see
          on a Solana block explorer.
        </p>
      </Section>

      <Section icon={faEnvelope} title="Contact">
        <p style={{ margin: 0 }}>
          Questions about this policy: <strong>antewinkscan@gmail.com</strong>
        </p>
      </Section>

      <Footer />
    </div>
  )
}
