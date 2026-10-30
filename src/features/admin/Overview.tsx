import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, CountUp, ErrorState, Segmented, Skeleton, itemVariants, listVariants } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { inrCompact, waLink } from '@/lib/format'
import { AdminTitle, useRangePicker } from './shared'

const Chart = lazy(() => import('../dashboard/Chart'))
const HBar = lazy(() => import('./HBar'))

interface Overview {
  stats: {
    members_total: number
    members_active: number
    pending_applications: number
    referrals_given: number
    business_referred: number
    business_closed: number
    ones_done: number
    visitors_invited: number
    visitors_joined: number
  }
  trend: { label: string; referrals: number; business: number; ones: number }[]
  trend_grain: 'day' | 'week' | 'month' | 'year'
  by_category: { name: string; value: number }[]
  top: { id: number; full_name: string; business_name: string; value: number }[]
  zero_activity: { id: number; full_name: string; business_name: string; mobile: string; photo_url: string | null }[]
}

export default function AdminOverview() {
  const { range, picker } = useRangePicker()
  const [trend, setTrend] = useState<'referrals' | 'business' | 'ones'>('referrals')
  const q = useQuery({ queryKey: ['admin', 'overview', range.from, range.to], queryFn: () => api.get<Overview>('admin/overview', { from: range.from, to: range.to }), placeholderData: (p) => p })
  const d = q.data
  const s = d?.stats
  const cards = s
    ? [
        { l: 'Total members', v: s.members_total },
        { l: 'Active members', v: s.members_active },
        { l: 'Pending applications', v: s.pending_applications, to: '/admin/applications', hot: s.pending_applications > 0 },
        { l: 'Referrals passed', v: s.referrals_given },
        { l: 'Est. business referred', v: s.business_referred, money: true },
        { l: 'Confirmed business closed', v: s.business_closed, money: true, dark: true },
        { l: 'Completed 121s', v: s.ones_done },
        { l: 'Visitors → joined', v: s.visitors_invited, extra: `${s.visitors_joined} joined${s.visitors_invited ? ` · ${Math.round((s.visitors_joined / s.visitors_invited) * 100)}%` : ''}` },
      ]
    : []

  return (
    <div className="page">
      <AdminTitle title="Overview" sub="Association-wide numbers. Totals count each deal once." action={picker} />
      {q.isError && !d && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {!d && !q.isError && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      )}
      {d && (
        <>
          <motion.div variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => {
              const body = (
                <>
                  <p className={`text-[12.5px] font-semibold ${c.dark ? 'text-white/60' : 'text-ink-600'}`}>{c.l}</p>
                  <p className={`mt-2 font-display text-[24px] font-bold leading-none ${c.dark ? 'text-gold-300' : ''}`}>
                    <CountUp value={c.v} format={c.money ? inrCompact : undefined} />
                  </p>
                  {c.extra && <p className="mt-1.5 text-[12px] text-ink-600">{c.extra}</p>}
                </>
              )
              const cls = `block rounded-card p-4 ${c.dark ? 'bg-ink-950 text-white' : 'card'} ${c.hot ? 'ring-2 ring-gold-500' : ''}`
              return (
                <motion.div key={c.l} variants={itemVariants}>
                  {c.to ? (
                    <Link to={c.to} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </motion.div>
              )
            })}
          </motion.div>

          <section className="mt-7">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-[17px] font-bold">Trend <span className="text-[13px] font-medium text-ink-600">· selected period, by {d.trend_grain}</span></h2>
              <Segmented value={trend} onChange={setTrend} className="sm:w-72" options={[{ value: 'referrals', label: 'Referrals' }, { value: 'business', label: 'Business ₹' }, { value: 'ones', label: '121s' }]} />
            </div>
            <div className="card p-3 pt-4">
              <Suspense fallback={<Skeleton className="h-[220px]" />}>
                <Chart data={d.trend} money={trend === 'business'} series={[{ key: trend, label: trend === 'referrals' ? 'Referrals' : trend === 'business' ? 'Business' : '121s' }]} />
              </Suspense>
            </div>
          </section>

          <div className="mt-7 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 text-[17px] font-bold">Business by category</h2>
              <div className="card p-4">
                {d.by_category.length === 0 ? (
                  <p className="py-6 text-center text-[14px] text-ink-600">No closed business in this period.</p>
                ) : (
                  <Suspense fallback={<Skeleton className="h-[240px]" />}>
                    <HBar data={d.by_category} />
                  </Suspense>
                )}
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-[17px] font-bold">Top 10 by business given</h2>
              <div className="card divide-y divide-line overflow-hidden">
                {d.top.length === 0 && <p className="p-5 text-center text-[14px] text-ink-600">No closed business in this period.</p>}
                {d.top.map((t, i) => (
                  <Link key={t.id} to={`/admin/members/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-cream-50">
                    <span className="w-5 text-center font-display text-[14px] font-bold text-ink-400">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{t.full_name}</p>
                      <p className="truncate text-[12px] text-ink-600">{t.business_name}</p>
                    </div>
                    <span className="font-display text-[14px] font-bold tabular">{inrCompact(t.value)}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-7">
            <h2 className="mb-1 text-[17px] font-bold">No activity this month ({d.zero_activity.length})</h2>
            <p className="mb-3 text-[13px] text-ink-600">Members with no referrals, 121s or visitors this month — a gentle nudge from the committee may help.</p>
            {d.zero_activity.length === 0 ? (
              <p className="card p-5 text-center text-[14px] text-ink-600">Everyone has been active this month. 🎉</p>
            ) : (
              <div className="card divide-y divide-line overflow-hidden">
                {d.zero_activity.map((z) => (
                  <div key={z.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar src={z.photo_url} name={z.full_name} size={34} />
                    <Link to={`/admin/members/${z.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{z.full_name}</p>
                      <p className="truncate text-[12px] text-ink-600">{z.business_name}</p>
                    </Link>
                    <a href={waLink(z.mobile)} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold hover:border-ink-300">
                      WhatsApp
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
