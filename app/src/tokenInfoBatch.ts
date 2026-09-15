import { getTokenInfos, type TokenInfo } from './jupiterInfo'

// TokenBadge (and the swap-success modal's guild-founder-symbol lookup) each
// used to call getTokenInfos with just their OWN single mint the instant
// they mounted — fine in isolation, but a page like Houses renders a dozen+
// TokenBadges at once, firing that many simultaneous 1-mint requests and
// tripping Jupiter's rate limit on lite-api.jup.ag. Some land, some 429 —
// confirmed live 2026-08-25: a Houses screenshot showing MET's real icon
// next to "?" placeholders on every other row in the same table, all
// mounted in the same render pass. getTokenInfos already accepts a mint
// LIST specifically so a page like this can ask for all of them in one
// call (see its own `query=${mints.join(',')}`) — this just collects every
// request that fires within the same tick and actually sends that one
// combined call, instead of every caller "batching" itself, alone.
let pending = new Map<string, Array<(info: TokenInfo | null) => void>>()
let flushScheduled = false

function flush() {
  flushScheduled = false
  const batch = pending
  pending = new Map()
  const mints = Array.from(batch.keys())
  getTokenInfos(mints)
    .then((infos) => {
      for (const [mint, resolvers] of batch) {
        const info = infos[mint] ?? null
        for (const resolve of resolvers) resolve(info)
      }
    })
    .catch(() => {
      for (const resolvers of batch.values()) {
        for (const resolve of resolvers) resolve(null)
      }
    })
}

export function getTokenInfoBatched(mint: string): Promise<TokenInfo | null> {
  return new Promise((resolve) => {
    const existing = pending.get(mint)
    if (existing) {
      existing.push(resolve)
    } else {
      pending.set(mint, [resolve])
    }
    if (!flushScheduled) {
      flushScheduled = true
      // A macrotask (not a microtask) so every effect from the SAME render
      // commit has already run and enqueued its own mint before this fires —
      // React flushes all of a commit's effects synchronously before
      // yielding back to the event loop, so by the time any timer callback
      // (even 0ms) runs, every TokenBadge mounted in that pass has already
      // called in.
      setTimeout(flush, 0)
    }
  })
}
