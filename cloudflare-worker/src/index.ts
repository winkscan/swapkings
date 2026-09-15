import * as ed25519 from '@noble/ed25519'

// Shared cache for the 3 "same data for every visitor" datasets that used
// to be fetched directly from Helius by EVERY user's own browser, on a
// timer, the whole time a page stayed open — the single biggest lever left
// after tightening client-side polling intervals (see project memory,
// 2026-08-21 Helius audit). This Worker hits Helius ONCE per cron tick,
// caches the result in KV, and serves it to every visitor via a plain
// `fetch()` — turns Helius cost for this data from O(users) into O(1),
// completely independent of how many people are looking or how long they
// leave a tab open.
//
// Deliberately does NOT use @solana/web3.js or @coral-xyz/anchor — both are
// Node-oriented and would bloat/complicate the Workers bundle for no real
// benefit here. Every call below is a plain JSON-RPC POST (getProgramAccounts)
// or REST GET (Helius Enhanced Transaction History), and every account's
// raw bytes are parsed manually at fixed offsets — same technique already
// used in scripts/migrate_player_stats.cjs. Keep offsets in sync with
// programs/solana-swap-rewards/src/state.rs if those structs ever change.

export interface Env {
  CACHE_KV: KVNamespace
  HELIUS_API_KEY: string
  // Base64-encoded 32-byte Ed25519 seed — set via `wrangler secret put
  // ATTESTATION_SIGNER_SEED`, never committed. Its public half is
  // ATTESTATION_SIGNER in programs/solana-swap-rewards/src/constants.rs —
  // see that constant's own comment for what this whole thing is for.
  ATTESTATION_SIGNER_SEED: string
  // Real audit finding, 2026-08-25: this key (and HELIUS_API_KEY above) used
  // to live in app/.env.local as a VITE_* var, which Vite bakes literally
  // into the built client JS bundle — confirmed live, both keys were sitting
  // in plaintext in swapkings.app's own deployed bundle, extractable by
  // anyone via a browser's dev tools. Now lives ONLY here, server-side (see
  // handleJupiterProxy below) — the client talks to this Worker's own /jup/*
  // routes instead of api.jup.ag directly.
  JUPITER_API_KEY: string
}

const PROGRAM_ID = 'C84oAsWU1whcVLNz2555DP12fBmE116LAiUYsCdkmwaD'

// From app/src/idl/solana_swap_rewards.json's accounts[].discriminator —
// re-derive from a fresh IDL build if these ever drift (they won't unless
// the account struct *names* change, which they haven't).
const GUILD_DISCRIMINATOR = [74, 176, 57, 164, 195, 188, 156, 237]
const PLAYER_STATS_DISCRIMINATOR = [169, 146, 242, 176, 102, 118, 231, 172]

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // 'solana-client' is required — @solana/web3.js's Connection attaches it to
  // every single RPC POST unconditionally (see its own COMMON_HTTP_HEADERS
  // constant). Missing it here isn't a cosmetic gap: the browser's CORS
  // preflight rejects the header, so the ACTUAL request never goes out at
  // all — confirmed live 2026-08-25, this silently broke every on-chain read
  // through /rpc (balances came back as "0", not an error) the moment
  // VITE_RPC_ENDPOINT was switched to this proxy.
  'Access-Control-Allow-Headers': 'Content-Type, solana-client',
  'Content-Type': 'application/json',
}

