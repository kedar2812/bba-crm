import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '@/lib/session'
import { cx } from './ui'

let openCount = 0

/**
 * Bottom sheet on phones (drag the handle down to dismiss), centered dialog on
 * desktop. Spring per spec: stiffness 400, damping 35. Backdrop fades.
 */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const desktop = useMediaQuery('(min-width: 768px)')
  const controls = useDragControls()
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    openCount++
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      openCount = Math.max(0, openCount - 1)
      if (openCount === 0) document.body.style.overflow = ''
    }
  }, [open, onClose])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose()
  }

  const spring = { type: 'spring' as const, stiffness: 400, damping: 35 }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-ink-950/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={cx(
              'relative flex w-full flex-col bg-cream-50 shadow-lift',
              'max-h-[92dvh] rounded-t-[22px] md:max-h-[86vh] md:rounded-[20px]',
              wide ? 'md:max-w-2xl' : 'md:max-w-lg',
            )}
            initial={desktop || reduce ? { opacity: 0, scale: reduce ? 1 : 0.97 } : { y: '100%' }}
            animate={desktop || reduce ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={desktop || reduce ? { opacity: 0, scale: reduce ? 1 : 0.97 } : { y: '100%' }}
            transition={desktop ? { duration: 0.18, ease: [0.16, 1, 0.3, 1] } : spring}
            drag={desktop || reduce ? false : 'y'}
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            <div className="shrink-0 touch-none select-none" onPointerDown={(e) => !desktop && controls.start(e)}>
              <div className="flex justify-center pt-2.5 md:hidden">
                <span className="h-1.5 w-10 rounded-full bg-ink-950/15" />
              </div>
              <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 md:pt-5">
                <h2 className="text-[19px] font-bold leading-tight">{title}</h2>
                <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-600 hover:bg-ink-950/5">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && <div className="shrink-0 border-t border-line bg-cream-50 px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:pb-4 md:rounded-b-[20px]">{footer}</div>}
            {!footer && <div className="pb-safe md:hidden" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
