import { PublicKey, type Connection } from '@solana/web3.js'
import type { Program } from '@coral-xyz/anchor'

// Helius bills classic getProgramAccounts at 10 credits/call vs. 1 credit/call
// for getProgramAccountsV2 — same filters, same semantics, just a cheaper
// method name (confirmed live against Helius's own docs, 2026-08-24). Every
// call site in this app that used to call program.account.<x>.all() (which
// always calls the classic method internally — @solana/web3.js's Connection
// class has no way to redirect it) now goes through this instead. Not a
// Solana-standard RPC method, so there's no typed Connection method for it;
// this talks to the RPC endpoint directly, same technique already used in
// ../cloudflare-worker/src/index.ts.
export interface RawProgramAccount {
  pubkey: PublicKey
  data: Buffer
}

export interface GpaV2Filter {
  memcmp?: { offset: number; bytes: string }
  dataSize?: number
}

async function getProgramAccountsV2(
  connection: Connection,
  programId: PublicKey,
  filters: GpaV2Filter[],
): Promise<RawProgramAccount[]> {
  const all: RawProgramAccount[] = []
  let paginationKey: string | undefined
  // Helius's own docs are explicit: a page smaller than `limit` does NOT by
  // itself mean there's no more data — only an empty page means done. Loop
  // for real instead of assuming one page covers everything forever (it
  // does today, at this project's account counts, but this stays correct
  // as those counts grow).
  for (let i = 0; i < 50; i++) {
    const res = await fetch(connection.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getProgramAccountsV2',
        params: [
          programId.toBase58(),
          { encoding: 'base64', filters, limit: 10_000, ...(paginationKey ? { paginationKey } : {}) },
        ],
      }),
    })
    if (!res.ok) throw new Error(`getProgramAccountsV2 failed: ${res.status}`)
    const json = (await res.json()) as {
      result?: { accounts: { pubkey: string; account: { data: [string, string] } }[]; paginationKey: string | null }
      error?: { message: string }
    }
    if (json.error) throw new Error(`getProgramAccountsV2 RPC error: ${json.error.message}`)
    const { accounts, paginationKey: nextKey } = json.result!
    for (const { pubkey, account } of accounts) {
      all.push({ pubkey: new PublicKey(pubkey), data: Buffer.from(account.data[0], 'base64') })
    }
    if (accounts.length === 0 || !nextKey) break
    paginationKey = nextKey
  }
  return all
}

// Drop-in cheaper replacement for `program.account.<accountName>.all()` —
// same discriminator-memcmp filter Anchor's own `.all()` builds internally
// (via the coder's own `.memcmp()` helper, so this can never drift from
// whatever discriminator Anchor actually expects), decoded with the same
// coder Anchor's typed `.all()` would have used. `accountName` must be the
// lowercase-first name Anchor's coder itself uses internally (e.g. 'guild',
// 'playerStats') — the same string already used as `program.account.<name>`
// elsewhere in this codebase, not the PascalCase name from the raw IDL json.
export async function fetchAllAccountsV2<T>(
  connection: Connection,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>,
  accountName: string,
  // Extra filters beyond the account-type discriminator — e.g. a memcmp on
  // a specific field's own offset (referrer, founder wallet, etc). Applied
  // server-side alongside the discriminator match, same as passing a second
  // filter to Anchor's own `.all([...])`.
  extraFilters: GpaV2Filter[] = [],
  // Overrides Anchor's own coder for the actual byte decode — used by
  // callers decoding Guild/PlayerStats manually (see accountDecode.ts's own
  // comment: a real Hermes-only crash confirmed inside the Anchor coder's
  // decode chain, 2026-09-11). The discriminator memcmp below still goes
  // through the coder — that's a simple synchronous lookup, not the deep
  // nested layout traversal that's actually been seen to crash.
  decode?: (data: Buffer) => T,
): Promise<{ publicKey: PublicKey; account: T }[]> {
  const discriminatorFilter = program.coder.accounts.memcmp(accountName)
  const raw = await getProgramAccountsV2(connection, program.programId, [
    { memcmp: discriminatorFilter },
    ...extraFilters,
  ])
  return raw.map(({ pubkey, data }) => ({
    publicKey: pubkey,
    account: decode ? decode(data) : (program.coder.accounts.decode(accountName, data) as T),
  }))
}
