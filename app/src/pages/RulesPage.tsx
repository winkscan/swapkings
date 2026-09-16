import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faArrowLeft, faShieldHalved, faPeopleGroup, faCoins, faUserPlus, faLock, faLightbulb } from '@fortawesome/free-solid-svg-icons'
import { NavBar } from '../components/NavBar'
import { Footer } from '../components/Footer'
import { GUILD_MARKET_CAP_FLOOR_USD } from '../pumpfun'
import { formatUsdCompact } from '../format'

const TIER_INFO = [
  { emoji: '🔰', name: 'Initiate', range: '$0 – $5K', discount: '0%' },
  { emoji: '⚔️', name: 'Adept', range: '$5K – $50K', discount: '12.5%' },
  { emoji: '🛡️', name: 'Veteran', range: '$50K – $500K', discount: '25%' },
  { emoji: '🏰', name: 'Lord', range: '$500K – $5M', discount: '37.5%' },
  { emoji: '👑', name: 'King', range: '$5M+', discount: '50%' },
]

const FEE_SPLIT_ROWS = [
  { guild: 'No', referrer: 'No', founder: '—', ref: '—', platform: '100%' },
  { guild: 'No', referrer: 'Yes', founder: '—', ref: '50%', platform: '50%' },
  { guild: 'Yes', referrer: 'No', founder: '90%', ref: '—', platform: '10%' },
  { guild: 'Yes', referrer: 'Yes', founder: '40%', ref: '50%', platform: '10%' },
]

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

