import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons'

// Tap-to-toggle popover instead of the native `title` attribute — `title`
// never shows on a tap on mobile (only some browsers reveal it on a
// long-press), so the same info icon needs its own click handling to work on
// both desktop and touch devices.
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onOutside)
    document.addEventListener('touchstart', onOutside)
    return () => {
      document.removeEventListener('click', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [open])

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        aria-label="More info"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 6,
          margin: -6,
          display: 'inline-flex',
          alignItems: 'center',
          color: 'var(--text-tertiary)',
          cursor: 'help',
        }}
      >
        <FontAwesomeIcon icon={faCircleInfo} size="sm" />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            width: 190,
            maxWidth: '65vw',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 400,
            textTransform: 'none',
            letterSpacing: 'normal',
            color: 'var(--text-secondary)',
            textAlign: 'left',
            zIndex: 20,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          }}
        >
          {text}
        </div>
      )}
    </span>
  )
}
