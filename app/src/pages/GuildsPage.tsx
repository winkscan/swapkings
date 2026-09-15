import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PublicKey } from '@solana/web3.js'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowUpRightFromSquare,
  faCircleCheck,
  faCircleXmark,
  faCrown,
  faMagnifyingGlass,
  faPlus,
  faShield,
  faUsers,
} from '@fortawesome/free-solid-svg-icons'
import { NavBar } from '../components/NavBar'
import { Pagination } from '../components/Pagination'
import { TokenBadge } from '../components/TokenBadge'
import { Modal } from '../components/Modal'
import { Footer } from '../components/Footer'
import { InfoTooltip } from '../components/InfoTooltip'
import { useGuilds, type GuildRow } from '../useGuilds'
import { useGuildFeeHistory } from '../useGuildFeeHistory'
import { useRank } from '../useRank'
import { joinGuild, leaveGuild } from '../guildActions'
import { getPumpFunTokenInfo, GUILD_MARKET_CAP_FLOOR_USD } from '../pumpfun'
import { ZERO_PUBKEY, guildPda as deriveGuildPda } from '../pdas'
import { shortAddr, formatUsdCompact, solscanAddressUrl, solscanTxUrl } from '../format'
import { wasCancelled } from '../walletErrors'

const PAGE_SIZE = 20

// Manually-added rows (see AddTokenForm) persist per-browser so they survive
// a reload — still not shared with anyone else until the wallet that added
// one actually clicks Join, which creates a real on-chain Guild account that
// then shows up for everyone via useGuilds.ts's on-chain merge, regardless
// of whether Jupiter's discovery list ever picks it up.
const MANUAL_ROWS_KEY = 'swapkings.manualGuildRows.v1'

function loadManualRows(): GuildRow[] {
  try {
    const raw = localStorage.getItem(MANUAL_ROWS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveManualRows(rows: GuildRow[]) {
  try {
    localStorage.setItem(MANUAL_ROWS_KEY, JSON.stringify(rows))
  } catch {
    // Private browsing / storage disabled — the added token just won't
    // survive a reload, same as before this feature existed.
  }
}

function usePage<T>(items: T[], page: number, setPage: (p: number) => void) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages)
  const pageItems = items.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE)
  return { page: clampedPage, totalPages, pageItems, setPage }
}

// Your active guild, highlighted the same way the old Vault page highlighted
// the top/active reward pool — yellow card, crown, right up where the join
// form used to live, since it's the thing a connected wallet cares about
// seeing first.
function CurrentGuildHighlight({ row, onLeave, busy }: { row: GuildRow; onLeave: () => void; busy: boolean }) {
  return (
    <div className="card" style={{ marginBottom: 16, background: 'var(--accent)', border: 'none' }}>
      {/* Grid instead of a wrapping flex row so desktop and mobile can have
          genuinely different arrangements, not just the same items wrapping
          wherever they happen to run out of width: desktop keeps everything
          on one line (token, "Your house", fee/members, Leave), mobile
          switches to a 2x2 grid — token+Leave on top, "Your house"+fee/
          members below (see index.css's own .guild-highlight rules;
          confirmed live 2026-08-25 this is wanted on mobile only, ≤480px to
          match every other Houses-page mobile breakpoint in this file). */}
      <div className="guild-highlight">
        <div className="guild-highlight__token">
          <TokenBadge mint={row.tokenMint} />
        </div>
        <span className="guild-highlight__house" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#000' }}>
          <FontAwesomeIcon icon={faCrown} style={{ color: '#000' }} />
          Your house
        </span>
        <div className="guild-highlight__fee" style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: '#000' }}>{formatUsdCompact(row.totalFeesEarnedUsd)}</div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)' }}>
            {row.memberCount} member{row.memberCount === 1 ? '' : 's'}
          </div>
        </div>
        <button
          onClick={onLeave}
          disabled={busy}
          className="guild-highlight__leave"
          style={{ width: 'auto', padding: '8px 16px', background: 'rgba(0,0,0,0.15)', color: '#000', border: 'none' }}
        >
          {busy ? '…' : 'Leave'}
        </button>
      </div>
    </div>
  )
}

