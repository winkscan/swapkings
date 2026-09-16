import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRightLeft, faPeopleGroup, faUserPlus, faCrown, faBook } from '@fortawesome/free-solid-svg-icons'
import { WalletButton } from './WalletButton'

// The primary tab bar — icon-over-label, fixed to the bottom edge at every
// viewport width (see index.css's .mobile-tab-bar rules), matching how
// native wallet apps (Solflare, etc.) lay out their own navigation. Centered
// and capped at the site's own content width on wide viewports rather than
// stretching edge to edge like it does on mobile. Rules lives here as its
// own tab rather than being buried in a page.
const TABS = [
  { to: '/', icon: faRightLeft, label: 'Swap', connectedOnly: false },
  { to: '/crews', icon: faPeopleGroup, label: 'Crews', connectedOnly: false },
  { to: '/friends', icon: faUserPlus, label: 'Friends', connectedOnly: true },
  { to: '/rules', icon: faBook, label: 'Guide', connectedOnly: false },
] as const

function TabBar({ pathname, connected }: { pathname: string; connected: boolean }) {
  return (
    <nav className="mobile-tab-bar">
      {TABS.filter((tab) => !tab.connectedOnly || connected).map((tab) => {
        const active = pathname === tab.to
        return (
          <Link key={tab.to} to={tab.to} className={`mobile-tab-bar__item${active ? ' active' : ''}`}>
            <FontAwesomeIcon icon={tab.icon} />
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function NavBar() {
  const { pathname } = useLocation()
  const { connected } = useWallet()

  return (
    <>
      <div
        className="nav-grid"
        style={{
          alignItems: 'center',
          padding: '16px 0',
          marginBottom: 12,
        }}
      >
        <Link
          to="/"
          style={{
            gridColumn: '1',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: 700,
            fontSize: 16,
            justifySelf: 'start',
            color: 'var(--text-primary)',
            textDecoration: 'none',
          }}
        >
          <FontAwesomeIcon icon={faCrown} style={{ color: 'var(--accent)' }} />
          SwapKings
        </Link>
        <div style={{ gridColumn: '3', justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 14 }}>
          <a
            href="https://x.com/SwapKingsApp"
            target="_blank"
            rel="noreferrer"
            aria-label="SwapKings on X"
            style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
          >
            {/* Inline rather than pulling in @fortawesome/free-brands-svg-icons
                for one icon — standard X logo mark, viewBox 0 0 24 24. */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <WalletButton />
        </div>
      </div>

      <TabBar pathname={pathname} connected={connected} />
    </>
  )
}