function heliusRpcUrl(apiKey: string) {
  return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

// Minimal base58 encoder (memcmp filters and Pubkey display both need it) —
// written inline rather than pulling in the `bs58` npm package, to keep
// this Worker dependency-free and its bundle tiny.
function base58Encode(bytes: Uint8Array): string {
  let digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let leadingZeros = 0
  for (const byte of bytes) {
    if (byte === 0) leadingZeros++
    else break
  }
  return (
    BASE58_ALPHABET[0].repeat(leadingZeros) +
    digits
      .reverse()
      .map((d) => BASE58_ALPHABET[d])
      .join('')
  )
}

// Inverse of base58Encode — needed to turn a mint/founder address string
// (query params, JSON from Jupiter's API) back into the raw 32 bytes the
// ed25519 attestation message signs over.
function base58Decode(input: string): Uint8Array {
  let bytes = [0]
  for (const char of input) {
    const value = BASE58_ALPHABET.indexOf(char)
    if (value === -1) throw new Error(`Invalid base58 character: ${char}`)
    let carry = value
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58
      bytes[i] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (const char of input) {
    if (char === BASE58_ALPHABET[0]) bytes.push(0)
    else break
  }
  return new Uint8Array(bytes.reverse())
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function readU64LE(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Number(view.getBigUint64(offset, true))
}

function readPubkey(bytes: Uint8Array, offset: number): string {
  return base58Encode(bytes.subarray(offset, offset + 32))
}

interface RawProgramAccount {
  pubkey: string
  account: { data: [string, string] }
}

// getProgramAccountsV2 instead of classic getProgramAccounts — same filters,
// same result shape (just wrapped in {accounts, paginationKey} instead of a
// bare array), 1 Helius credit/call instead of 10 (confirmed live against
// Helius's own docs, 2026-08-24). This cron already runs the classic call
// twice a tick (fetchGuilds + fetchAllTimeVolumeUsd) — a real, easy 10x cut
// on the one part of this Worker's own cost that scaling to more real guilds
// or players would otherwise grow.
async function getProgramAccountsByDiscriminator(
  apiKey: string,
  discriminator: number[],
): Promise<RawProgramAccount[]> {
  const all: RawProgramAccount[] = []
  let paginationKey: string | undefined
  // Helius's own docs are explicit: a page smaller than `limit` does NOT by
  // itself mean there's no more data — only an empty page means done.
  for (let i = 0; i < 50; i++) {
    const res = await fetch(heliusRpcUrl(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getProgramAccountsV2',
        params: [
          PROGRAM_ID,
          {
            encoding: 'base64',
            filters: [{ memcmp: { offset: 0, bytes: base58Encode(new Uint8Array(discriminator)) } }],
            limit: 10_000,
            ...(paginationKey ? { paginationKey } : {}),
          },
        ],
      }),
    })
    if (!res.ok) throw new Error(`getProgramAccountsV2 failed: ${res.status}`)
    const json = (await res.json()) as {
      result?: { accounts: RawProgramAccount[]; paginationKey: string | null }
      error?: { message: string }
    }
    if (json.error) throw new Error(`getProgramAccountsV2 RPC error: ${json.error.message}`)
    const { accounts, paginationKey: nextKey } = json.result ?? { accounts: [], paginationKey: null }
    all.push(...accounts)
    if (accounts.length === 0 || !nextKey) break
    paginationKey = nextKey
  }
  return all
}

interface GuildRow {
  guildPda: string
  tokenMint: string
  founderWallet: string
  memberCount: number
  totalFeesEarnedUsd: number
}

// Mirrors Guild's field layout in state.rs: token_mint(32) + founder_wallet(32)
// + member_count(u64) + total_fees_earned_usd_cents(u64) + bump(u8), all
// after the 8-byte discriminator.
async function fetchGuilds(apiKey: string): Promise<GuildRow[]> {
  const accounts = await getProgramAccountsByDiscriminator(apiKey, GUILD_DISCRIMINATOR)
  return accounts.map(({ pubkey, account }) => {
    const data = base64ToBytes(account.data[0])
    return {
      guildPda: pubkey,
      tokenMint: readPubkey(data, 8),
      founderWallet: readPubkey(data, 40),
      memberCount: readU64LE(data, 72),
      // Stored on-chain as USD x 10,000, not whole cents (see this project's
      // Guild::total_fees_earned_usd_e4 field comment — whole-cent precision
      // truncated small-swap shares straight to $0.00 on-chain).
      totalFeesEarnedUsd: readU64LE(data, 80) / 10_000,
    }
  })
}

// Mirrors PlayerStats' field layout: depositor(32) + cumulative_volume_cents(u64)
// at offset 40 — the only field this needs. Sums across every account that
// has ever existed, same as useAllTimeVolume.ts used to do per-visitor;
// here it's done once per cron tick regardless of how many people ask.
async function fetchAllTimeVolumeUsd(apiKey: string): Promise<number> {
  const accounts = await getProgramAccountsByDiscriminator(apiKey, PLAYER_STATS_DISCRIMINATOR)
  let totalCents = 0
  for (const { account } of accounts) {
    const data = base64ToBytes(account.data[0])
    totalCents += readU64LE(data, 40)
  }
  return totalCents / 100
}

interface GuildFeeRow {
  signature: string
  blockTime: number
  mint: string
  founderWallet: string
  tokenAmountUi: number
  usdAmount: number
}

const FEE_HISTORY_DISPLAY_LIMIT = 20

// Same approach as the old client-side heliusHistory.ts: one Enhanced
// Transaction History call, filtered client(-worker)-side to legs landing
// in a known guild founder's wallet. `founderWallets` comes from the guild
// list this same cron tick already fetched — no separate lookup needed.
async function fetchGuildFeeHistory(apiKey: string, founderWallets: Set<string>): Promise<GuildFeeRow[]> {
  if (founderWallets.size === 0) return []

  const url = new URL(`https://api.helius.xyz/v0/addresses/${PROGRAM_ID}/transactions`)
  url.searchParams.set('api-key', apiKey)
  url.searchParams.set('limit', '100')
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Helius history request failed: ${res.status}`)
  const txs: Array<{
    signature: string
    timestamp: number
    tokenTransfers?: Array<{ fromUserAccount: string; toUserAccount: string; tokenAmount: number; mint: string }>
  }> = await res.json()

  const rows: Omit<GuildFeeRow, 'usdAmount'>[] = []
  for (const tx of txs) {
    if (rows.length >= FEE_HISTORY_DISPLAY_LIMIT) break
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

  if (rows.length === 0) return []
  const mints = [...new Set(rows.map((r) => r.mint))]
  const priceRes = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`)
  const prices: Record<string, { usdPrice?: number }> = priceRes.ok ? await priceRes.json() : {}
  return rows.map((r) => ({ ...r, usdAmount: (prices[r.mint]?.usdPrice ?? 0) * r.tokenAmountUi }))
}

