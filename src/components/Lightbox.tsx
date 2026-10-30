import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download, Loader2, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './ui'

export interface LightboxImage {
  src: string
  /** URL that downloads the file (served with Content-Disposition: attachment). */
  download: string
  canDelete?: boolean
}

const MAX_ZOOM = 5

/**
 * Full-screen photo viewer. Pinch, scroll-wheel or double-tap to zoom, drag to pan,
 * swipe (or arrow keys) between photos, and download or delete from the top bar.
 */
export function Lightbox({ images, index, onIndex, onClose, onDelete }: { images: LightboxImage[]; index: number | null; onIndex: (i: number) => void; onClose: () => void; onDelete?: (i: number) => void }) {
  const open = index !== null && index < images.length
  const [armed, setArmed] = useState(false)
  useEffect(() => setArmed(false), [index])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Capture phase on window runs before a parent Sheet's own Escape handler.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      } else if (e.key === 'ArrowRight' && index! < images.length - 1) onIndex(index! + 1)
      else if (e.key === 'ArrowLeft' && index! > 0) onIndex(index! - 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
    }
  }, [open, index, images.length, onClose, onIndex])

  const img = open ? images[index!] : null
  const go = (dir: 1 | -1) => {
    const n = index! + dir
    if (n >= 0 && n < images.length) onIndex(n)
  }
  const btn = 'flex h-11 w-11 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 active:bg-white/20'

  return createPortal(
    <AnimatePresence>
      {img && (
        <motion.div
          className="fixed inset-0 z-[70] flex flex-col bg-black/95 pt-safe pb-safe"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="relative z-10 flex h-14 shrink-0 items-center justify-between px-2 text-white">
            <span className="px-3 text-[14px] font-semibold tabular text-white/80">{images.length > 1 ? `${index! + 1} / ${images.length}` : ''}</span>
            <div className="flex items-center gap-1">
              <a href={img.download} download className={btn} aria-label="Download photo" title="Download">
                <Download className="h-5 w-5" />
              </a>
              {img.canDelete && onDelete && (
                <button
                  type="button"
                  onClick={() => (armed ? onDelete(index!) : setArmed(true))}
                  className={cx(btn, armed && 'w-auto gap-1.5 bg-danger px-3.5 text-[13px] font-semibold hover:bg-danger')}
                  aria-label={armed ? 'Tap again to delete' : 'Delete photo'}
                  title="Delete"
                >
                  <Trash2 className="h-5 w-5" />
                  {armed && 'Delete?'}
                </button>
              )}
              <button type="button" onClick={onClose} className={btn} aria-label="Close" title="Close">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <Stage key={img.src} src={img.src} onSwipe={go} />
            {index! > 0 && (
              <button type="button" onClick={() => go(-1)} className={cx(btn, 'absolute left-3 top-1/2 hidden -translate-y-1/2 bg-black/40 md:flex')} aria-label="Previous photo">
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {index! < images.length - 1 && (
              <button type="button" onClick={() => go(1)} className={cx(btn, 'absolute right-3 top-1/2 hidden -translate-y-1/2 bg-black/40 md:flex')} aria-label="Next photo">
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

type T = { s: number; x: number; y: number }
type Gesture = { kind: 'pan' | 'pinch'; sx: number; sy: number; t: T; dist: number; moved: boolean; at: number }

/** One zoomable photo. Transform is translate-then-scale around the photo's centre. */
function Stage({ src, onSwipe }: { src: string; onSwipe: (dir: 1 | -1) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const pic = useRef<HTMLImageElement>(null)
  const [t, setT] = useState<T>({ s: 1, x: 0, y: 0 })
  const [smooth, setSmooth] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const tRef = useRef(t)
  tRef.current = t
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const g = useRef<Gesture | null>(null)
  const lastTap = useRef(0)

  const clamp = (s: number, x: number, y: number): T => {
    const el = pic.current
    const b = box.current
    if (!el || !b) return { s, x, y }
    const mx = Math.max(0, (el.offsetWidth * s - b.clientWidth) / 2)
    const my = Math.max(0, (el.offsetHeight * s - b.clientHeight) / 2)
    return { s, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) }
  }
  /** Zoom to `ns`, keeping the point (px, py) — relative to the box centre — fixed. */
  const zoomAt = (ns: number, px = 0, py = 0, from: T = tRef.current) => {
    const s = Math.min(MAX_ZOOM, Math.max(1, ns))
    const k = s / from.s
    return clamp(s, px - (px - from.x) * k, py - (py - from.y) * k)
  }
  const animateTo = (next: T) => {
    setSmooth(true)
    setT(next)
  }
  const rel = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect()
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }
  }
  const pinchInfo = () => {
    const [a, b] = Array.from(pts.current.values())
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }
  const startPan = (p: { x: number; y: number }, moved = false) => {
    g.current = { kind: 'pan', sx: p.x, sy: p.y, t: tRef.current, dist: 0, moved, at: Date.now() }
  }

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = rel(e)
      setSmooth(false)
      setT(zoomAt(tRef.current.s * Math.exp(-e.deltaY * 0.0015), p.x, p.y))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') animateTo(zoomAt(tRef.current.s * 1.5))
      else if (e.key === '-') animateTo(zoomAt(tRef.current.s / 1.5))
      else if (e.key === '0') animateTo({ s: 1, x: 0, y: 0 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const down = (e: RPointerEvent) => {
    box.current!.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, rel(e))
    setSmooth(false)
    if (pts.current.size === 2) {
      const p = pinchInfo()
      g.current = { kind: 'pinch', sx: p.cx, sy: p.cy, t: tRef.current, dist: p.dist, moved: true, at: Date.now() }
    } else if (pts.current.size === 1) {
      startPan(rel(e))
    }
  }

  const move = (e: RPointerEvent) => {
    if (!pts.current.has(e.pointerId) || !g.current) return
    pts.current.set(e.pointerId, rel(e))
    const gs = g.current
    if (gs.kind === 'pinch' && pts.current.size >= 2) {
      // Keep the photo point that started under the fingers' midpoint under it now.
      const p = pinchInfo()
      const s = Math.min(MAX_ZOOM, Math.max(1, (gs.t.s * p.dist) / gs.dist))
      const k = s / gs.t.s
      setT(clamp(s, p.cx - (gs.sx - gs.t.x) * k, p.cy - (gs.sy - gs.t.y) * k))
      return
    }
    const p = rel(e)
    const dx = p.x - gs.sx
    const dy = p.y - gs.sy
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) gs.moved = true
    if (gs.t.s > 1) setT(clamp(gs.t.s, gs.t.x + dx, gs.t.y + dy))
    else setT({ s: 1, x: dx, y: 0 }) // swipe preview
  }

  const up = (e: RPointerEvent) => {
    if (!pts.current.has(e.pointerId)) return
    const p = rel(e)
    pts.current.delete(e.pointerId)
    const gs = g.current
    if (pts.current.size === 1) {
      // Pinch ended with one finger still down: carry on panning from it.
      startPan(Array.from(pts.current.values())[0], true)
      return
    }
    if (pts.current.size > 0 || !gs) return
    g.current = null
    const cur = tRef.current
    if (cur.s <= 1.01) {
      if (gs.kind === 'pan' && Math.abs(cur.x) > 60) onSwipe(cur.x < 0 ? 1 : -1)
      animateTo({ s: 1, x: 0, y: 0 })
    }
    if (!gs.moved && Date.now() - gs.at < 300) {
      const now = Date.now()
      if (now - lastTap.current < 320) {
        lastTap.current = 0
        animateTo(cur.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(2.5, p.x, p.y))
      } else {
        lastTap.current = now
      }
    }
  }

  const zoomBtn = 'flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 active:bg-white/20 disabled:opacity-30'

  return (
    <>
      <div
        ref={box}
        className="absolute inset-0 flex touch-none select-none items-center justify-center overflow-hidden"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ cursor: t.s > 1 ? 'grab' : 'zoom-in' }}
      >
        {!loaded && <Loader2 className="absolute h-7 w-7 animate-spin text-white/60" />}
        <img
          ref={pic}
          src={src}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={cx('max-h-full max-w-full object-contain transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
          style={{
            transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.s})`,
            transition: smooth ? 'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 150ms' : 'opacity 150ms',
            willChange: 'transform',
          }}
        />
      </div>
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-1.5 py-1 backdrop-blur">
        <button type="button" className={zoomBtn} disabled={t.s <= 1} onClick={() => animateTo(zoomAt(t.s / 1.6))} aria-label="Zoom out">
          <ZoomOut className="h-5 w-5" />
        </button>
        <button type="button" className="min-w-[52px] text-center text-[13px] font-semibold tabular text-white/85" onClick={() => animateTo({ s: 1, x: 0, y: 0 })} aria-label="Reset zoom">
          {Math.round(t.s * 100)}%
        </button>
        <button type="button" className={zoomBtn} disabled={t.s >= MAX_ZOOM} onClick={() => animateTo(zoomAt(t.s * 1.6))} aria-label="Zoom in">
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>
    </>
  )
}