function GuildRowView({
  row,
  isCurrent,
  connected,
  hasAnyGuild,
  onJoin,
  onLeave,
  busy,
}: {
  row: GuildRow
  isCurrent: boolean
  connected: boolean
  // Already in a (different) house — Join for every other row greys out
  // rather than staying a live yellow CTA, so the table doesn't read as
  // "pick any of these" once you've actually committed to one. Leave first
  // to switch, same as before; nothing here blocks that.
  hasAnyGuild: boolean
  onJoin: () => void
  onLeave: () => void
  busy: boolean
}) {
  return (
    <tr>
      <td>
        <TokenBadge
          mint={row.tokenMint}
          flat
          subtitle={
            <a
              href={solscanAddressUrl(row.tokenMint)}
              target="_blank"
              rel="noreferrer"
              className="text-secondary"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            >
              {shortAddr(row.tokenMint)} <FontAwesomeIcon icon={faArrowUpRightFromSquare} size="xs" />
            </a>
          }
          // Mobile-only — hidden by default, shown by the ≤480px media query
          // in index.css. Market cap/Members get their own columns hidden at
          // that width (see the <th>/<td> below), so the member count moves
          // in here instead of just disappearing — still one tap away from
          // "how big is this house" without needing horizontal scroll.
          // symbolTrailing (not trailing) — glues it to "UFD" on the same
          // line, not centered against the two-line stack (see TokenBadge's
          // own comment on the difference; `trailing` was tried first and
          // put the badge between the name and address lines instead).
          symbolTrailing={
            <span className="guild-row-mobile-members text-secondary" style={{ alignItems: 'center', gap: 4, fontSize: 12 }}>
              <FontAwesomeIcon icon={faUsers} size="xs" />
              {row.memberCount}
            </span>
          }
        />
      </td>
      <td>
        <a
          href={solscanAddressUrl(row.founderWallet)}
          target="_blank"
          rel="noreferrer"
          className="text-secondary"
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
        >
          {shortAddr(row.founderWallet)} <FontAwesomeIcon icon={faArrowUpRightFromSquare} size="xs" />
        </a>
      </td>
      <td className="text-secondary guild-table-optional-col">
        {row.marketCapUsd !== undefined ? formatUsdCompact(row.marketCapUsd) : '—'}
      </td>
      <td className="text-secondary guild-table-optional-col">{row.memberCount}</td>
      <td className="text-positive">{formatUsdCompact(row.totalFeesEarnedUsd)}</td>
      <td>
        {!connected ? (
          <span className="text-secondary" style={{ fontSize: 12 }}>
            —
          </span>
        ) : isCurrent ? (
          <button onClick={onLeave} disabled={busy} style={{ fontSize: 12, padding: '6px 12px', width: 'auto' }}>
            {busy ? '…' : 'Leave'}
          </button>
        ) : (
          <button
            onClick={onJoin}
            disabled={busy || hasAnyGuild}
            className={hasAnyGuild ? undefined : 'primary'}
            style={{ fontSize: 12, padding: '6px 12px', width: 'auto' }}
          >
            {busy ? '…' : 'Join'}
          </button>
        )}
      </td>
    </tr>
  )
}

