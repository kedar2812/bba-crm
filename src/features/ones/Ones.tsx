import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarClock, CalendarPlus, Check, Handshake, MapPin, Video, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Sheet } from '@/components/Sheet'
import { Avatar, Button, Disclosure, EmptyState, ErrorState, Input, ListSkeleton, ProgressBar, Segmented, StatusPill, Textarea, cx, itemVariants, listVariants } from '@/components/ui'
import { OnePhotoGallery } from '@/features/ones/OnePhotos'
import { emptyDetails } from '@/features/quickadd/forms'
import { useQuickAdd } from '@/features/quickadd/QuickAdd'
import { api, errorMessage } from '@/lib/api'
import { firstName, fmtDate, fmtDateTime, fmtShortDate, localDateTimeValue, parseDate } from '@/lib/format'
import { useRefreshAll } from '@/lib/session'
import type { OneToOne } from '@/lib/types'

type Tab = 'upcoming' | 'pending' | 'done'

function tabOf(o: OneToOne): Tab {
  if (o.effective_status === 'awaiting_confirmation') return 'pending'
  if (o.status === 'requested' || o.status === 'scheduled') return 'upcoming'
  return 'done'
}

function statusLine(o: OneToOne) {
  const n = firstName(o.other.full_name)
  if (o.status === 'requested') return o.can.respond ? `${n} wants to meet you` : `Waiting for ${n} to respond`
  if (o.effective_status === 'awaiting_confirmation') {
    if (o.can.confirm) return `Did you meet ${n}? Confirm it`
    if (o.can.mark_done) return 'Time has passed — mark it as done'
    return `Awaiting ${n}'s confirmation`
  }
  if (o.status === 'scheduled') return 'Scheduled'
  return ''
}

