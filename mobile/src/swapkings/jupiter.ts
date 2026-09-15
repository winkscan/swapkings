import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
} from '@solana/web3.js'
import { SWAP_LOOKUP_TABLE } from './pdas'
import { cacheWorkerUrl } from './cacheWorker'

// Real fix for a real finding, 2026-08-25: this used to call api.jup.ag
// directly with a Developer Platform API key attached via a VITE_* env var
// — Vite bakes those literally into the built client bundle, so the key was
// sitting in plaintext in swapkings.app's own deployed JS, extractable by
// anyone. Routes through the cache Worker's own /jup/* proxy instead (see
// cloudflare-worker/src/index.ts's handleJupiterProxy) — the key now lives
// only there, server-side. Falls back to calling api.jup.ag directly,
// unauthenticated (the shared 0.5 req/s public rate limit — see the git
// history of this comment for that story), only if the Worker URL isn't
// configured at all (e.g. local dev without VITE_CACHE_WORKER_URL set) —
// same "degrades, doesn't break" fallback pattern cacheWorker.ts's own
// fetchFromCache already uses elsewhere in this app.
function jupiterBase(): string {
  const base = cacheWorkerUrl()
  return base ? `${base}/jup` : 'https://api.jup.ag/swap/v1'
}

// Flat fee in basis points of the swap's output, before any RANK-tier discount
// is applied (see PlayerStats::discount_bps / discountBpsForVolumeCents).
// Collected by our own record_swap instruction directly (a real on-chain token
// transfer, split between the platform/guild founder/referrer — see
// record_swap.rs), NOT via Jupiter's own platformFeeBps/feeAccount mechanism —
// using both at once would double-charge the swapper.
export const PLATFORM_FEE_BPS = 20 // 0.2%

// Mirrors constants::MIN_FEE_AMOUNT in the Rust program (raw units of the output
// mint) — record_swap rejects any fee below this. Swaps whose (already
// discounted) fee would round under this just skip record_swap entirely (see
// swapExecutor.ts) rather than failing outright: the swap itself always goes
// through, it just doesn't count toward Lucky Score/guild/referrer.
export const MIN_FEE_AMOUNT = 1_000

interface JupiterInstruction {
  programId: string
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]
  data: string
}

export interface QuoteResponse {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  slippageBps: number
  priceImpactPct: string
  routePlan: unknown[]
  [key: string]: unknown
}

// Every swap here rides in the same atomic transaction as our own
// record_swap call (plus, for a brand-new/first-time-referred wallet, several
// init_if_needed ATAs record_swap itself needs) — that's on top of whatever
// accounts Jupiter's own route uses. Left unconstrained, Jupiter sometimes
// picks a multi-hop route that alone is fine but pushes the COMBINED
// transaction past Solana's 1232-byte packet limit, which throws deep inside
// @solana/web3.js's serialize() as a bare "encoding overruns Uint8Array" —
// confirmed live 2026-08-22 on a brand-new wallet's first swap (no error from
// Jupiter or our program at all; the tx never even reached simulate). Capping
// the route's own account budget trades a little routing optimality for
// reliably fitting — same fix Jupiter's own docs recommend for any caller
// that appends its own instructions.
export const MAX_JUPITER_ROUTE_ACCOUNTS = 24

// Fallback for swapExecutor's own retry-on-too-large path — a wallet already
// in a guild AND with a referrer adds 5 extra accounts (founder wallet+ATA,
// referrer wallet+ATA, the guild account itself) that can't be compressed
// via SWAP_LOOKUP_TABLE (they're per-wallet/per-mint, not shared static
// accounts — see create_lookup_table.cjs's own comment on what that table
// can and can't cover). Combined with a multi-hop route at the normal
// MAX_JUPITER_ROUTE_ACCOUNTS budget, this can still push the compiled
// message past Solana's 1232-byte limit — confirmed live 2026-08-26 on a
// wallet with both a guild and a referrer set ("too large: 1692 bytes").
// A smaller route budget on retry trades some price optimality for
// reliably fitting in the rare worst case.
export const MAX_JUPITER_ROUTE_ACCOUNTS_FALLBACK = 12

// Jupiter's own default account budget. A Token-2022 mint drags extra
// per-swap accounts into the route that a classic SPL mint doesn't — the
// Token-2022 program itself plus the mint's extension accounts — so even a
// plain single-hop Pump.fun AMM swap of a Token-2022 token can need ~28
// accounts, over our tight MAX_JUPITER_ROUTE_ACCOUNTS budget. Jupiter then
// answers NO_ROUTES_FOUND, which breaks BOTH directions with no quote shown
// at all (confirmed live 2026-09-10 on KILLER / 3d2Ui…pump: no route at
// maxAccounts=24, route fine at 28+). Only used as a one-shot widen when the
// tight budget genuinely finds nothing — see getQuote.
export const MAX_JUPITER_ROUTE_ACCOUNTS_LOOSE = 64

