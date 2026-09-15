import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from '@solana/web3.js'
import type { PublicKey } from '@solana/web3.js'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import type { AnchorWallet } from '@solana/wallet-adapter-react'
import type { BN } from '@coral-xyz/anchor'
import { getProgram } from './anchorClient'
import { readonlyWallet } from './readonlyWallet'
import { getPumpFunCandidates, getTokenMarketInfos, type PumpFunTokenInfo, type TokenMarketInfo } from './pumpfun'
import { fetchFromCache } from './cacheWorker'
import { fetchAllAccountsV2 } from './gpaV2'

// A getProgramAccounts-family call — Helius (and every RPC provider) weighs
// this far more heavily than a single-account read, since it has to scan the
// account set server-side regardless of how small the result is. Originally
// polled every 8s on the assumption this was "our own RPC, cheap" — real
// usage proved that wrong fast (a couple of dev-testing sessions burned ~5%
// of a 1M/month free-tier credit budget, and this poll was the single
// largest contributor at 450 calls/hour from one open tab). The background
// poll now prefers the shared Cloudflare Worker cache (see
// ../cloudflare-worker) over calling Helius directly — cost for this part is
// now ~0 regardless of how many people have the Houses page open. Direct
// on-chain reads are reserved for two cases only: the cache is unset/down
// (local dev, or a fallback), and this wallet's own join/leave, where a
// stale cache would show your own action not having worked — `refresh()`
// always goes direct for that reason, trading one real call for correct
// instant feedback on something that actually just happened. That remaining
// direct call goes through `fetchAllAccountsV2` (getProgramAccountsV2, 1
// Helius credit) instead of Anchor's own `.all()` (getProgramAccounts, 10
// credits) — same filter/result, 10x cheaper per call (confirmed live
// against Helius's own docs, 2026-08-24).
const ONCHAIN_POLL_MS = 60_000
// The discovery list is a different story: it fans out to 7 parallel
// Jupiter endpoints (see pumpfun.ts) to get reasonable coverage, and
// Jupiter's lite-api rate-limits fast under repeated calls (verified
// directly — a handful of manual curl calls a few seconds apart started
// getting 429s). Not Helius-metered at all, left as-is.
const DISCOVERY_POLL_MS = 90_000

interface OnChainGuild {
  guildPda: string
  tokenMint: string
  founderWallet: string
  memberCount: number
  totalFeesEarnedUsd: number
}

export interface GuildRow {
  guildPda: string
  tokenMint: string
  symbol: string
  founderWallet: string
  memberCount: number
  totalFeesEarnedUsd: number
  // Market cap as of the last discovery-list refresh, or the last direct
  // per-mint lookup for a house discovery doesn't cover (see useGuilds()'s
  // own mcap-backfill effect) — undefined only very briefly, while that
  // backfill request for a newly-seen house is still in flight.
  marketCapUsd: number | undefined
}

interface GuildAccountData {
  tokenMint: PublicKey
  founderWallet: PublicKey
  memberCount: BN
  totalFeesEarnedUsdE4: BN
}

async function fetchGuildsDirect(connection: Connection, wallet: AnchorWallet | undefined): Promise<OnChainGuild[]> {
  const program = getProgram(connection, wallet ?? readonlyWallet)
  const all = await fetchAllAccountsV2<GuildAccountData>(connection, program, 'guild')
  return all.map((g) => ({
    guildPda: g.publicKey.toBase58(),
    tokenMint: g.account.tokenMint.toBase58(),
    founderWallet: g.account.founderWallet.toBase58(),
    memberCount: Number(g.account.memberCount.toString()),
    // Stored on-chain as USD x 10,000, not whole cents — see
    // Guild::total_fees_earned_usd_e4's own comment on why (whole-cent
    // precision truncated small-swap shares straight to $0.00 on-chain).
    totalFeesEarnedUsd: Number(g.account.totalFeesEarnedUsdE4.toString()) / 10_000,
  }))
}

function mergeRows(candidates: PumpFunTokenInfo[], onChain: OnChainGuild[]): GuildRow[] {
  const onChainByMint = new Map(onChain.map((g) => [g.tokenMint, g]))

  const rows: GuildRow[] = candidates.map((c) => {
    const g = onChainByMint.get(c.mint)
    onChainByMint.delete(c.mint)
    return {
      guildPda: g?.guildPda ?? '',
      tokenMint: c.mint,
      symbol: c.symbol,
      founderWallet: g?.founderWallet ?? c.creator,
      memberCount: g?.memberCount ?? 0,
      totalFeesEarnedUsd: g?.totalFeesEarnedUsd ?? 0,
      marketCapUsd: c.marketCapUsd,
    }
  })

  // Any real on-chain guild not covered by the discovery list above —
  // appended, market cap unknown, sorted after every known-mcap row.
  for (const g of onChainByMint.values()) {
    rows.push({ ...g, symbol: '', marketCapUsd: undefined })
  }

  rows.sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1))
  return rows
}