export default function Ones() {
  const [params, setParams] = useSearchParams()
  const qa = useQuickAdd()
  const q = useQuery({ queryKey: ['121s'], queryFn: () => api.get<{ items: OneToOne[]; month_done: number; target: number }>('121s') })
  const items = useMemo(() => q.data?.items ?? [], [q.data])
  const counts = useMemo(() => {
    const c = { upcoming: 0, pending: 0, done: 0 }
    items.forEach((o) => c[tabOf(o)]++)
    return c
  }, [items])
  const defaultTab: Tab = counts.pending > 0 ? 'pending' : 'upcoming'
  const tab = (['upcoming', 'pending', 'done'].includes(params.get('tab') ?? '') ? params.get('tab') : defaultTab) as Tab
  const openId = Number(params.get('open')) || null
  const open = items.find((o) => o.id === openId) ?? null
  const list = items.filter((o) => tabOf(o) === tab).sort((a, b) => (tab === 'upcoming' ? a.meeting_at.localeCompare(b.meeting_at) : b.meeting_at.localeCompare(a.meeting_at)))
  const setOpen = (id: number | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('open', String(id))
    else p.delete('open')
    setParams(p, { replace: true })
  }

  const pct = q.data ? Math.min(100, Math.round((q.data.month_done / Math.max(1, q.data.target)) * 100)) : 0

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">121s</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => qa.open('request121')}>
            Request
          </Button>
          <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => qa.open('121')}>
            Log
          </Button>
        </div>
      </div>

      {q.data && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-card bg-ink-950 p-5 text-white">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[12.5px] font-medium text-white/60">This month</p>
              <p className="mt-1 font-display text-[26px] font-bold leading-none">
                {q.data.month_done} <span className="text-[16px] font-semibold text-white/50">of {q.data.target} done</span>
              </p>
            </div>
            <span className="font-display text-[20px] font-bold text-gold-300 tabular">{pct}%</span>
          </div>
          <div className="mt-4 [&>div]:bg-white/10">
            <ProgressBar value={q.data.month_done} max={q.data.target} />
          </div>
        </motion.div>
      )}

      <Segmented
        className="mt-4"
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={[
          { value: 'upcoming', label: `Upcoming${counts.upcoming ? ` · ${counts.upcoming}` : ''}` },
          { value: 'pending', label: `To confirm${counts.pending ? ` · ${counts.pending}` : ''}` },
          { value: 'done', label: 'History' },
        ]}
      />

      <div className="mt-4">
        {q.isLoading && <ListSkeleton />}
        {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
        {q.data && list.length === 0 && (
          <EmptyState
            icon={<Handshake className="h-6 w-6" />}
            title={tab === 'upcoming' ? 'No upcoming 121s' : tab === 'pending' ? 'Nothing to confirm' : 'No past 121s yet'}
            sub={tab === 'upcoming' ? 'Request a 121 with a member to get to know their business.' : tab === 'pending' ? "You're all caught up." : 'Completed meetings will appear here.'}
            action={tab !== 'pending' ? <Button onClick={() => qa.open(tab === 'upcoming' ? 'request121' : '121')}>{tab === 'upcoming' ? 'Request a 121' : 'Log a 121'}</Button> : undefined}
          />
        )}
        {list.length > 0 && (
          <motion.div key={tab} variants={listVariants} initial="hidden" animate="show" className="card divide-y divide-line overflow-hidden">
            {list.map((o) => (
              <motion.button key={o.id} variants={itemVariants} type="button" onClick={() => setOpen(o.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-cream-50 active:bg-cream-100">
                <Avatar src={o.other.photo_url} name={o.other.full_name} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{o.other.full_name}</p>
                  <p className="truncate text-[13px] text-ink-600">
                    {fmtDateTime(o.meeting_at)} · {o.mode === 'online' ? 'Online' : 'In person'}
                  </p>
                  {statusLine(o) && <p className={cx('mt-0.5 truncate text-[12.5px] font-medium', o.can.confirm || o.can.respond || o.can.mark_done ? 'text-gold-700' : 'text-ink-400')}>{statusLine(o)}</p>}
                </div>
                <StatusPill status={o.effective_status} label={o.effective_status === 'awaiting_confirmation' ? 'To confirm' : undefined} />
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>

      <OneSheet o={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function OneSheet({ o, onClose }: { o: OneToOne | null; onClose: () => void }) {
  const refresh = useRefreshAll()
  const qc = useQueryClient()
  const [mode, setMode] = useState<null | 'reschedule' | 'mark' | 'confirm'>(null)
  const [at, setAt] = useState('')
  const [details, setDetails] = useState(emptyDetails)
  const [notes, setNotes] = useState('')

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: Record<string, unknown> }) => api.post(path, body),
    onMutate: async ({ path, body }) => {
      // Optimistic confirm: flip the status in the cached list right away.
      if (path !== '121s/confirm' || !o) return
      await qc.cancelQueries({ queryKey: ['121s'] })
      const prev = qc.getQueryData<{ items: OneToOne[] }>(['121s'])
      if (prev) {
        const status = body.action === 'confirm' ? 'completed' : 'cancelled'
        qc.setQueryData(['121s'], { ...prev, items: prev.items.map((x) => (x.id === o.id ? { ...x, status, effective_status: status, can: { ...x.can, confirm: false } } : x)) })
      }
      return { prev }
    },
    onSuccess: (_d, v) => {
      const msgs: Record<string, string> = {
        '121s/respond': v.body.action === 'accept' ? '121 accepted' : v.body.action === 'decline' ? '121 declined' : 'New time suggested',
        '121s/mark-done': 'Sent for confirmation',
        '121s/confirm': v.body.action === 'confirm' ? '121 confirmed — it counts for both of you' : 'Marked as not happened',
        '121s/cancel': '121 cancelled',
      }
      toast.success(msgs[v.path] ?? 'Done')
      setMode(null)
      setDetails(emptyDetails)
      setNotes('')
      refresh()
      onClose()
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['121s'], ctx.prev)
      toast.error(errorMessage(e))
    },
  })

  const close = () => {
    setMode(null)
    onClose()
  }

  return (
    <Sheet open={!!o} onClose={close} title={o ? `121 with ${firstName(o.other.full_name)}` : ''}>
      {o && (
        <div className="space-y-5 pt-1">
          <Link to={`/app/members/${o.other.id}`} className="flex items-center gap-3 rounded-card border border-line bg-white p-3">
            <Avatar src={o.other.photo_url} name={o.other.full_name} size={46} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{o.other.full_name}</p>
              <p className="truncate text-[13px] text-ink-600">{o.other.business_name}</p>
            </div>
            <StatusPill status={o.effective_status} />
          </Link>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[12px] bg-cream-100 p-3">
              <p className="flex items-center gap-1.5 text-[12px] text-ink-600">
                <CalendarClock className="h-3.5 w-3.5" /> When
              </p>
              <p className="mt-1 text-[14px] font-semibold">{fmtDateTime(o.meeting_at)}</p>
            </div>
            <div className="rounded-[12px] bg-cream-100 p-3">
              <p className="flex items-center gap-1.5 text-[12px] text-ink-600">
                {o.mode === 'online' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />} Where
              </p>
              <p className="mt-1 text-[14px] font-semibold">{o.mode === 'online' ? 'Online' : 'In person'}</p>
            </div>
          </div>

          {o.request_message && <p className="rounded-[12px] border border-line bg-white p-3 text-[14px] italic text-ink-800">“{o.request_message}”</p>}
          {(o.business_discussed || o.products_introduced || o.referrals_exchanged || o.follow_up_actions || o.my_notes || o.their_notes) && (
            <div className="space-y-2.5 rounded-[12px] border border-line bg-white p-4 text-[14px]">
              {o.business_discussed && <Detail label="Business discussed" text={o.business_discussed} />}
              {o.products_introduced && <Detail label="Products introduced" text={o.products_introduced} />}
              {o.referrals_exchanged && <Detail label="Referrals exchanged" text={o.referrals_exchanged} />}
              {o.follow_up_actions && <Detail label="Follow-up actions" text={o.follow_up_actions} />}
              {o.my_notes && <Detail label="Your notes" text={o.my_notes} />}
              {o.their_notes && <Detail label={`${firstName(o.other.full_name)}'s notes`} text={o.their_notes} />}
            </div>
          )}

          <OnePhotoGallery oneId={o.id} photos={o.photos ?? []} canAdd={o.status !== 'declined' && o.status !== 'cancelled'} />

          {o.waiting_on_other && <p className="text-center text-[13.5px] text-ink-600">Waiting for {firstName(o.other.full_name)}.</p>}

          {/* Respond to a request */}
          {o.can.respond && mode !== 'reschedule' && (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: '121s/respond', body: { id: o.id, action: 'accept' } })}>
                Accept
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const d = parseDate(o.meeting_at) ?? new Date()
                  setAt(localDateTimeValue(d < new Date() ? new Date(Date.now() + 86400000) : d))
                  setMode('reschedule')
                }}
              >
                New time
              </Button>
              <Button variant="ghost" className="text-danger" onClick={() => act.mutate({ path: '121s/respond', body: { id: o.id, action: 'decline' } })}>
                Decline
              </Button>
            </div>
          )}
          {mode === 'reschedule' && (
            <div className="space-y-3">
              <Input label="Suggest another time" type="datetime-local" min={localDateTimeValue(new Date())} value={at} onChange={(e) => setAt(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode(null)}>
                  Back
                </Button>
                <Button className="flex-1" loading={act.isPending} onClick={() => act.mutate({ path: '121s/respond', body: { id: o.id, action: 'reschedule', meeting_at: at } })}>
                  Send new time
                </Button>
              </div>
            </div>
          )}

          {/* Mark as done (scheduled + time passed) */}
          {o.can.mark_done && (
            <div className="space-y-3">
              <p className="text-[14px] text-ink-700">The meeting time has passed. Mark it as done and {firstName(o.other.full_name)} will be asked to confirm.</p>
              <Disclosure title="Add meeting notes">
                <Textarea label="Business discussed" optional rows={2} value={details.business_discussed} onChange={(e) => setDetails({ ...details, business_discussed: e.target.value })} />
                <Textarea label="Products / services introduced" optional rows={2} value={details.products_introduced} onChange={(e) => setDetails({ ...details, products_introduced: e.target.value })} />
                <Textarea label="Referrals exchanged" optional rows={2} value={details.referrals_exchanged} onChange={(e) => setDetails({ ...details, referrals_exchanged: e.target.value })} />
                <Textarea label="Follow-up actions" optional rows={2} value={details.follow_up_actions} onChange={(e) => setDetails({ ...details, follow_up_actions: e.target.value })} />
                <Textarea label="Notes" optional rows={2} value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} />
              </Disclosure>
              <Button block size="lg" loading={act.isPending} icon={<Check className="h-4 w-4" />} onClick={() => act.mutate({ path: '121s/mark-done', body: { id: o.id, ...details } })}>
                Mark as done
              </Button>
            </div>
          )}

          {/* Confirm */}
          {o.can.confirm && (
            <div className="space-y-3">
              <p className="text-[15px] font-semibold">
                Did you meet {firstName(o.other.full_name)} on {fmtShortDate(o.meeting_at)}?
              </p>
              <Textarea label="Your notes" optional rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" loading={act.isPending} icon={<Check className="h-4 w-4" />} onClick={() => act.mutate({ path: '121s/confirm', body: { id: o.id, action: 'confirm', notes } })}>
                  Confirm
                </Button>
                <Button size="lg" variant="outline" icon={<X className="h-4 w-4" />} onClick={() => act.mutate({ path: '121s/confirm', body: { id: o.id, action: 'reject', notes } })}>
                  Didn't happen
                </Button>
              </div>
            </div>
          )}

          {o.can.cancel && !o.can.respond && (
            <Button variant="ghost" block className="text-danger" onClick={() => act.mutate({ path: '121s/cancel', body: { id: o.id } })}>
              Cancel this 121
            </Button>
          )}
          {o.status === 'completed' && o.confirmed_at && <p className="text-center text-[13px] text-ink-600">Confirmed on {fmtDate(o.confirmed_at)}{o.force_confirmed ? ' by an admin' : ''}.</p>}
          <p className="text-center text-[11.5px] text-ink-400">{o.code}</p>
        </div>
      )}
    </Sheet>
  )
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-ink-600">{label}</p>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  )
}
