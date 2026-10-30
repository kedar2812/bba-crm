import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Search, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuickAdd } from '@/features/quickadd/QuickAdd'
import { Avatar, Button, Chips, EmptyState, ErrorState, ListSkeleton, Segmented, StatusPill, cx, itemVariants, listVariants } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { fmtShortDate, inr, inrCompact } from '@/lib/format'
import { useDebounced } from '@/lib/session'
import type { Paged, Referral } from '@/lib/types'

type Box = 'given' | 'received' | 'closed'

export function ReferralRow({ r }: { r: Referral }) {
  const other = r.direction === 'given' ? r.receiver : r.giver
  const value = r.status === 'won' ? r.final_value : r.estimated_value
  return (
    <Link to={`/app/referrals/${r.code}`} className={cx('flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-cream-50 active:bg-cream-100', r.is_void && 'opacity-60')}>
      <Avatar src={other.photo_url} name={other.full_name} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold">{other.full_name}</p>
        </div>
        <p className="truncate text-[13px] text-ink-600">
          {r.client_name ? `${r.client_name} · ` : ''}
          {r.requirement}
        </p>
        <p className="mt-0.5 text-[11.5px] text-ink-400">
          {r.code} · {fmtShortDate(r.status === 'won' && r.won_date ? r.won_date : r.referral_date)}
          {r.type === 'direct' && ' · Thank-you note'}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {value ? <span className="font-display text-[14px] font-bold tabular">{inrCompact(value)}</span> : <span className="h-5" />}
        {r.is_void ? <StatusPill status="void" /> : r.is_disputed ? <StatusPill status="disputed" /> : <StatusPill status={r.status} />}
      </div>
    </Link>
  )
}

export default function Referrals() {
  const [params, setParams] = useSearchParams()
  const box = (['given', 'received', 'closed'].includes(params.get('tab') ?? '') ? params.get('tab') : 'given') as Box
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const q = useDebounced(search, 250)
  const qa = useQuickAdd()
  const list = useQuery({
    queryKey: ['referrals', box, status, q, page],
    queryFn: () => api.get<Paged<Referral> & { totals?: { received: number; given: number } }>('referrals', { box, status: box === 'closed' ? '' : status, q, page }),
    placeholderData: keepPreviousData,
  })
  const data = list.data

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Referrals</h1>
        <Button size="sm" icon={<Send className="h-4 w-4" />} onClick={() => qa.open('referral')} className="hidden sm:inline-flex">
          Give a referral
        </Button>
      </div>
      <Segmented
        className="mt-4"
        value={box}
        onChange={(v) => {
          setParams({ tab: v }, { replace: true })
          setPage(1)
          setStatus('')
        }}
        options={[
          { value: 'given', label: 'Given' },
          { value: 'received', label: 'Received' },
          { value: 'closed', label: 'Business Closed' },
        ]}
      />

      {box === 'closed' && data?.totals && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-card bg-ink-950 p-4 text-white">
            <p className="text-[12px] font-medium text-white/60">You received</p>
            <p className="mt-1 font-display text-[22px] font-bold text-gold-300 tabular">{inr(data.totals.received)}</p>
          </div>
          <div className="card p-4">
            <p className="text-[12px] font-medium text-ink-600">You generated for others</p>
            <p className="mt-1 font-display text-[22px] font-bold tabular">{inr(data.totals.given)}</p>
          </div>
        </motion.div>
      )}

      <div className="mt-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="field h-11 pl-10"
            placeholder="Search client, need, member or code"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            enterKeyHint="search"
          />
        </div>
        {box !== 'closed' && (
          <Chips
            value={status}
            onChange={(v) => {
              setStatus(v)
              setPage(1)
            }}
            options={[
              { value: '', label: 'All' },
              { value: 'new', label: 'New' },
              { value: 'contacted', label: 'Contacted' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'won', label: 'Won' },
              { value: 'lost', label: 'Lost' },
            ]}
          />
        )}
      </div>

      <div className="mt-4">
        {list.isLoading && <ListSkeleton />}
        {list.isError && <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
        {data && data.items.length === 0 && (
          <EmptyState
            icon={<Send className="h-6 w-6" />}
            title={search || status ? 'Nothing matches' : box === 'given' ? 'No referrals given yet' : box === 'received' ? 'No referrals received yet' : 'No business closed yet'}
            sub={search || status ? 'Try a different search or filter.' : box === 'given' ? 'Give your first one — it takes under a minute.' : box === 'closed' ? 'Won referrals and thank-you notes appear here.' : 'Referrals other members pass to you appear here.'}
            action={
              !search && !status && box !== 'received' ? (
                <Button onClick={() => qa.open(box === 'closed' ? 'thanks' : 'referral')}>{box === 'closed' ? 'Send a thank-you note' : 'Give a referral'}</Button>
              ) : undefined
            }
          />
        )}
        {data && data.items.length > 0 && (
          <>
            <motion.div key={`${box}-${status}`} variants={listVariants} initial="hidden" animate="show" className="card divide-y divide-line overflow-hidden">
              {data.items.map((r) => (
                <motion.div key={r.id} variants={itemVariants}>
                  <ReferralRow r={r} />
                </motion.div>
              ))}
            </motion.div>
            {data.total > data.per_page && (
              <div className="mt-4 flex items-center justify-between">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <span className="text-[13px] text-ink-600">
                  Page {page} of {Math.ceil(data.total / data.per_page)}
                </span>
                <Button variant="outline" size="sm" disabled={page * data.per_page >= data.total} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