// Two data sources merged into one list: Jupiter's discovery ranking (see
// pumpfun.ts) supplies the browsable "every qualifying token, even one
// nobody's joined yet" candidates the Guilds page shows by default, and
// on-chain `Guild` accounts (real member_count/fees, bumped directly by
// record_swap — see record_swap.rs, no event-log backfill needed at all)
// override/augment those candidates wherever a guild has actually been
// created.
export function useGuilds() {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  const [candidates, setCandidates] = useState<PumpFunTokenInfo[]>([])
  const [onChain, setOnChain] = useState<OnChainGuild[]>([])
  const [loading, setLoading] = useState(true)
  // Backfill for houses the discovery list doesn't cover — a manually-added
  // token, or one that simply isn't in Jupiter's top-100-per-ranking-window
  // right now, would otherwise show marketCapUsd: undefined forever (a "—"
  // in the table) even though it's a perfectly real house. Keyed by mint so
  // a resolved value sticks without needing to be re-fetched on every poll;
  // a mint Jupiter genuinely has no data for just gets retried next poll
  // instead of being cached as permanently broken.
  const [mcapOverrides, setMcapOverrides] = useState<Record<string, TokenMarketInfo>>({})
  const isFirstLoad = useRef(true)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadDiscovery() {
      const list = await getPumpFunCandidates()
      if (!cancelled) setCandidates(list)
    }

    loadDiscovery()
    const interval = setInterval(loadDiscovery, DISCOVERY_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Pulled out of the effect (via useCallback) so a real event — this
  // wallet's own join/leave — can trigger an immediate refetch instead of
  // waiting up to ONCHAIN_POLL_MS. Cheaper AND better UX than a fast poll:
  // one extra call tied to something that actually happened, instead of a
  // recurring timer firing whether or not anything changed.
  //
  // `forceNextPollDirect` guards a real race confirmed live 2026-08-25: a
  // join/leave's own manual refresh correctly reads fresh on-chain data
  // (guildPda, memberCount), but the cache-backed Cloudflare Worker only
  // refreshes hourly — if the NEXT scheduled ONCHAIN_POLL_MS tick landed
  // before that, it would silently overwrite the just-corrected state back
  // to the stale cached snapshot (member count reverting, guildPda going
  // back to '' — which also silently broke the Leave button, since its own
  // handler no-ops on an empty guildPda). One extra guaranteed-direct poll
  // right after a manual refresh closes that window without needing to
  // pause polling entirely or keep every visitor on direct-only reads.
  const forceNextPollDirect = useRef(false)
  const loadOnChain = useCallback(
    async (isManualRefresh = false, isRetry = false) => {
      if (isFirstLoad.current) setLoading(true)
      const useDirect = isManualRefresh || forceNextPollDirect.current
      try {
        const rows = useDirect
          ? await fetchGuildsDirect(connection, wallet)
          : (await fetchFromCache<{ guilds: OnChainGuild[] }>('/guilds'))?.guilds ??
            (await fetchGuildsDirect(connection, wallet))
        if (mounted.current) setOnChain(rows)
        if (isManualRefresh) forceNextPollDirect.current = true
        else if (useDirect) forceNextPollDirect.current = false
      } catch (err) {
        // Same real gap useRank.ts's load() had, same fix — see that
        // function's own comment: an uncaught transient RPC hiccup on a
        // post-join/leave manual refresh used to leave `onChain` stuck on
        // its pre-action value until the next ONCHAIN_POLL_MS tick or a full
        // page reload, with nothing visible explaining why. One retry after
        // a short delay covers the transient case without silently retrying
        // a real, persistent failure forever.
        console.warn('useGuilds loadOnChain failed:', err)
        if (!isRetry) {
          setTimeout(() => loadOnChain(isManualRefresh, true), 1500)
        }
      } finally {
        if (!isManualRefresh) isFirstLoad.current = false
        if (mounted.current) setLoading(false)
      }
    },
    [connection, wallet],
  )

  useEffect(() => {
    isFirstLoad.current = true
    loadOnChain()
    const interval = setInterval(() => loadOnChain(), ONCHAIN_POLL_MS)
    return () => clearInterval(interval)
  }, [loadOnChain])

  const merged = mergeRows(candidates, onChain)

  const missingMints = merged
    .filter((g) => g.marketCapUsd === undefined && !(g.tokenMint in mcapOverrides))
    .map((g) => g.tokenMint)
  const missingMintsKey = missingMints.join(',')

  useEffect(() => {
    if (!missingMintsKey) return
    let cancelled = false
    getTokenMarketInfos(missingMintsKey.split(',')).then((infos) => {
      if (!cancelled && Object.keys(infos).length > 0) {
        setMcapOverrides((prev) => ({ ...prev, ...infos }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [missingMintsKey])

  const guilds = merged
    .map((g) => {
      if (g.marketCapUsd !== undefined) return g
      const override = mcapOverrides[g.tokenMint]
      if (!override) return g
      return { ...g, symbol: g.symbol || override.symbol, marketCapUsd: override.marketCapUsd }
    })
    .sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1))

  // Instant local correction for the ONE thing a join/leave click always
  // knows for certain — the affected guild's own member_count moved by
  // exactly ±1 — instead of waiting on refresh()'s real RPC round-trip
  // (getProgramAccountsV2 across every guild) before the number on screen
  // agrees with what the wallet just did. Confirmed live 2026-08-25:
  // on-chain state was correct within moments of every join/leave in this
  // session, the "still shows 0" complaints were purely this UI waiting on
  // a network call that simply hadn't resolved yet by the time it was
  // looked at. refresh() still runs right after in GuildsPage (reconciles
  // fees/other members/anything else that changed), this only removes the
  // one number a click itself can answer without asking the network at all.
  const applyMembershipDelta = useCallback(
    (mint: string, founderWallet: string, delta: number, guildPdaHint: string) => {
      setOnChain((prev) => {
        const idx = prev.findIndex((g) => g.tokenMint === mint)
        if (idx === -1) {
          if (delta <= 0) return prev
          return [...prev, { guildPda: guildPdaHint, tokenMint: mint, founderWallet, memberCount: delta, totalFeesEarnedUsd: 0 }]
        }
        const next = [...prev]
        next[idx] = { ...next[idx], memberCount: Math.max(0, next[idx].memberCount + delta) }
        return next
      })
    },
    [],
  )

  return { guilds, loading, refresh: () => loadOnChain(true), applyMembershipDelta }
}
