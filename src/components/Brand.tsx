import { motion } from 'framer-motion'
import { cx } from './ui'

/** The official BBA seal (gold on black, round). 160px source covers up to 80px at 2x; larger uses the 512px file. */
export function Logo({ size = 40, className, animate = false }: { size?: number; className?: string; animate?: boolean }) {
  return (
    <motion.img
      src={size > 80 ? '/logo.png' : '/logo-160.png'}
      width={size}
      height={size}
      alt="Burhani Business Association"
      draggable={false}
      className={cx('block shrink-0 select-none rounded-full', className)}
      style={{ width: size, height: size }}
      initial={animate ? { opacity: 0, scale: 0.85 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', bounce: 0.25, duration: 0.6 }}
    />
  )
}

/** Seal plus the "BBA" name, for headers. */
export function Wordmark({ light = true, size = 'md', animate = false }: { light?: boolean; size?: 'sm' | 'md' | 'lg'; animate?: boolean }) {
  const px = { sm: 32, md: 40, lg: 96 }[size]
  if (size === 'lg') return <Logo size={px} animate={animate} />
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={px} animate={animate} className="ring-1 ring-gold-500/40" />
      <span className={cx('font-display font-extrabold leading-none tracking-[-0.03em]', size === 'sm' ? 'text-[19px]' : 'text-[22px]', light ? 'text-white' : 'text-ink-950')}>BBA</span>
    </span>
  )
}
