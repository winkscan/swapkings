import { useEffect, useState, type ReactNode } from 'react'
import type { TokenInfo } from '../jupiterInfo'
import { getTokenInfoBatched } from '../tokenInfoBatch'
import { TokenIcon } from './TokenIcon'

const cache = new Map<string, TokenInfo | null>()

export function TokenBadge({
  mint,
  trailing,
  flat = false,
  size = 22,
  subtitle,
  iconOnly = false,
  symbolTrailing,
}: {
  mint: string
  trailing?: ReactNode
  // Drops the pill background/padding — for places this is shown as plain
  // inline info (e.g. a swap-result summary) rather than a clickable button.
  flat?: boolean
  // Icon size in px — the symbol's font-size scales with it, so this badge can
  // drop into small inline text (e.g. a hint sentence) without blowing out the
  // line height. Defaults to the normal pill-button size.
  size?: number
  // A second line under the symbol (e.g. the contract address) — switches to
  // a two-line stacked layout instead of the default single-line pill. The
  // icon stays vertically centered against the whole stack for free (the
  // root's own `alignItems: center` already centers cross-axis regardless of
  // how tall the text column ends up).
  subtitle?: ReactNode
  // Just the icon, no symbol text — for spots the symbol is redundant or
  // there's no room (e.g. a currency icon prefixed right before a $ amount,
  // where the number itself is the point, not the token's name).
  iconOnly?: boolean
  // Extra content right after the symbol, on the SAME line — unlike
  // `trailing` (which sits after the whole icon+text block, vertically
  // centered against a two-line subtitle stack), this stays glued to the
  // symbol itself. Built for GuildsPage's mobile member-count badge, which
  // needs to read as "UFD 👥1", not float centered next to the address line
  // below it (confirmed live 2026-08-25 — with `trailing`, the badge ended
  // up vertically between the two lines instead of next to the name).
  symbolTrailing?: ReactNode
}) {
  const [info, setInfo] = useState<TokenInfo | null>(cache.get(mint) ?? null)

  useEffect(() => {
    if (!mint || mint.length < 32) {
      setInfo(null)
      return
    }
    if (cache.has(mint)) {
      setInfo(cache.get(mint) ?? null)
      return
    }
    let cancelled = false
    getTokenInfoBatched(mint).then((found) => {
      // Only cache a real hit. A miss/failure (rate limit, transient network
      // error, brand-new token Jupiter hasn't indexed yet) is never worth
      // caching — this Map has no TTL and lives for the whole page session,
      // so caching `null` here would permanently stick a token with a real
      // fallback icon/address for the rest of the session even once the
      // lookup would succeed again a moment later. Confirmed exactly this
      // happened session-wide after a burst of Jupiter rate-limiting during
      // dev testing (even SOL/USDC got stuck on the fallback).
      if (found) cache.set(mint, found)
      if (!cancelled) setInfo(found)
    })
    return () => {
      cancelled = true
    }
  }, [mint])

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: flat ? 'transparent' : 'var(--bg-hover)',
        borderRadius: 'var(--radius-pill)',
        padding: flat ? 0 : trailing ? '6px 10px 6px 6px' : '6px 12px 6px 6px',
        flexShrink: 0,
      }}
    >
      <TokenIcon icon={info?.icon} mint={mint} alt={info?.symbol ?? mint} size={size} />
      {iconOnly ? null : subtitle ? (
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: Math.max(11, Math.round(size * 0.64)), whiteSpace: 'nowrap' }}>
              {info?.symbol ?? (mint ? `${mint.slice(0, 4)}…` : '—')}
            </span>
            {symbolTrailing}
          </div>
          <div style={{ marginTop: 2 }}>{subtitle}</div>
        </div>
      ) : (
        <span style={{ fontWeight: 600, fontSize: Math.max(11, Math.round(size * 0.64)), whiteSpace: 'nowrap' }}>
          {info?.symbol ?? (mint ? `${mint.slice(0, 4)}…` : '—')}
        </span>
      )}
      {trailing}
    </div>
  )
}
