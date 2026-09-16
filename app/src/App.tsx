import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { SwapPage } from './pages/SwapPage'
import { GuildsPage } from './pages/GuildsPage'
import { FriendsPage } from './pages/FriendsPage'
import { RulesPage } from './pages/RulesPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { TermsPage } from './pages/TermsPage'
import { OnboardingModal } from './components/OnboardingModal'
import './App.css'

// "House" read as unclear to newcomers ("is this a new token?"), renamed
// to "Crew" everywhere (user follow-up, 2026-09-16). /houses stays as a
// redirect since real outreach-campaign links already point at
// /houses?mint=<address> (see GuildsPage.tsx's own comment on that) —
// preserves the query string so those links keep pre-filling the search
// box instead of silently dropping the mint.
function HousesRedirect() {
  const location = useLocation()
  return <Navigate to={`/crews${location.search}`} replace />
}

function App() {
  return (
    <>
      <OnboardingModal />
      <Routes>
        <Route path="/" element={<SwapPage />} />
        <Route path="/crews" element={<GuildsPage />} />
        <Route path="/houses" element={<HousesRedirect />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Routes>
    </>
  )
}

export default App
