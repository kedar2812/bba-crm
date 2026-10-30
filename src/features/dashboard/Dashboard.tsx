import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight, Bell, CalendarCheck, ChevronRight, HeartHandshake, IndianRupee, Link2, MapPin, MessageSquareQuote, Send, Trophy, UserPlus } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Avatar, CountUp, ErrorState, Input, ProgressRing, Segmented, Select, Skeleton, cx, itemVariants, listVariants } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { firstName, fmtClock, greeting, inrCompact, parseDate, relTime, todayISO } from '@/lib/format'
import { useMe } from '@/lib/session'
import type { Meeting } from '@/lib/types'

const Chart = lazy(() => import('./Chart'))

interface Cards {
  referrals_given: number
  referrals_received: number
  business_received: number
  business_given: number
  ones_done: number
  visitors_invited: number
}
interface DashData {
  from: string
  to: string
  label: string
  cards: Cards
  prev: Cards | null
  month_ones: number
  targets: { ones: number; referrals: number }
  attention: { kind: string; title: string; sub: string; link: string }[]
  chart: { label: string; given: number; received: number; biz_received: number; biz_given: number }[]
  chart_grain: 'day' | 'week' | 'month' | 'year'
  next_meeting: Meeting | null
  activity: { at: string; text: string; kind: string; link: string; photo_url: string | null; name: string }[]
  top: { id: number; full_name: string; business_name: string; total: number; photo_url: string | null }[]
  testimonials: { count: number; latest: { body: string; author_name: string } | null }
  attendance_quarter: number | null
}