export function RulesPage() {
  return (
    <div className="app" style={{ maxWidth: 640, margin: '0 auto', paddingLeft: 16, paddingRight: 16 }}>
      <NavBar />

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12 }}>
          <FontAwesomeIcon icon={faArrowLeft} size="xs" />
          Back to Swap
        </Link>
        <h1 style={{ fontSize: 26, marginTop: 8 }}>How It Works</h1>
        <p className="text-secondary" style={{ fontSize: 13, marginTop: 8 }}>
          Fees, Rank, Crews, and Friends — the mechanics behind SwapKings.
        </p>
      </div>

      <Section icon={faLightbulb} title="Why">
        <p style={{ margin: 0, marginBottom: 8 }}>
          On every launchpad, a token's founder only ever earns from trades of that one token, in
          that one pair. Someone can love a project, hold it, talk about it every day — and the
          founder sees nothing unless that exact token gets traded.
        </p>
        <p style={{ margin: 0 }}>
          SwapKings breaks that link. Join a project's crew, and{' '}
          <strong>up to 90% of your platform fee flows to that founder on every swap you make
          anywhere on SwapKings</strong> — SOL to USDC, one meme coin to another, anything at all.
          You don't have to trade the token itself to support its creator. A whole community can
          now turn into real, ongoing revenue for the founder they believe in, no matter what
          they're actually swapping.
        </p>
      </Section>

      <Section icon={faPeopleGroup} title="Crews">
        <p style={{ margin: 0, marginBottom: 8 }}>
          Any token launched on a qualifying launchpad, above a {formatUsdCompact(GUILD_MARKET_CAP_FLOOR_USD)} market
          cap, has its own crew. Joining is free and instant — no invite needed, no cost beyond the
          swap you were already making. Once you've joined, <strong>up to 90% of your platform fee
          on every swap you make anywhere on SwapKings</strong> — not just swaps involving that
          token — routes straight to that token's original creator wallet, instantly, in the same
          transaction as your swap (40% if you also have a referrer — see the table below).
          SwapKings always keeps 10%.
        </p>
        <div
          className="card"
          style={{ background: 'var(--bg-input)', border: 'none', padding: 12, marginBottom: 8 }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, fontSize: 13 }}>
            Supported launchpads today
          </div>
          <div style={{ fontSize: 13 }}>pump.fun, letsbonk.fun, Meteora, Jupiter Studio, and Moonshot</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            We only ever route real money to a wallet we can verify is a token's actual creator —
            confirmed automatically through the token's own on-chain launch data, never a manual
            list. A token from any other launchpad, or a plain wallet-to-wallet token with no
            fair-launch record, can't become a crew — there's no creator wallet we could safely
            trust to route fees to. More launchpads may be added later, always following the same
            verification bar.
          </div>
        </div>
        <p style={{ margin: 0, marginBottom: 8 }}>
          A crew is sticky: it stays your active crew across every future swap until you switch to
          a different one or leave. Founders don't have to do anything to "activate" this — a
          crew's founder wallet comes straight from public launchpad creator data the moment their
          token clears the market-cap floor.
        </p>
        <p style={{ margin: 0, marginBottom: 8 }}>
          SwapKings doesn't create a crew — it's just an existing token, already launched and
          already trading on its own, that we attach fee-routing to. We don't mint anything, don't
          touch the token's supply or liquidity, and don't run its chart or its community. All a
          crew really is: SwapKings linking swappers to a token's real creator wallet and sending a
          share of platform fees there, automatically, for as long as they're in it.
        </p>
        <p style={{ margin: 0 }}>
          Check the Crews page for the full list, each crew's member count, and how much it's
          earned so far.
        </p>
      </Section>

      <Section icon={faShieldHalved} title="Fees">
        <p style={{ margin: 0, marginBottom: 8 }}>
          SwapKings applies a small 0.2% platform fee to swaps routed through the app — deducted
          from the output you already received, in the very same transaction as the swap itself.
          There's no second confirmation, no separate step: one wallet approval, done.
        </p>
        <p style={{ margin: 0, marginBottom: 8 }}>
          Your Rank tier (see below) discounts that fee automatically, up to 50% off at the top
          tier — capped there on purpose, so there's always a real remainder left to split with a
          crew and/or referrer, no matter how high your own tier climbs. Whatever's left after
          your discount is then split, instantly, depending on whether you're in a crew and/or
          were referred:
        </p>
        {/* overflow-x:auto — this table's 5 columns (2 short + 3 labeled)
            don't fit 375-430px phone widths; a bare <table> ignores its own
            width:100% as a hard cap and pushes the whole PAGE wider instead
            of just itself, which was the real source of the Guide page's
            horizontal scroll (confirmed live 2026-08-24). Scoping the
            overflow to this wrapper keeps the scroll local to the table. */}
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>In a crew?</th>
                <th>Referred?</th>
                <th>Crew founder</th>
                <th>Referrer</th>
                <th>Platform</th>
              </tr>
            </thead>
            <tbody>
              {FEE_SPLIT_ROWS.map((r, i) => (
                <tr key={i}>
                  <td className="text-secondary">{r.guild}</td>
                  <td className="text-secondary">{r.referrer}</td>
                  <td className="text-positive">{r.founder}</td>
                  <td className="text-positive">{r.ref}</td>
                  <td className="text-secondary">{r.platform}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: 0, marginTop: 12 }}>
          Most wallets and swap apps quietly add their own fee on top of the best route they find —
          often more than what you'll pay here, with nothing shared back. SwapKings keeps that fee
          low and, unlike those apps, gives a real share of it to the creator communities and
          friends you actually chose.
        </p>
      </Section>

      <Section icon={faCoins} title="Rank">
        <p style={{ margin: 0, marginBottom: 12 }}>
          Rank is a loyalty tier based on your lifetime swap volume — it's not a token and can't be
          transferred or traded. It drives a guaranteed, deterministic discount on the platform fee:
          no chance involved, no drawing, just a lower fee the more you've swapped.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Tier</th>
                <th>Lifetime volume</th>
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
        </div>
      </Section>

      <Section icon={faUserPlus} title="Friends">
        <p style={{ margin: 0, marginBottom: 8 }}>
          Invite a friend with your personal link and you'll earn a share of their platform fee on
          every swap they ever make — permanently, starting from their very first swap. Whoever
          refers a wallet is set once and never changes, so there's no re-attribution or "last click
          wins" games.
        </p>
        <p style={{ margin: 0, marginBottom: 8 }}>
          A referral only counts once your friend makes one real swap — just opening your link or
          connecting a wallet isn't enough on its own.
        </p>
        <p style={{ margin: 0 }}>
          You always earn the same 50% of your friend's fee, whether or not they're in a crew —
          bringing a friend along is worth the same either way. If they're not in a crew, that's 50%
          you / 50% SwapKings. If they're also in a crew, the split becomes 50% you / 40% the
          crew's founder / 10% SwapKings — your share never drops just because they joined a
          crew too. See the fee table above for the full breakdown. Get your own link from the
          "Invite friends" card on the Swap page.
        </p>
      </Section>

      <Section icon={faLock} title="Security">
        <p style={{ margin: 0, marginBottom: 8 }}>
          SwapKings runs entirely on-chain as a Solana program. There's no backend server holding
          your funds or deciding outcomes — every swap, fee split, and crew membership happens
          through public, verifiable on-chain instructions, the same ones for every wallet.
        </p>
        <p style={{ margin: 0 }}>
          The program is still in its early testing phase, so it currently has an upgrade authority
          that allows fixes if something needs adjusting. That authority will be permanently removed
          once testing wraps up, locking the program's logic in place for good — after that, not
          even the SwapKings team will be able to change how it works.
        </p>
      </Section>

      <p className="text-secondary" style={{ fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 24 }}>
        Swapping carries normal market risk. Nothing here is financial advice — swap responsibly.
      </p>

      <Footer />
    </div>
  )
}
