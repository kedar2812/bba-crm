import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/Brand'
import { IS_DASHBOARD, IS_LOCAL } from '@/lib/config'

export function AuthLayout({ title, sub, children, back, wide }: { title: ReactNode; sub?: ReactNode; children: ReactNode; back?: { to: string; label: string }; wide?: boolean }) {
  const home = IS_DASHBOARD && !IS_LOCAL ? `${window.location.protocol}//bbanetworking.com` : '/'
  return (
    <div className="min-h-[100dvh] bg-cream-100">
      <div className="relative overflow-hidden bg-ink-950 pt-safe">
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-[360px] w-[620px] -translate-x-1/2 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(224,168,46,.22), transparent 75%)' }} />
        <div className={`relative mx-auto px-5 pb-16 pt-5 ${wide ? 'max-w-xl' : 'max-w-md'}`}>
          <div className="flex h-10 items-center justify-between">
            <a href={home} aria-label="BBA home">
              <Wordmark animate />
            </a>
            {back && (
              <Link to={back.to} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-white/75 hover:bg-white/10 hover:text-white">
                <ArrowLeft className="h-4 w-4" /> {back.label}
              </Link>
            )}
          </div>
          <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mt-10 text-[30px] font-bold leading-tight text-white">
            {title}
          </motion.h1>
          {sub && (
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="mt-2 text-[15px] text-white/65">
              {sub}
            </motion.p>
          )}
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.45, delay: 0.05 }}
        className={`relative mx-auto -mt-8 px-4 pb-10 ${wide ? 'max-w-xl' : 'max-w-md'}`}
      >
        <div className="card p-5 sm:p-7">{children}</div>
      </motion.div>
    </div>
  )
}
