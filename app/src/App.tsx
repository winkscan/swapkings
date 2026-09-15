import { Routes, Route } from 'react-router-dom'
import { SwapPage } from './pages/SwapPage'
import { GuildsPage } from './pages/GuildsPage'
import { FriendsPage } from './pages/FriendsPage'
import { RulesPage } from './pages/RulesPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { TermsPage } from './pages/TermsPage'
import { OnboardingModal } from './components/OnboardingModal'
import './App.css'

function App() {
  return (
    <>
      <OnboardingModal />
      <Routes>
        <Route path="/" element={<SwapPage />} />
        <Route path="/houses" element={<GuildsPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Routes>
    </>
  )
}

export default App
