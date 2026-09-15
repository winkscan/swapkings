import { PROGRAM_ID } from './pdas'

// Reuses the same api-key already embedded in VITE_RPC_ENDPOINT (see main.tsx)
// instead of adding a second env var for the same credential.
function heliusApiKey(): string | null {
  const endpoint = import.meta.env.VITE_RPC_ENDPOINT as string | undefined
  if (!endpoint) return null
  try {
    return new URL(endpoint).searchParams.get('api-key')
  } catch {
    return null
  }
}

interface HeliusTokenTransfer {
  fromUserAccount: string
  toUserAccount: string
  tokenAmount: number
  mint: string
}

interface HeliusTx {
  signature: string
  timestamp: number
  tokenTransfers?: HeliusTokenTransfer[]
}

export interface GuildFeeTx {
  signature: string
  blockTime: number
  mint: string
  founderWallet: string
  tokenAmountUi: number
}

// How many guild-fee rows the Fees Earned tab shows — no "load more"/infinite
// pagination, so nothing in the UI can trigger unbounded further calls.
const DISPLAY_LIMIT = 20

// Helius's Enhanced Transaction History API returns fully-parsed transactions
// (token balance changes already decoded) in ONE REST call — the only
// realistic way to build a "recent guild-fee transactions" feed without
// burning Helius credits on a separate getTransaction call per signature.
// Requests Helius's own max page size (100) since a single call costs the
// same regardless of how many of those 100 rows we actually keep — most
// program transactions aren't guild-fee ones (plain swaps, joins/leaves,
// sweeps), so pulling more raw rows per call raises the odds of finding a
// full 20 real guild-fee legs without needing a second call. Filtered
// client-side: any parsed token transfer whose destination wallet is one we
// already know is a real guild's founder (see founderWallets, built from
// on-chain Guild accounts useGuilds already fetched — no extra RPC call).
// Callers control *when* this runs (see useGuildFeeHistory.ts) — this
// function itself has no built-in cooldown, so it must never be wired to
// anything a user can click repeatedly.
export async function fetchGuildFeeTransactions(founderWallets: Set<string>): Promise<GuildFeeTx[]> {
  const apiKey = heliusApiKey()
  if (!apiKey || founderWallets.size === 0) return []

  const url = new URL(`https://api.helius.xyz/v0/addresses/${PROGRAM_ID.toBase58()}/transactions`)
  url.searchParams.set('api-key', apiKey)
  url.searchParams.set('limit', '100')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Helius history request failed: ${res.status}`)
  const txs: HeliusTx[] = await res.json()

  const rows: GuildFeeTx[] = []
  for (const tx of txs) {
    if (rows.length >= DISPLAY_LIMIT) break
    const leg = tx.tokenTransfers?.find((t) => founderWallets.has(t.toUserAccount))
    if (leg) {
      rows.push({
        signature: tx.signature,
        blockTime: tx.timestamp,
        mint: leg.mint,
        founderWallet: leg.toUserAccount,
        tokenAmountUi: leg.tokenAmount,
      })
    }
  }
  return rows
}