// The discovery list (see useGuilds.ts / pumpfun.ts) only covers ~140 tokens
// across a handful of Jupiter ranking windows — real but not exhaustive.
// This is the escape hatch: paste any mint directly and, if it's from a
// qualifying launchpad and clears the market-cap floor, it's added to the
// browsable table below (client-side only, until someone actually clicks
// Join — that's the only step that touches the chain).
function AddTokenForm({ guilds, onAdd }: { guilds: GuildRow[]; onAdd: (row: GuildRow) => void }) {
  const [mint, setMint] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = mint.trim()
  // Matched by contract address or symbol/name — a wallet is just as likely
  // to paste a token's ticker as its mint address here, and either one
  // already being in the list (discovered or previously pinned) means the
  // Add call below would just re-add a duplicate row.
  const existing = trimmed
    ? guilds.find(
        (g) => g.tokenMint.toLowerCase() === trimmed.toLowerCase() || g.symbol.toLowerCase() === trimmed.toLowerCase(),
      )
    : undefined

  const handleAdd = async () => {
    if (existing) return
    setError(null)
    let mintPk: PublicKey
    try {
      mintPk = new PublicKey(trimmed)
    } catch {
      setError('Not a valid Solana address.')
      return
    }
    setChecking(true)
    try {
      const info = await getPumpFunTokenInfo(mintPk.toBase58())
      if (!info) {
        setError("Couldn't find this token, or it's not from a qualifying launchpad.")
        return
      }
      onAdd({
        guildPda: '',
        tokenMint: info.mint,
        symbol: info.symbol,
        founderWallet: info.creator,
        memberCount: 0,
        totalFeesEarnedUsd: 0,
        marketCapUsd: info.marketCapUsd,
      })
      setMint('')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16, textAlign: 'left' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Don't see your token?</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="Token mint address"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--bg-input)',
            border: 'none',
            borderRadius: 'var(--radius-input)',
            padding: '10px 12px',
          }}
        />
        <button onClick={handleAdd} disabled={checking || !trimmed || !!existing} style={{ flexShrink: 0, width: 'auto', padding: '10px 16px' }}>
          <FontAwesomeIcon icon={faPlus} style={{ marginRight: 6 }} />
          {checking ? 'Checking…' : 'Add'}
        </button>
      </div>
      <div className="text-secondary" style={{ marginTop: 10, fontSize: 12 }}>
        Supports tokens from pump.fun, letsbonk.fun, Meteora, Jupiter Studio, and Moonshot, above a{' '}
        {formatUsdCompact(GUILD_MARKET_CAP_FLOOR_USD)} market cap.
      </div>
      {existing && (
        <div className="text-secondary" style={{ marginTop: 10, fontSize: 12 }}>
          {existing.symbol || shortAddr(existing.tokenMint)} is already in the list.
        </div>
      )}
      {!existing && error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--negative)' }}>{error}</div>}
    </div>
  )
}

