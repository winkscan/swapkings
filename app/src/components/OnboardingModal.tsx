import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark, faArrowRight, faShield } from '@fortawesome/free-solid-svg-icons'
import problemImg from '../assets/onboarding-problem.webp'
import solutionImg from '../assets/onboarding-solution.webp'

const DISMISSED_KEY = 'swapkings.onboardingDismissed.v1'

const STEPS = [
  {
    image: problemImg,
    title: "Founders earn nothing outside their own coin",
    body: "On every other launchpad, a token's founder only ever earns when someone trades that exact coin. Everywhere else on-chain — every other swap, every other coin — the king gets nothing, no matter how loyal his people are.",
  },
  {
    image: solutionImg,
    title: 'Every swap can pay tribute to your king',
    body: 'Join a house, and a share of your platform fee flows to that founder on every swap you make — any coins, any direction, not just theirs. A whole kingdom of trades becomes real, ongoing revenue for the founder you believe in.',
  },
] as const

// Shown once per "session" (i.e. every fresh visit) unless the visitor
// explicitly checks "don't show again" — that's the whole point of having a
// separate checkbox instead of just tracking "have they seen this" (which
// would make the checkbox redundant). Mounted once at the App level so it
// triggers regardless of which page a new visitor lands on first (a shared
// /houses or /friends link, not just the home swap page).
export function OnboardingModal() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) !== '1'
    } catch {
      return true
    }
  })
  const [step, setStep] = useState(0)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  if (!visible) return null

  const close = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(DISMISSED_KEY, '1')
      } catch {
        // Private browsing / storage disabled — worst case it just shows
        // again next visit, not a functional break.
      }
    }
    setVisible(false)
  }

  const isLastStep = step === STEPS.length - 1
  const current = STEPS[step]

  const handlePrimary = () => {
    if (isLastStep) {
      close()
      navigate('/houses')
      return
    }
    setStep((s) => s + 1)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        // Fixed 150px top offset instead of vertical centering — simpler
        // and, as a side effect, immune to the vh-jump issue entirely
        // (centering math depends on viewport HEIGHT, which is exactly what
        // was recalculating a moment after paint; a flat pixel offset from
        // the top never needs to know the viewport height at all).
        alignItems: 'flex-start',
        justifyContent: 'center',
        // Below .mobile-tab-bar's own z-index:100 (index.css) on purpose —
        // that bar is fixed to the bottom edge at every viewport width, and
        // this overlay used to tie with it exactly (both 100), leaving paint
        // order to decide the winner. Sitting strictly under it means the
        // tab bar always stays visible/tappable even if the card's height
        // ever runs long enough to reach that area, instead of silently
        // covering it (confirmed live 2026-08-24 — the bar disappeared
        // entirely behind the modal on a real mobile viewport).
        zIndex: 90,
        // 84px bottom reserve ≈ the tab bar's own real height (icon + label
        // + padding + border, see .mobile-tab-bar/.mobile-tab-bar__item in
        // index.css) plus notch/home-indicator safe-area clearance — so the
        // card's own maxHeight below never even reaches into that space in
        // the first place, on top of the z-index guard above.
        padding: '150px 16px calc(84px + env(safe-area-inset-bottom, 0px))',
        overflowY: 'auto',
      }}
    >
      <div
        className="card"
        style={{
          // width: 'min(...)' ties directly to the viewport (calc(100vw -
          // 32px) — 16px padding each side, matching the overlay's own
          // padding above) instead of `width:440 + maxWidth:'100%'`, which
          // resolves the percentage against the flex container and, on a
          // real mobile viewport, was rendering wider than the screen
          // itself (confirmed live 2026-08-24 on a 430px-wide device — the
          // card visibly overflowed past the right edge).
          width: 'min(440px, calc(100vw - 32px))',
          maxHeight: 'calc(100dvh - 234px - env(safe-area-inset-bottom, 0px))',
          overflowY: 'auto',
          position: 'relative',
          padding: 0,
        }}
      >
        <button
          onClick={close}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
            border: 'none',
            zIndex: 1,
          }}
        >
          <FontAwesomeIcon icon={faXmark} style={{ color: '#fff' }} />
        </button>

        <img src={current.image} alt={current.title} style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover' }} />

        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  height: 4,
                  flex: 1,
                  borderRadius: 2,
                  background: i <= step ? 'var(--accent)' : 'var(--bg-input)',
                }}
              />
            ))}
          </div>

          <h2 style={{ margin: 0, marginBottom: 8, fontSize: 18 }}>{current.title}</h2>
          <p className="text-secondary" style={{ margin: 0, marginBottom: 16, fontSize: 14, lineHeight: 1.6 }}>
            {current.body}
          </p>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              marginBottom: 16,
              cursor: 'pointer',
            }}
            className="text-secondary"
          >
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Don't show this again
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <button onClick={close} className="text-secondary" style={{ width: 'auto', padding: '10px 16px', background: 'transparent' }}>
              Skip
            </button>
            <button
              onClick={handlePrimary}
              className="primary"
              style={{ width: 'auto', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {isLastStep ? (
                <>
                  <FontAwesomeIcon icon={faShield} />
                  Join House
                </>
              ) : (
                <>
                  Next
                  <FontAwesomeIcon icon={faArrowRight} size="xs" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
