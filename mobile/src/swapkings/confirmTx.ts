import type { Connection } from '@solana/web3.js'

const CONFIRMATION_RANK: Record<string, number> = { processed: 0, confirmed: 1, finalized: 2 }

// Manual signature-status polling instead of connection.confirmTransaction()
// — that method subscribes over a WebSocket derived from the HTTP RPC
// endpoint (wss://<same host>/rpc — see @solana/web3.js's own
// makeWebsocketUrl), and our RPC endpoint (the cache Worker's /rpc proxy,
// see cloudflare-worker/src/index.ts) only speaks plain HTTP, no WebSocket
// upgrade handling at all. web3.js's own confirmation logic gates its HTTP
// polling fallback behind that WS subscription reaching "subscribed" first
// (see its getTransactionConfirmationPromise's subscriptionSetupPromise) —
// if that never happens, the whole `await confirmTransaction(...)` just
// hangs for real, for as long as ~90s (until the blockhash's own expiry
// kicks in via a SEPARATE poll), not a quick fallback. Confirmed live
// 2026-08-25: a referral-code claim's wallet approval visibly succeeded
// on-chain (a retry correctly said "already claimed") while the original
// call's own confirmTransaction() never returned at all, leaving the UI
// stuck on "Getting your link…" indefinitely.
export async function confirmSignature(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  commitment: 'confirmed' | 'finalized' = 'confirmed',
): Promise<void> {
  const targetRank = CONFIRMATION_RANK[commitment]
  // 2000ms, not 1000ms: each tick is 2 Helius RPC calls (getSignatureStatuses
  // + getBlockHeight), and this loop runs on every join/leave/claim/swap
  // confirmation now that WS-based confirmTransaction() can't be used against
  // this proxy (see this file's own comment above) — halving the poll rate
  // roughly halves both Helius credit spend and Cloudflare Worker request
  // count for this path, for a barely-noticeable ~1s difference in perceived
  // confirmation time.
  const POLL_MS = 2000
  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature])
    const status = value[0]
    if (status) {
      if (status.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`)
      }
      const rank = CONFIRMATION_RANK[status.confirmationStatus ?? 'processed'] ?? 0
      if (rank >= targetRank) return
    }
    const blockHeight = await connection.getBlockHeight(commitment)
    if (blockHeight > lastValidBlockHeight) {
      throw new Error('Transaction expired (blockhash no longer valid) before confirmation was observed')
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}