// Fee-vs-founder history — one row per real on-chain guild-fee transfer.
// Deliberately no polling (see useGuildFeeHistory.ts): loads once when this
// tab is first opened, plus on explicit Refresh/Load more clicks only.
// No manual refresh control on purpose — see useGuildFeeHistory.ts. A click
// button that always fires a real Helius request was the first version of
// this and Alexey flagged it as an open abuse vector (script-clickable, no
// cooldown). The hook now owns its own slow polling entirely; this component
// only ever reads what it returns.
function FeesEarnedTab({
  founderWallets,
  founderWalletToHouseMint,
}: {
  founderWallets: Set<string>
  // Which house (token) a payout belongs to isn't the same thing as which
  // currency it was paid in (a SOL/USDC swap fee can still be owed to an
  // ANSEM-founded house) — this resolves founder wallet -> that house's own
  // token mint, so the Token column can show the house rather than
  // whatever coin happened to fund the swap.
  founderWalletToHouseMint: Map<string, string>
}) {
  const history = useGuildFeeHistory(founderWallets)

  return (
    <div className="card">
      <div className="text-secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        Most recent house-fee payouts, newest first.
      </div>

      {history.loading && history.rows.length === 0 && <p style={{ padding: 20 }}>Loading…</p>}
      {history.error && (
        <p style={{ padding: 20, color: 'var(--negative)' }}>Couldn't load history: {history.error}</p>
      )}
      {!history.loading && !history.error && history.rows.length === 0 && (
        <p style={{ padding: 20 }}>No house-fee transactions yet.</p>
      )}

      {history.rows.length > 0 && (
        <div className="guild-table-bleed" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <FontAwesomeIcon icon={faShield} />
                  House
                </span>
              </th>
              <th>Tx</th>
              <th>Fee to founder</th>
            </tr>
          </thead>
          <tbody>
            {history.rows.map((row) => (
              <tr key={row.signature}>
                <td>
                  <TokenBadge mint={founderWalletToHouseMint.get(row.founderWallet) ?? row.mint} flat />
                </td>
                <td>
                  <a
                    href={solscanTxUrl(row.signature)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-secondary"
                    style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                  >
                    {shortAddr(row.signature)} <FontAwesomeIcon icon={faArrowUpRightFromSquare} size="xs" />
                  </a>
                </td>
                <td className="text-positive">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <TokenBadge mint={row.mint} flat iconOnly size={16} />
                    {formatUsdCompact(row.usdAmount)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

export function GuildsPage() {
  const { connection } = useConnection()
  const { connected, sendTransaction } = useWallet()
  const wallet = useAnchorWallet()
  const { guilds: discoveredGuilds, loading, refresh, applyMembershipDelta } = useGuilds()
  const rank = useRank()
  const [busyGuild, setBusyGuild] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ action: 'joined' | 'left'; symbol: string } | null>(null)
  const [actionError, setActionError] = useState<unknown>(undefined)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  // Direct-link support for outreach ("here's your House, one click") —
  // swapkings.app/houses?mint=<address> pre-fills the search box with that
  // exact mint on load, same as typing it in by hand. Only reads the param
  // once on mount (an empty dependency array, matching every other
  // once-on-load URL-param read in this codebase, e.g. useReferral.ts's
  // usePendingReferralCode) — a later change to the search box shouldn't
  // fight back against the URL if the wallet clears/edits it themselves.
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const mint = searchParams.get('mint')
    if (mint) setQuery(mint)
  }, [])
  const [tab, setTab] = useState<'guilds' | 'fees'>('guilds')
  // Manually-added rows from AddTokenForm — kept separate from the
  // discovery/on-chain merge so a 90s discovery-list refresh (see
  // useGuilds.ts) never wipes out something the wallet just typed in.
  // Persisted to localStorage (loaded lazily so this doesn't run on every
  // render) and always pinned to the top of the table, most-recent-first —
  // so a wallet that just added their own token doesn't have to go hunting
  // for it in a market-cap-sorted list.
  const [manualRows, setManualRows] = useState<GuildRow[]>(loadManualRows)

  const addManualRow = (row: GuildRow) => {
    setManualRows((prev) => {
      const next = [row, ...prev.filter((r) => r.tokenMint !== row.tokenMint)]
      saveManualRows(next)
      return next
    })
  }

  const guilds = useMemo(() => {
    const discoveredByMint = new Map(discoveredGuilds.map((g) => [g.tokenMint, g]))
    const manualMints = new Set(manualRows.map((r) => r.tokenMint))
    // Prefer the discovered/on-chain version of a pinned row when it exists
    // (real member count / fees once someone's actually joined) — the
    // locally-stored preview is only a fallback until that happens. But keep
    // the manual row's own symbol/marketCapUsd as a fallback rather than
    // wholesale replacing: once a house actually gets joined, useGuilds.ts
    // starts returning a real on-chain row for it even if the token isn't
    // (or is no longer) in Jupiter's own top-100-per-window discovery lists
    // — that on-chain row's symbol/marketCapUsd are blank by construction
    // (see useGuilds.ts's own "any real on-chain guild not covered by the
    // discovery list" comment), which previously overwrote a perfectly good
    // cap this page already knew from the moment the token was added,
    // making it show "—" the instant someone actually joined.
    const pinned = manualRows.map((r) => {
      const discovered = discoveredByMint.get(r.tokenMint)
      if (!discovered) return r
      return { ...discovered, symbol: discovered.symbol || r.symbol, marketCapUsd: discovered.marketCapUsd ?? r.marketCapUsd }
    })
    const rest = discoveredGuilds.filter((g) => !manualMints.has(g.tokenMint))
    // Fees earned is the real signal of a house's actual activity, so it's
    // the primary sort — highest first. A manually-added row no longer gets
    // pinned above this ordering: once real fees exist, that's more useful
    // than "you added it recently." Ties (most commonly two houses both
    // sitting at exactly $0, since most never get a single swap) fall back
    // to market cap, highest first, so the list still reads as roughly
    // "biggest/most relevant first" among houses nobody's earned from yet.
    return [...pinned, ...rest].sort((a, b) => {
      if (b.totalFeesEarnedUsd !== a.totalFeesEarnedUsd) return b.totalFeesEarnedUsd - a.totalFeesEarnedUsd
      return (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1)
    })
  }, [discoveredGuilds, manualRows])

  const currentGuildOrNull = rank.stats.currentGuild.equals(ZERO_PUBKEY)
    ? null
    : rank.stats.currentGuild.toBase58()

  // Matched by founder wallet, not guildPda: guildPda on a row only exists
  // once useGuilds' on-chain/cache data has caught up with a just-created
  // guild (up to the Cloudflare Worker's 2-minute cache cycle — see
  // useGuilds.ts), but the founder wallet is already known the moment a
  // token shows up in the discovery list at all (it's the pump.fun creator
  // address, same source either way). Matching on it means "you just joined
  // a guild nobody had joined before" shows correctly immediately instead of
  // silently failing to recognize your own row for up to 2 minutes.
  const currentGuildFounderWallet = rank.stats.currentGuildFounderWallet.equals(ZERO_PUBKEY)
    ? null
    : rank.stats.currentGuildFounderWallet.toBase58()

  // The optimistic applyMembershipDelta call in handleJoinRow/handleLeaveRow
  // only fixes the browser TAB that actually performed the action — any
  // OTHER session (a different browser, incognito, or just this same wallet
  // opening the site again after the hourly cache cycle) still starts from
  // useGuilds.ts's normal first-load path, which prefers the Cloudflare
  // Worker cache over a real on-chain read specifically to keep that cheap
  // for the common case. Confirmed live 2026-08-25: a wallet's own
  // just-joined house showed stale member data in a completely separate
  // incognito session, since nothing there had ever triggered a direct
  // fetch. Once per wallet-connect, if this wallet turns out to actually be
  // in a guild, force one real refresh — same "a wallet's own state should
  // never look wrong" guarantee useGuilds.ts's refresh() already promises,
  // just extended to cover "any session," not only "the session that acted."
  const syncedOwnGuild = useRef(false)
  useEffect(() => {
    if (currentGuildOrNull && !syncedOwnGuild.current) {
      syncedOwnGuild.current = true
      refresh()
    }
    if (!currentGuildOrNull) syncedOwnGuild.current = false
  }, [currentGuildOrNull, refresh])

  const currentGuildRow = guilds.find((g) => g.founderWallet === currentGuildFounderWallet) ?? null

  // Only wallets we know are a REAL on-chain guild's founder (guildPda set —
  // a candidate from the discovery list that nobody's ever joined has never
  // actually received a fee) — keeps the Helius history filter tight and
  // avoids a false-positive match against an unrelated transfer to some
  // pump.fun creator wallet that never became a guild founder here.
  const founderWallets = useMemo(
    () => new Set(guilds.filter((g) => g.guildPda !== '').map((g) => g.founderWallet)),
    [guilds],
  )

  // Founder wallet -> that house's own token mint, so the Fees Earned tab
  // can show which house a payout belongs to rather than just the currency
  // it happened to be paid in (see FeesEarnedTab's own comment).
  const founderWalletToHouseMint = useMemo(
    () => new Map(guilds.filter((g) => g.guildPda !== '').map((g) => [g.founderWallet, g.tokenMint])),
    [guilds],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return guilds
    return guilds.filter((g) => g.tokenMint.toLowerCase().includes(q) || g.symbol.toLowerCase().includes(q))
  }, [guilds, query])

  const { page: clampedPage, totalPages, pageItems } = usePage(filtered, page, setPage)

  const handleJoinRow = async (row: GuildRow) => {
    if (!wallet) return
    setBusyGuild(row.tokenMint)
    try {
      const switchingFrom = currentGuildRow
      const newGuildPda = row.guildPda || deriveGuildPda(new PublicKey(row.tokenMint)).toBase58()
      await joinGuild({
        connection,
        wallet,
        sendTransaction,
        tokenMint: new PublicKey(row.tokenMint),
        founderWallet: new PublicKey(row.founderWallet),
        previousGuild: currentGuildOrNull ? new PublicKey(currentGuildOrNull) : null,
        isNewGuild: row.guildPda === '',
      })
      setFeedback({ action: 'joined', symbol: row.symbol || shortAddr(row.tokenMint) })
      // Both: current_guild lives on PlayerStats (rank), member_count/fees
      // live on the Guild account (guilds) — a join/leave changes both, so
      // both need an immediate refetch, not just one. applyMembershipDelta
      // corrects the ONE number (member_count, ±1) a click already knows
      // for certain, so it's right on screen before refresh()'s own RPC
      // round-trip even resolves — see that function's own comment for why
      // this stopped being optional (real "still shows 0" reports live
      // 2026-08-25, on-chain data was already correct every time).
      applyMembershipDelta(row.tokenMint, row.founderWallet, 1, newGuildPda)
      if (switchingFrom) {
        applyMembershipDelta(switchingFrom.tokenMint, switchingFrom.founderWallet, -1, switchingFrom.guildPda)
      }
      refresh()
      rank.refresh()
    } catch (err) {
      console.error(err)
      setActionError(err)
    } finally {
      setBusyGuild(null)
    }
  }

  const handleLeaveRow = async (row: GuildRow) => {
    if (!wallet) return
    setBusyGuild(row.tokenMint)
    try {
      // `row.guildPda` comes from the (possibly stale, up-to-an-hour-old)
      // cache — a guild the wallet just joined for real can briefly still
      // show '' here even though it definitely exists on-chain (confirmed
      // live 2026-08-25: this silently no-op'd the whole Leave click, since
      // the row genuinely had no guild address to leave). The PDA is
      // deterministic from the mint alone, so there's never a reason to
      // depend on the cache actually having caught up just to derive it.
      const guild = row.guildPda ? new PublicKey(row.guildPda) : deriveGuildPda(new PublicKey(row.tokenMint))
      await leaveGuild({ connection, wallet, sendTransaction, guild })
      setFeedback({ action: 'left', symbol: row.symbol || shortAddr(row.tokenMint) })
      applyMembershipDelta(row.tokenMint, row.founderWallet, -1, guild.toBase58())
      refresh()
      rank.refresh()
    } catch (err) {
      console.error(err)
      setActionError(err)
    } finally {
      setBusyGuild(null)
    }
  }

  return (
    <div className="app" style={{ maxWidth: 640, margin: '0 auto', paddingLeft: 16, paddingRight: 16 }}>
      <NavBar />

      <div className="pill-tabs" style={{ marginBottom: 16, alignSelf: 'center' }}>
        <button className={tab === 'guilds' ? 'active' : ''} onClick={() => setTab('guilds')}>
          Houses
        </button>
        <button className={tab === 'fees' ? 'active' : ''} onClick={() => setTab('fees')}>
          Fees sent
        </button>
      </div>

      {tab === 'guilds' && (
        <>
          {currentGuildRow && (
            <CurrentGuildHighlight
              row={currentGuildRow}
              busy={busyGuild === currentGuildRow.tokenMint}
              onLeave={() => handleLeaveRow(currentGuildRow)}
            />
          )}

          <AddTokenForm guilds={guilds} onAdd={addManualRow} />

          <div className="card">
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="text-secondary"
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}
              />
              <input
                type="text"
                placeholder="Search by contract or symbol"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: 'none',
                  borderRadius: 'var(--radius-input)',
                  padding: '10px 12px 10px 36px',
                }}
              />
            </div>

            {loading && <p style={{ padding: 20 }}>Loading…</p>}
            {!loading && filtered.length === 0 && (
              <p style={{ padding: 20 }}>
                <FontAwesomeIcon icon={faUsers} style={{ marginRight: 8 }} />
                {guilds.length === 0 ? 'No qualifying houses found right now.' : 'No match for that search.'}
              </p>
            )}
            {!loading && filtered.length > 0 && (
              <>
                {/* overflow-x:auto safety net — column-hiding above covers the
                    common case, but even Token/Founder/Fees-sent/action alone
                    can still be tight on the narrowest phones (confirmed live
                    2026-08-24: 375px viewport, table still ~48px too wide with
                    only 4 columns). This keeps any remaining overflow scoped
                    to the table itself instead of the whole page.
                    guild-table-bleed (index.css) cancels out the parent
                    .card's own 20px padding on mobile so the table runs edge
                    to edge instead of floating with dead space on both
                    sides — Alexey's explicit ask 2026-08-25 ("в притык"). */}
                <div className="guild-table-bleed" style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Founder</th>
                        <th className="guild-table-optional-col">Market cap</th>
                        <th className="guild-table-optional-col">Members</th>
                        <th>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            Fees sent
                            <InfoTooltip text="These fees were sent directly to the token's founder wallet." />
                          </span>
                        </th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((row) => (
                        <GuildRowView
                          key={row.tokenMint}
                          row={row}
                          isCurrent={currentGuildFounderWallet !== null && row.founderWallet === currentGuildFounderWallet}
                          connected={connected}
                          hasAnyGuild={currentGuildOrNull !== null}
                          busy={busyGuild === row.tokenMint}
                          onJoin={() => handleJoinRow(row)}
                          onLeave={() => handleLeaveRow(row)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={clampedPage} totalPages={totalPages} onPageChange={setPage} />
              </>
            )}
          </div>
        </>
      )}

      {tab === 'fees' && (
        <FeesEarnedTab founderWallets={founderWallets} founderWalletToHouseMint={founderWalletToHouseMint} />
      )}

      {feedback && (
        <Modal onClose={() => setFeedback(null)}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <FontAwesomeIcon icon={faCircleCheck} style={{ fontSize: 56, color: 'var(--positive)' }} />
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>
              {feedback.action === 'joined' ? `Joined ${feedback.symbol}` : `Left ${feedback.symbol}`}
            </div>
            <div className="text-secondary" style={{ fontSize: 12, marginTop: 12 }}>
              {feedback.action === 'joined'
                ? `From now on, every swap you make in any pair on SwapKings sends a share of your fee straight to ${feedback.symbol}'s founder.`
                : 'May take a few seconds to show up in the list.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              {feedback.action === 'joined' && (
                <Link
                  to="/"
                  style={{
                    flex: 1,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#fff',
                    color: '#000',
                    borderRadius: 'var(--radius-pill)',
                    padding: '16px 24px',
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  Go to swap
                </Link>
              )}
              <button onClick={() => setFeedback(null)} style={{ flex: 1 }}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {actionError !== undefined && (
        <Modal onClose={() => setActionError(undefined)}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <FontAwesomeIcon icon={faCircleXmark} style={{ fontSize: 56, color: '#ff5c5c' }} />
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>
              {wasCancelled(actionError) ? 'Cancelled' : 'Failed'}
            </div>
            {!wasCancelled(actionError) && (
              <div className="text-secondary" style={{ fontSize: 12, marginTop: 12, wordBreak: 'break-word' }}>
                {actionError instanceof Error ? actionError.message : String(actionError)}
              </div>
            )}
            <button onClick={() => setActionError(undefined)} style={{ marginTop: 20 }}>
              Close
            </button>
          </div>
        </Modal>
      )}

      <Footer />
    </div>
  )
}