export async function getQuote(params: {
  inputMint: string
  outputMint: string
  amount: string
  slippageBps?: number
  // Overridable for swapExecutor's own too-large-transaction fallback (see
  // its own comment) — MAX_JUPITER_ROUTE_ACCOUNTS is the normal default, a
  // smaller value trades route optimality for a smaller compiled message.
  maxAccounts?: number
}): Promise<QuoteResponse> {
  const buildQuery = (maxAccounts: number) =>
    new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: String(params.slippageBps ?? 50),
      maxAccounts: String(maxAccounts),
    })

  const budget = params.maxAccounts ?? MAX_JUPITER_ROUTE_ACCOUNTS
  let res = await fetch(`${jupiterBase()}/quote?${buildQuery(budget).toString()}`)

  // Retry once with Jupiter's own default budget when the tight budget found
  // literally no route — this is what rescues Token-2022 mints (see
  // MAX_JUPITER_ROUTE_ACCOUNTS_LOOSE). Only when the caller didn't pin its
  // own budget (swapExecutor's too-large fallback does, and must stay tight),
  // and only on a real NO_ROUTES_FOUND, so a normal swap that routes fine at
  // 24 never pays for a second request. The execution path's
  // isTxTooLargeError fallback still guards the rare case where the looser
  // route plus record_swap plus init ATAs overflow the 1232-byte packet.
  if (!res.ok && params.maxAccounts === undefined) {
    const body = await res.text()
    if (!body.includes('NO_ROUTES_FOUND')) {
      throw new Error(`Jupiter quote failed: ${res.status} ${body}`)
    }
    res = await fetch(
      `${jupiterBase()}/quote?${buildQuery(MAX_JUPITER_ROUTE_ACCOUNTS_LOOSE).toString()}`,
    )
  }

  if (!res.ok) {
    throw new Error(`Jupiter quote failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

interface SwapInstructionsResponse {
  computeBudgetInstructions: JupiterInstruction[]
  setupInstructions: JupiterInstruction[]
  swapInstruction: JupiterInstruction
  cleanupInstruction?: JupiterInstruction
  otherInstructions?: JupiterInstruction[]
  addressLookupTableAddresses: string[]
}

export async function getSwapInstructions(params: {
  quoteResponse: QuoteResponse
  userPublicKey: string
}): Promise<SwapInstructionsResponse> {
  const res = await fetch(`${jupiterBase()}/swap-instructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: true,
    }),
  })
  if (!res.ok) {
    throw new Error(`Jupiter swap-instructions failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

function toTransactionInstruction(ix: JupiterInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, 'base64'),
  })
}

async function resolveLookupTables(
  connection: Connection,
  addresses: string[],
): Promise<AddressLookupTableAccount[]> {
  if (addresses.length === 0) return []
  const infos = await connection.getMultipleAccountsInfo(addresses.map((a) => new PublicKey(a)))
  return infos
    .map((info, i) => {
      if (!info) return null
      return new AddressLookupTableAccount({
        key: new PublicKey(addresses[i]),
        state: AddressLookupTableAccount.deserialize(info.data),
      })
    })
    .filter((x): x is AddressLookupTableAccount => x !== null)
}

// Builds a versioned transaction combining Jupiter's swap instructions with one or
// more of our own instructions (e.g. commitSwap), so the swap and the commit happen
// atomically in a single transaction without our program having to CPI into Jupiter.
export async function buildSwapAndCommitTx(params: {
  connection: Connection
  payer: PublicKey
  swapIx: SwapInstructionsResponse
  extraInstructions: TransactionInstruction[]
}): Promise<VersionedTransaction> {
  const { connection, payer, swapIx, extraInstructions } = params

  const instructions: TransactionInstruction[] = [
    ...swapIx.computeBudgetInstructions.map(toTransactionInstruction),
    ...swapIx.setupInstructions.map(toTransactionInstruction),
    toTransactionInstruction(swapIx.swapInstruction),
    ...(swapIx.cleanupInstruction ? [toTransactionInstruction(swapIx.cleanupInstruction)] : []),
    ...(swapIx.otherInstructions ?? []).map(toTransactionInstruction),
    ...extraInstructions,
  ]

  // Our own program's static-account table (see pdas.ts's SWAP_LOOKUP_TABLE)
  // alongside whatever ALTs Jupiter's own route already uses — both compress
  // the same way, so they can just be resolved together.
  const lookupTables = await resolveLookupTables(connection, [
    ...swapIx.addressLookupTableAddresses,
    SWAP_LOOKUP_TABLE.toBase58(),
  ])
  const { blockhash } = await connection.getLatestBlockhash()

  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lookupTables)

  return new VersionedTransaction(message)
}
