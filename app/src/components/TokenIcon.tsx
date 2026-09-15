import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faQuestion } from '@fortawesome/free-solid-svg-icons'
import { cacheWorkerUrl } from '../cacheWorker'

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

// Shared icon-circle used by TokenBadge and every token-picker row. Falls
// back to a gray circle + question mark whenever there's no icon URL at all,
// or both the proxied and direct URLs fail to actually load (404, bad host,
// etc.) — previously a failed load just left an invisible gap.
export function TokenIcon({ icon, alt, size }: { icon?: string; alt: string; size: number }) {
  const [src, setSrc] = useState(icon ? proxiedIconUrl(icon) : icon)
  const [failed, setFailed] = useState(false)
  const [triedDirect, setTriedDirect] = useState(false)

  useEffect(() => {
    setSrc(icon ? proxiedIconUrl(icon) : icon)
    setFailed(false)
    setTriedDirect(false)
  }, [icon])

  const handleError = () => {
    // Proxy failed (Worker down, cold, whatever) — fall back to the direct
    // URL once before giving up entirely.
    if (!triedDirect && icon) {
      setTriedDirect(true)
      setSrc(icon)
      return
    }
    setFailed(true)
  }

  const showImg = Boolean(src) && !failed

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
