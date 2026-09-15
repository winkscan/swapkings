import { useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faQuestion } from '@fortawesome/free-solid-svg-icons'
import { cacheWorkerUrl } from '../cacheWorker'
import { dexscreenerIconUrl } from '../jupiterInfo'

// Many pump.fun-era token icons resolve to a raw IPFS gateway URL (ipfs.io,
// cloudflare-ipfs.com, etc). Those gateways are individually fine (server
// returns 200, proper bytes) but flaky in aggregate — confirmed live
// 2026-08-25: on one real user's network, EVERY public IPFS gateway tested
// (8 total: ipfs.io, cloudflare-ipfs.com, dweb.link, pinata, w3s.link,
// filebase, 4everland, trustless-gateway.link) failed outright
// (`TypeError: Failed to fetch`, no HTTP response at all) even though the
// exact same mint's Jupiter API lookup succeeded — i.e. the network/browser
// was blocking IPFS gateway traffic specifically, not a dead icon. No
// client-side gateway substitution can fix that (already tried all of the
// above). Routing through our own cache Worker (see cloudflare-worker's
// /icon route) fetches the image from Cloudflare's edge instead of the
// user's own network, and doubles as a shared edge cache for every visitor.
function proxiedIconUrl(url: string): string {
  const base = cacheWorkerUrl()
  return base ? `${base}/icon?url=${encodeURIComponent(url)}` : url
}

// Shared icon-circle used by TokenBadge and every token-picker row. Tries,
// in order: DexScreener's CDN (deterministic from the mint, reliable even
// for the launchpad tokens whose Jupiter-reported icon is flaky), then
// Jupiter's own `icon` through the cache-Worker proxy, then that same icon
// direct. Falls back to a gray circle + question mark once every candidate
// (or none at all) fails — previously a failed load just left an invisible
// gap.
export function TokenIcon({
  icon,
  mint,
  alt,
  size,
}: {
  icon?: string
  mint?: string
  alt: string
  size: number
}) {
  const candidates = useMemo(() => {
    const list: string[] = []
    if (mint) list.push(dexscreenerIconUrl(mint))
    if (icon) {
      list.push(proxiedIconUrl(icon))
      list.push(icon)
    }
    return list
  }, [mint, icon])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [candidates.join('|')])

  const src = candidates[index]
  const handleError = () => setIndex((i) => i + 1)
  const showImg = Boolean(src)

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: showImg ? 'transparent' : 'var(--border-strong)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {showImg ? (
        <img src={src} alt={alt} width={size} height={size} style={{ display: 'block' }} onError={handleError} />
      ) : (
        <FontAwesomeIcon icon={faQuestion} style={{ fontSize: size * 0.45, color: 'var(--text-secondary)' }} />
      )}
    </div>
  )
}
