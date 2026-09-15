import { NavBar } from '../components/NavBar'
import { VaultStats } from '../components/VaultStats'
import { SwapPanel } from '../SwapPanel'
import { Footer } from '../components/Footer'

export function SwapPage() {
  return (
    <div className="app" style={{ maxWidth: 640, margin: '0 auto', paddingLeft: 16, paddingRight: 16 }}>
      <NavBar />
      <VaultStats />

      <SwapPanel />

      <Footer />
    </div>
  )
}