const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
]

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function daysUntil(date: Date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const n = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - today.getTime()) / 86400000)
  return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`
}

/** The next chapter meeting, pinned at the top of the dashboard. */
function NextMeeting({ m }: { m: Meeting }) {
  const d = parseDate(m.meeting_date)
  if (!d) return null
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 overflow-hidden rounded-card bg-ink-950 text-white">
      <Link to="/app/meetings" className="flex items-center gap-4 p-4 sm:p-5">
        <div className="flex h-[64px] w-[60px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-gold-500 text-ink-950">
          <span className="text-[11px] font-bold tracking-wider">{MONTHS[d.getMonth()]}</span>
          <span className="font-display text-[26px] font-bold leading-none">{d.getDate()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-gold-300">
            Next meeting <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] normal-case tracking-normal text-white/85">{daysUntil(d)}</span>
          </p>
          <p className="mt-1 truncate text-[16.5px] font-bold leading-tight">{m.title}</p>
          <p className="mt-0.5 text-[13.5px] text-white/75">
            {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtClock(m.start_time)}
          </p>
          {m.venue && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-white/60">
              <MapPin className="h-3.5 w-3.5 shrink-0" /> {m.venue}
            </p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-white/40" />
      </Link>
      {m.online_link && (
        <a href={m.online_link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 border-t border-white/10 py-2.5 text-[13.5px] font-semibold text-gold-300 hover:bg-white/5">
          <Link2 className="h-4 w-4" /> Join online
        </a>
      )}
    </motion.div>
  )
}

const GRAIN = { day: 'by day', week: 'by week', month: 'by month', year: 'by year' }

function Delta({ cur, prev }: { cur: number; prev: number | undefined }) {
  if (prev === undefined) return null
  if (cur === prev) return <span className="text-[11.5px] font-medium text-ink-400">— same</span>
  const up = cur > prev
  return <span className={cx('text-[11.5px] font-semibold tabular', up ? 'text-success' : 'text-danger')}>{up ? '▲' : '▼'} vs prev</span>
}

function StatCard({ label, value, prev, money, icon, to, extra }: { label: string; value: number; prev?: number; money?: boolean; icon: ReactNode; to: string; extra?: ReactNode }) {
  const nav = useNavigate()
  return (
    <motion.button
      variants={itemVariants}
      whileTap={{ scale: 0.98 }}
      type="button"
      onClick={() => nav(to)}
      className="card flex min-h-[118px] flex-col justify-between p-4 text-left transition-shadow hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-semibold leading-tight text-ink-600">{label}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-cream-100 text-gold-700">{icon}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-[26px] font-bold leading-none tracking-[-0.02em]">
            <CountUp value={value} format={money ? inrCompact : undefined} />
          </p>
          <div className="mt-1.5 h-4">
            <Delta cur={value} prev={prev} />
          </div>
        </div>
        {extra}
      </div>
    </motion.button>
  )
}

export default function Dashboard() {
  const me = useMe().data?.member
  const [params, setParams] = useSearchParams()
  const period = params.get('period') ?? 'this_month'
  const custom = period === 'custom'
  const from = params.get('from') ?? todayISO().slice(0, 8) + '01'
  const to = params.get('to') ?? todayISO()
  const [chartMode, setChartMode] = useState<'count' | 'money'>('count')
  const q = useQuery({
    queryKey: ['dashboard', period, custom ? from : '', custom ? to : ''],
    queryFn: () => api.get<DashData>('dashboard', custom ? { period, from, to } : { period }),
    placeholderData: (p) => p,
  })
  const d = q.data
  const setPeriod = (p: string) => setParams(p === 'this_month' ? {} : p === 'custom' ? { period: p, from, to } : { period: p }, { replace: true })
  const setDate = (k: 'from' | 'to', v: string) => v && setParams({ period: 'custom', from, to, [k]: v }, { replace: true })

  return (
    <div className="page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[14px] font-medium text-ink-600">{greeting()},</p>
          <h1 className="page-title">{firstName(me?.full_name)}</h1>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <div className="sm:w-48">
            <Select aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-11">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          {custom && (
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="From" type="date" value={from} max={to} onChange={(e) => setDate('from', e.target.value)} className="h-11" />
              <Input aria-label="To" type="date" value={to} min={from} onChange={(e) => setDate('to', e.target.value)} className="h-11" />
            </div>
          )}
        </div>
      </div>

      {d?.next_meeting && <NextMeeting m={d.next_meeting} />}

      {q.isError && !d && (
        <div className="mt-5">
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </div>
      )}

      {!d && !q.isError && (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-card" />
          ))}
        </div>
      )}

      {d && (
        <>
          <motion.div variants={listVariants} initial="hidden" animate="show" className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Referrals given" value={d.cards.referrals_given} prev={d.prev?.referrals_given} icon={<ArrowUpRight className="h-4 w-4" />} to="/app/referrals?tab=given" />
            <StatCard label="Referrals received" value={d.cards.referrals_received} prev={d.prev?.referrals_received} icon={<ArrowDownLeft className="h-4 w-4" />} to="/app/referrals?tab=received" />
            <StatCard label="Business received" value={d.cards.business_received} prev={d.prev?.business_received} money icon={<IndianRupee className="h-4 w-4" />} to="/app/referrals?tab=closed" />
            <StatCard label="Business given" value={d.cards.business_given} prev={d.prev?.business_given} money icon={<HeartHandshake className="h-4 w-4" />} to="/app/referrals?tab=closed" />
            <StatCard
              label="121s done"
              value={d.cards.ones_done}
              prev={d.prev?.ones_done}
              icon={<CalendarCheck className="h-4 w-4" />}
              to="/app/121s?tab=done"
              extra={
                <div className="relative -mb-1 -mr-1 flex items-center justify-center" title={`${d.month_ones} of ${d.targets.ones} this month`}>
                  <ProgressRing value={d.month_ones} max={d.targets.ones} size={42} />
                  <span className="absolute text-[10px] font-bold tabular">
                    {d.month_ones}/{d.targets.ones}
                  </span>
                </div>
              }
            />
            <StatCard label="Visitors invited" value={d.cards.visitors_invited} prev={d.prev?.visitors_invited} icon={<UserPlus className="h-4 w-4" />} to="/app/visitors" />
          </motion.div>
          {d.attendance_quarter !== null && (
            <p className="mt-3 text-[13px] text-ink-600">
              Attendance this quarter: <span className="font-semibold text-ink-950">{d.attendance_quarter}%</span>
            </p>
          )}

          {d.attention.length > 0 && (
            <section className="mt-7">
              <h2 className="mb-3 flex items-center gap-2 text-[17px] font-bold">
                Needs your attention
                <span className="rounded-full bg-gold-500 px-2 text-[12px] font-bold leading-5 text-ink-950">{d.attention.length}</span>
              </h2>
              <motion.div variants={listVariants} initial="hidden" animate="show" className="card divide-y divide-line overflow-hidden">
                {d.attention.map((a, i) => (
                  <motion.div key={i} variants={itemVariants}>
                    <Link to={a.link} className="flex items-center gap-3 px-4 py-3.5 hover:bg-cream-50 active:bg-cream-100">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                        {a.kind.startsWith('121') ? <CalendarCheck className="h-4 w-4" /> : a.kind === 'followup' ? <Bell className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-semibold">{a.title}</p>
                        <p className="truncate text-[13px] text-ink-600">{a.sub}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}

          <div className="mt-7 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <section className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-bold">Trend</h2>
                  <p className="truncate text-[12.5px] text-ink-600">
                    {d.label} · {GRAIN[d.chart_grain]}
                  </p>
                </div>
                <Segmented value={chartMode} onChange={setChartMode} className="w-[200px] shrink-0" options={[{ value: 'count', label: 'Referrals' }, { value: 'money', label: 'Business ₹' }]} />
              </div>
              <div className="card p-3 pt-4">
                <Suspense fallback={<Skeleton className="h-[220px]" />}>
                  {chartMode === 'count' ? (
                    <Chart data={d.chart} series={[{ key: 'given', label: 'Given' }, { key: 'received', label: 'Received' }]} />
                  ) : (
                    <Chart money data={d.chart} series={[{ key: 'biz_received', label: 'Received' }, { key: 'biz_given', label: 'Given' }]} />
                  )}
                </Suspense>
                <div className="flex justify-center gap-5 pb-1 pt-2 text-[12px] text-ink-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-gold-500" />
                    {chartMode === 'count' ? 'Given' : 'Received'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-ink-950" />
                    {chartMode === 'count' ? 'Received' : 'Given'}
                  </span>
                </div>
              </div>
            </section>

            <section className="min-w-0">
              <div className="mb-3">
                <h2 className="flex items-center gap-2 text-[17px] font-bold">
                  <Trophy className="h-4 w-4 text-gold-600" /> Top contributors
                </h2>
                <p className="truncate text-[12.5px] text-ink-600">{d.label}</p>
              </div>
              <div className="card divide-y divide-line overflow-hidden">
                {d.top.length === 0 && <p className="p-5 text-center text-[14px] text-ink-600">{period === 'this_month' ? 'No business closed yet this month. Be the first!' : 'No business closed in this period.'}</p>}
                {d.top.map((t, i) => (
                  <Link key={t.id} to={`/app/members/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
                    <span className={cx('w-5 text-center font-display text-[15px] font-bold', i === 0 ? 'text-gold-600' : 'text-ink-400')}>{i + 1}</span>
                    <Avatar src={t.photo_url} name={t.full_name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold">{t.full_name}</p>
                      <p className="truncate text-[12.5px] text-ink-600">{t.business_name}</p>
                    </div>
                    <span className="font-display text-[14px] font-bold tabular">{inrCompact(t.total)}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-7 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <section>
              <h2 className="mb-3 text-[17px] font-bold">Recent activity</h2>
              <div className="card divide-y divide-line overflow-hidden">
                {d.activity.length === 0 && <p className="p-5 text-center text-[14px] text-ink-600">Your activity will show up here.</p>}
                {d.activity.map((a, i) => (
                  <Link key={i} to={a.link} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50">
                    <Avatar src={a.photo_url} name={a.name} size={34} />
                    <p className="min-w-0 flex-1 text-[14px] leading-snug">{a.text}</p>
                    <span className="shrink-0 text-[12px] text-ink-400">{relTime(a.at)}</span>
                  </Link>
                ))}
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-[17px] font-bold">Testimonials received</h2>
              <Link to={`/app/members/${me?.id}`} className="card block p-5 hover:shadow-lift">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-ink-950 text-gold-300">
                    <MessageSquareQuote className="h-5 w-5" />
                  </span>
                  <p className="font-display text-[26px] font-bold leading-none">{d.testimonials.count}</p>
                </div>
                {d.testimonials.latest ? (
                  <blockquote className="mt-4 text-[14.5px] leading-relaxed text-ink-800">
                    “{d.testimonials.latest.body}”<footer className="mt-2 text-[13px] font-semibold text-ink-600">— {d.testimonials.latest.author_name}</footer>
                  </blockquote>
                ) : (
                  <p className="mt-3 text-[14px] text-ink-600">No testimonials yet. Great 121s are the best way to earn them.</p>
                )}
              </Link>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