// Single combined cache entry instead of 3 separate KV keys — Cloudflare's
// free tier caps Workers KV at 1,000 PUT operations/day *total across the
// whole account*, and 3 puts/tick on a 2-minute cron alone was 3 * 720 =
// 2,160/day, blowing straight through that limit within 24h (confirmed live
// 2026-08-22 — every KV write started 429ing, "KV requests are temporarily
// blocked" from Cloudflare). One combined JSON blob under one key means this
// Worker's KV cost is exactly `ticks/day`, independent of how many separate
// datasets it happens to cache.
interface CachePayload {
  updatedAt: number
  guilds: GuildRow[]
  allTimeVolumeUsd: number
  guildFees: GuildFeeRow[]
}

async function refreshCache(env: Env): Promise<void> {
  const guilds = await fetchGuilds(env.HELIUS_API_KEY)
  const founderWallets = new Set(guilds.map((g) => g.founderWallet))
  const [allTimeVolumeUsd, guildFees] = await Promise.all([
    fetchAllTimeVolumeUsd(env.HELIUS_API_KEY),
    fetchGuildFeeHistory(env.HELIUS_API_KEY, founderWallets),
  ])

  const payload: CachePayload = { updatedAt: Date.now(), guilds, allTimeVolumeUsd, guildFees }
  await env.CACHE_KV.put('cache', JSON.stringify(payload))
}

const ROUTES = new Set(['/guilds', '/all-time-volume', '/guild-fees'])

