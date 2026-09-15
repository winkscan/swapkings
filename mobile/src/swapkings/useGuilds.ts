import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection, PublicKey } from '@solana/web3.js'
import { useConnection } from '../utils/ConnectionProvider'
import { useAuthorization } from '../utils/useAuthorization'
import { getProgram } from './anchorClient'
import {
  getPumpFunCandidates,
  getTokenMarketInfos,
  type PumpFunTokenInfo,
  type TokenMarketInfo,
} from './pumpfun'
import { fetchFromCache } from './cacheWorker'
import { fetchAllAccountsV2 } from './gpaV2'
import { decodeGuild, type RawGuild } from './accountDecode'

// On-chain Guild poll: background safety net only. The cache Worker's
// `/guilds` (hourly) is the default source; direct getProgramAccountsV2
// (1 Helius credit) is reserved for this wallet's own join/leave, where a
// stale cache would show your own action not having landed.
const ONCHAIN_POLL_MS = 60_000
// Discovery list fans out to several Jupiter endpoints — not Helius-metered,
// but Jupiter's lite-api rate-limits under repeated calls.
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
  marketCapUsd: number | undefined
}

async function fetchGuildsDirect(
  connection: Connection,
  owner: PublicKey | null,
): Promise<OnChainGuild[]> {
  const program = getProgram(connection, owner)
  // Manual decode (decodeGuild), not Anchor's coder — see accountDecode.ts's
  // own comment for why (a real Hermes-only crash in that coder's decode
  // chain, confirmed live 2026-09-11 on the single-account fetch path this
  // bulk one shares the same risk with).
  const all = await fetchAllAccountsV2<RawGuild>(connection, program, 'guild', [], decodeGuild)
  return all.map((g) => ({
    guildPda: g.publicKey.toBase58(),
    tokenMint: g.account.tokenMint.toBase58(),
    founderWallet: g.account.founderWallet.toBase58(),
    memberCount: g.account.memberCount,
    // Stored on-chain as USD x 10,000 (whole-cent precision truncated
    // small-swap shares to $0.00) — see Guild::total_fees_earned_usd_e4.
    totalFeesEarnedUsd: g.account.totalFeesEarnedUsdE4 / 10_000,
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

  for (const g of onChainByMint.values()) {
    rows.push({ ...g, symbol: '', marketCapUsd: undefined })
  }

  rows.sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1))
  return rows
}

// Jupiter's discovery ranking (see pumpfun.ts) supplies the browsable
// candidate list; on-chain Guild accounts (real member_count / fees, bumped
// directly by record_swap) override/augment wherever a guild actually exists.
export function useGuilds() {
  const { connection } = useConnection()
  const { selectedAccount } = useAuthorization()
  const owner = selectedAccount?.publicKey ?? null
  const [candidates, setCandidates] = useState<PumpFunTokenInfo[]>([])
  const [onChain, setOnChain] = useState<OnChainGuild[]>([])
  const [loading, setLoading] = useState(true)
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
      try {
        const list = await getPumpFunCandidates()
        if (!cancelled) setCandidates(list)
      } catch (err) {
        console.warn('useGuilds discovery failed:', err)
      }
    }
    loadDiscovery()
    const interval = setInterval(loadDiscovery, DISCOVERY_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // forceNextPollDirect guards a real race (web, 2026-08-25): a join/leave's
  // manual refresh reads fresh on-chain data, but the hourly cache would then
  // overwrite it back to stale on the next scheduled tick. One extra
  // guaranteed-direct poll after a manual refresh closes that window.
  const forceNextPollDirect = useRef(false)
  const loadOnChain = useCallback(
    async (isManualRefresh = false, isRetry = false) => {
      if (isFirstLoad.current) setLoading(true)
      const useDirect = isManualRefresh || forceNextPollDirect.current
      try {
        const rows = useDirect
          ? await fetchGuildsDirect(connection, owner)
          : (await fetchFromCache<{ guilds: OnChainGuild[] }>('/guilds'))?.guilds ??
            (await fetchGuildsDirect(connection, owner))
        if (mounted.current) setOnChain(rows)
        if (isManualRefresh) forceNextPollDirect.current = true
        else if (useDirect) forceNextPollDirect.current = false
      } catch (err) {
        console.warn('useGuilds loadOnChain failed:', err)
        if (!isRetry) {
          setTimeout(() => loadOnChain(isManualRefresh, true), 1500)
        }
      } finally {
        if (!isManualRefresh) isFirstLoad.current = false
        if (mounted.current) setLoading(false)
      }
    },
    [connection, owner],
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

  // Instant local ±1 correction for the affected guild's member_count, so the
  // number on screen agrees with what the wallet just did before refresh()'s
  // RPC round-trip resolves.
  const applyMembershipDelta = useCallback(
    (mint: string, founderWallet: string, delta: number, guildPdaHint: string) => {
      setOnChain((prev) => {
        const idx = prev.findIndex((g) => g.tokenMint === mint)
        if (idx === -1) {
          if (delta <= 0) return prev
          return [
            ...prev,
            {
              guildPda: guildPdaHint,
              tokenMint: mint,
              founderWallet,
              memberCount: delta,
              totalFeesEarnedUsd: 0,
            },
          ]
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
