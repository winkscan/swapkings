// Optional shared-cache Worker (see ../cloudflare-worker) for the 3
// datasets that are identical for every visitor — guild list, all-time
// volume, guild fee history. Unset in local dev against the local
// validator (the Worker only ever talks to real mainnet Helius), and every
// caller here falls back to a direct on-chain/Helius call if the URL is
// unset or the fetch itself fails, so nothing breaks if the Worker is ever
// down — it only stops being cheap, not functional.
export function cacheWorkerUrl(): string | null {
  const url = import.meta.env.VITE_CACHE_WORKER_URL as string | undefined
  return url && url.trim() ? url.replace(/\/$/, '') : null
}

export async function fetchFromCache<T>(path: string): Promise<T | null> {
  const base = cacheWorkerUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}${path}`)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export interface FounderAttestation {
  signature: string
  publicKey: string
}

// Only needed the very first time a token's House is created (see
// join_guild.rs's own comment on ATTESTATION_SIGNER for why) — the Worker
// resolves the mint's real founder itself and refuses to sign anything that
// doesn't match `founder`, so a caller can't just fetch an attestation for a
// founder wallet they made up. Throws with the Worker's own error message on
// a real mismatch/failure — deliberately NOT silently returning null like
// fetchFromCache above, since a caller here needs to know WHY house
// creation can't proceed rather than have it fail silently or fall back to
// an unattested join.
export async function getFounderAttestation(mint: string, founder: string): Promise<FounderAttestation> {
  const base = cacheWorkerUrl()
  if (!base) {
    throw new Error('Cache Worker URL not configured — cannot verify this crew\'s founder.')
  }
  const res = await fetch(`${base}/founder-attestation?mint=${mint}&founder=${founder}`)
  const body = (await res.json().catch(() => ({}))) as { error?: string; signature?: string; publicKey?: string }
  if (!res.ok || !body.signature || !body.publicKey) {
    throw new Error(body.error ?? `Founder attestation failed (${res.status})`)
  }
  return { signature: body.signature, publicKey: body.publicKey }
}