// Real fix for a real security finding, 2026-08-25: join_guild used to trust
// a client-supplied founder_wallet with zero on-chain verification — anyone
// could call it directly (bypassing the frontend entirely) for any token
// whose Guild PDA hadn't been created yet, permanently redirecting up to 90%
// of every future member's swap fee to a wallet they chose. Reading
// pump.fun's own on-chain bonding-curve `creator` field was tried first and
// rejected: verified directly against two real mainnet tokens (UFD,
// Fartcoin) that field reads back as Pubkey::default() for both — it's only
// populated for tokens created after pump.fun added it, never backfilled,
// so it can't be trusted as the sole source for the token population this
// app actually needs to support today. This resolves a mint's real founder
// off-chain instead (Jupiter's token API `dev` field — confirmed live
// against Fartcoin's own known creator wallet) and signs an attestation the
// program verifies on-chain via ed25519 instruction introspection (see
// join_guild.rs's own comment on ATTESTATION_SIGNER for the full picture).
async function resolveRealFounder(mint: string): Promise<string | null> {
  const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`)
  if (!res.ok) return null
  const data = (await res.json()) as Array<{ id?: string; address?: string; dev?: string }>
  const token = data.find((t) => (t.id ?? t.address) === mint)
  return token?.dev ?? null
}

async function handleFounderAttestation(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const mint = url.searchParams.get('mint')
  const claimedFounder = url.searchParams.get('founder')
  if (!mint || !claimedFounder) {
    return new Response(JSON.stringify({ error: 'mint and founder query params are required' }), {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  let mintBytes: Uint8Array, founderBytes: Uint8Array
  try {
    mintBytes = base58Decode(mint)
    founderBytes = base58Decode(claimedFounder)
    if (mintBytes.length !== 32 || founderBytes.length !== 32) throw new Error('wrong length')
  } catch {
    return new Response(JSON.stringify({ error: 'mint/founder must be valid base58 pubkeys' }), {
      status: 400,
      headers: CORS_HEADERS,
    })
  }

  const realFounder = await resolveRealFounder(mint)
  if (!realFounder) {
    return new Response(JSON.stringify({ error: 'could not resolve this token\'s real founder' }), {
      status: 404,
      headers: CORS_HEADERS,
    })
  }
  if (realFounder !== claimedFounder) {
    return new Response(
      JSON.stringify({ error: 'founder mismatch — refusing to attest', realFounder }),
      { status: 403, headers: CORS_HEADERS },
    )
  }

  const seed = base64ToBytes(env.ATTESTATION_SIGNER_SEED)
  const message = new Uint8Array(64)
  message.set(mintBytes, 0)
  message.set(founderBytes, 32)

  const signature = await ed25519.signAsync(message, seed)
  const publicKey = await ed25519.getPublicKeyAsync(seed)

  return new Response(
    JSON.stringify({
      signature: bytesToBase64(signature),
      publicKey: base58Encode(publicKey),
    }),
    { headers: CORS_HEADERS },
  )
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// Token icons: Jupiter's own token API returns a mix of its own CDN
// (static.datapi.jup.ag — fine) and raw IPFS gateway URLs (ipfs.io,
// cloudflare-ipfs.com) for whichever tokens it hasn't mirrored. Confirmed
// live 2026-08-25: on at least one real user's network, EVERY public IPFS
// gateway tested (ipfs.io, cloudflare-ipfs.com, dweb.link, pinata, w3s.link,
// filebase, 4everland, trustless-gateway.link — 8 total) failed outright
// with no HTTP response at all (`TypeError: Failed to fetch`), while the
// exact same mint's Jupiter API lookup succeeded fine — i.e. this wasn't a
// dead/missing icon, the user's own network/browser was blocking IPFS
// gateway traffic specifically. No client-side URL substitution can fix
// that (already tried 8 alternates); fetching the image from Cloudflare's
// edge instead of the user's own network sidesteps it entirely. Allowlisted
// to known icon hosts only — this is a public URL with no auth, so without
// an allowlist it'd be an open image-fetching proxy for anyone.
const ICON_HOST_ALLOWLIST = new Set([
  'ipfs.io',
  'cloudflare-ipfs.com',
  'dweb.link',
  'nftstorage.link',
  'w3s.link',
  'gateway.pinata.cloud',
  'ipfs.filebase.io',
  '4everland.io',
  'trustless-gateway.link',
  'static.datapi.jup.ag',
  'arweave.net',
  // SOL/USDC and other well-known majors resolve their icon through
  // Solana's own official token-list repo, not a pump.fun-style IPFS
  // gateway — confirmed live 2026-08-25: missing this made SOL/USDC's own
  // icons 400 on the very first page load, unrelated to whatever else was
  // being tested at the time.
  'raw.githubusercontent.com',
])

async function handleIconProxy(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get('url')
  if (!target) return new Response('missing url param', { status: 400, headers: CORS_HEADERS })

  let targetUrl: URL
  try {
    targetUrl = new URL(target)
  } catch {
    return new Response('invalid url', { status: 400, headers: CORS_HEADERS })
  }
  if (targetUrl.protocol !== 'https:' || !ICON_HOST_ALLOWLIST.has(targetUrl.hostname)) {
    return new Response('host not allowed', { status: 400, headers: CORS_HEADERS })
  }

  // Cloudflare's edge cache, keyed on this Worker's own request URL — a
  // second visitor (or the same one on a repeat visit) asking for the same
  // icon hits cache instead of re-fetching upstream.
  const cache = caches.default
  const cacheKey = new Request(request.url, request)
  const cachedRes = await cache.match(cacheKey)
  if (cachedRes) return cachedRes

  const upstream = await fetch(targetUrl.toString())
  if (!upstream.ok || !upstream.body) {
    return new Response('upstream fetch failed', { status: 502, headers: CORS_HEADERS })
  }

  const res = new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'public, max-age=604800',
      'Access-Control-Allow-Origin': '*',
    },
  })
  // waitUntil isn't available here (no ExecutionContext in this helper) —
  // the caller awaits this before returning, which is fine: it's a single
  // cheap KV-less cache.put, not worth the plumbing to background it.
  await cache.put(cacheKey, res.clone())
  return res
}

// Real fix for a real finding, 2026-08-25: app/.env.local's
// VITE_RPC_ENDPOINT used to point straight at
// `https://mainnet.helius-rpc.com/?api-key=...` — Vite bakes every VITE_*
// var literally into the built client JS bundle, so that key was sitting in
// plaintext in swapkings.app's own deployed bundle, extractable by anyone
// via a browser's dev tools (confirmed live: `grep`'d the real API key
// straight out of the built dist/assets/*.js). The client now points
// VITE_RPC_ENDPOINT at THIS route instead — every @solana/web3.js
// Connection call (getAccountInfo, simulateTransaction, sendTransaction,
// the raw getProgramAccountsV2 calls in app/src/gpaV2.ts, everything) is a
// plain JSON-RPC POST to whatever URL the Connection was built with, so a
// pure pass-through here transparently covers every method already in use
// with no client-side method allowlist to maintain. No custom rate-limiting
// here on purpose — a KV-write-per-request limiter would itself blow the
// SAME 1,000-writes/day free-tier KV cap this project already hit once
// (see refreshCache's own comment) at completely ordinary swap volumes
// (each swap alone is several RPC calls). Relying on Cloudflare's own
// account-level DDoS/WAF protection (already on by default) as the baseline
// for now; a dashboard-level Rate Limiting Rule can be added later without
// touching this code if real abuse shows up.
async function handleRpcProxy(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('POST only', { status: 405, headers: CORS_HEADERS })
  }
  const body = await request.text()
  const upstream = await fetch(heliusRpcUrl(env.HELIUS_API_KEY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

const JUPITER_UPSTREAM_BASE = 'https://api.jup.ag/swap/v1'

// Same fix, same reasoning, for app/.env.local's VITE_JUPITER_API_KEY — see
// handleRpcProxy's own comment above and Env.JUPITER_API_KEY's. `jupPath` is
// pinned by the caller (see the two literal routes below) rather than taken
// from the request, so this can never be turned into an open proxy to
// arbitrary api.jup.ag paths.
async function handleJupiterProxy(request: Request, env: Env, jupPath: string): Promise<Response> {
  const url = new URL(request.url)
  const upstreamUrl = new URL(`${JUPITER_UPSTREAM_BASE}${jupPath}`)
  upstreamUrl.search = url.search

  const upstream = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.JUPITER_API_KEY,
    },
    body: request.method === 'POST' ? await request.text() : undefined,
  })
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

// Reshapes the one combined cache payload back into the per-route shape each
// route used to return on its own — keeps app/src/cacheWorker.ts and every
// hook reading from it (useGuilds.ts, useAllTimeVolume.ts, etc.) unchanged.
function routeResponse(path: string, payload: CachePayload): unknown {
  if (path === '/guilds') return { updatedAt: payload.updatedAt, guilds: payload.guilds }
  if (path === '/all-time-volume') return { updatedAt: payload.updatedAt, volumeUsd: payload.allTimeVolumeUsd }
  return { updatedAt: payload.updatedAt, rows: payload.guildFees }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshCache(env))
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })

    const path = new URL(request.url).pathname
    if (path === '/icon') return handleIconProxy(request)
    if (path === '/founder-attestation') return handleFounderAttestation(request, env)
    if (path === '/rpc') return handleRpcProxy(request, env)
    if (path === '/jup/quote') return handleJupiterProxy(request, env, '/quote')
    if (path === '/jup/swap-instructions') return handleJupiterProxy(request, env, '/swap-instructions')
    if (!ROUTES.has(path)) {
      return new Response(JSON.stringify({ error: 'not found', routes: [...ROUTES] }), {
        status: 404,
        headers: CORS_HEADERS,
      })
    }

    const cached = await env.CACHE_KV.get('cache')
    if (!cached) {
      // Cold start — nothing cached yet (worker just deployed, cron hasn't
      // run once). Trigger a fill and ask the caller to retry shortly
      // rather than blocking this request on a full refresh.
      return new Response(JSON.stringify({ error: 'cache warming up, retry shortly' }), {
        status: 503,
        headers: CORS_HEADERS,
      })
    }
    const payload = JSON.parse(cached) as CachePayload
    return new Response(JSON.stringify(routeResponse(path, payload)), { headers: CORS_HEADERS })
  },
}
