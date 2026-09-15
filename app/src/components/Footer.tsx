import { Link } from 'react-router-dom'

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      className="site-footer"
      style={{
        marginTop: 'auto',
        paddingTop: 20,
        paddingBottom: 24,
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
      }}
    >
      <p className="text-secondary" style={{ fontSize: 12, margin: 0 }}>
        &copy; {year} SwapKings. All rights reserved.
        {' · '}
        <Link to="/rules">How It Works</Link>
      </p>
    </footer>
  )
}
