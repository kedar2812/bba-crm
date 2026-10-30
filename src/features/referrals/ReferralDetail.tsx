import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, ArrowRight, Bell, FileText, Mail, MessageSquare, Pencil, Phone, Upload } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Sheet } from '@/components/Sheet'
import { Avatar, Button, ErrorState, Input, MoneyInput, Skeleton, StatusPill, Textarea, cx } from '@/components/ui'
import { API_BASE } from '@/lib/config'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { fmtDate, fmtDateTime, inr, todayISO } from '@/lib/format'
import { useRefreshAll } from '@/lib/session'
import type { RefStatus, ReferralDetail as Detail } from '@/lib/types'

const FLOW: { value: RefStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[13.5px] text-ink-600">{label}</span>
      <span className="text-right text-[14.5px] font-medium">{children}</span>
    </div>
  )
}

export default function ReferralDetail() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const refresh = useRefreshAll()
  const q = useQuery({ queryKey: ['referral', code], queryFn: () => api.get<Detail>('referrals/view', { code }) })
  const r = q.data
  const [sheet, setSheet] = useState<null | 'won' | 'lost' | 'dispute' | 'edit'>(null)
  const [note, setNote] = useState('')
  const [shimmer, setShimmer] = useState(false)

  const done = () => {
    refresh()
    qc.invalidateQueries({ queryKey: ['referral', code] })
  }

  const status = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('referrals/status', { code, ...body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ['referral', code] })
      const prev = qc.getQueryData<Detail>(['referral', code])
      if (prev) qc.setQueryData(['referral', code], { ...prev, status: body.status as RefStatus })
      return { prev }
    },
    onError: (e, _b, ctx) => {
      if (ctx?.prev) qc.setQueryData(['referral', code], ctx.prev)
      toast.error(errorMessage(e))
    },
    onSuccess: (_d, body) => {
      if (body.status === 'won') {
        setShimmer(true)
        toast.success('Marked as Won — thank you sent')
      } else toast.success('Status updated')
      setSheet(null)
      done()
    },
  })

  const addNote = useMutation({
    mutationFn: () => api.post('referrals/note', { code, body: note }),
    onSuccess: () => {
      setNote('')
      done()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const followup = useMutation({
    mutationFn: (due: string | null) => api.post('referrals/followup', { code, due_date: due }),
    onSuccess: (_d, due) => {
      toast.success(due ? `Reminder set for ${fmtDate(due)}` : 'Follow-up cleared')
      done()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (q.isLoading)
    return (
      <div className="page space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    )
  if (q.isError || !r)
    return (
      <div className="page">
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </div>
    )

  const iAmGiver = r.direction === 'given'
  const pill = r.is_void ? 'void' : r.is_disputed ? 'disputed' : r.status

  return (
    <div className="page max-w-3xl">
      <button type="button" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/app/referrals'))} className="-ml-2 mb-2 inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[14px] font-medium text-ink-600 hover:bg-ink-950/5">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <motion.div className={cx('card overflow-hidden', shimmer && 'gold-shimmer')} onAnimationEnd={() => setShimmer(false)}>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-semibold tracking-wide text-ink-400">{r.code}</span>
            <StatusPill status={pill} />
          </div>
          <h1 className="mt-2 text-[22px] font-bold leading-tight">{r.requirement}</h1>
          {r.client_name && <p className="mt-1 text-[15px] text-ink-600">{r.client_name}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[12px] bg-cream-100 p-3">
              <p className="text-[12px] text-ink-600">{r.type === 'direct' ? 'Business value' : 'Estimated value'}</p>
              <p className="mt-0.5 font-display text-[18px] font-bold tabular">{r.estimated_value ? inr(r.estimated_value) : '—'}</p>
            </div>
            <div className={cx('rounded-[12px] p-3', r.status === 'won' ? 'bg-ink-950 text-white' : 'bg-cream-100')}>
              <p className={cx('text-[12px]', r.status === 'won' ? 'text-white/60' : 'text-ink-600')}>Final value</p>
              <p className={cx('mt-0.5 font-display text-[18px] font-bold tabular', r.status === 'won' && 'text-gold-300')}>{r.final_value ? inr(r.final_value) : '—'}</p>
            </div>
          </div>
        </div>
        {/* Parties */}
        <div className="flex items-center gap-2 border-t border-line bg-cream-50 px-5 py-4">
          <Link to={`/app/members/${r.giver.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar src={r.giver.photo_url} name={r.giver.full_name} size={36} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Given by</p>
              <p className="text-[14px] font-semibold leading-tight">{iAmGiver ? 'You' : r.giver.full_name}</p>
            </div>
          </Link>
          <ArrowRight className="h-4 w-4 shrink-0 text-gold-600" />
          <Link to={`/app/members/${r.receiver.id}`} className="flex min-w-0 flex-1 items-center justify-end gap-2.5 text-right">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Given to</p>
              <p className="text-[14px] font-semibold leading-tight">{!iAmGiver ? 'You' : r.receiver.full_name}</p>
            </div>
            <Avatar src={r.receiver.photo_url} name={r.receiver.full_name} size={36} />
          </Link>
        </div>
      </motion.div>

      {r.is_disputed && !r.is_void && (
        <div className="mt-4 flex gap-3 rounded-card border border-danger/30 bg-danger/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />
          <div className="text-[14px]">
            <p className="font-semibold text-danger">Disputed — excluded from totals until an admin resolves it</p>
            {r.dispute_reason && <p className="mt-0.5 text-ink-800">“{r.dispute_reason}”</p>}
          </div>
        </div>
      )}
      {r.is_void && <p className="mt-4 rounded-card bg-ink-950/5 p-4 text-[14px] text-ink-600">This record was voided by an admin and does not count in any totals.</p>}

      {/* Status control — receiver only */}
      {r.can.status && (
        <section className="mt-5">
          <h2 className="mb-2.5 text-[15px] font-bold">Update status</h2>
          <div className="scroll-x">
            {FLOW.map((s) => (
              <button
                key={s.value}
                type="button"
                disabled={status.isPending}
                onClick={() => {
                  if (s.value === r.status && s.value !== 'won') return
                  if (s.value === 'won') setSheet('won')
                  else if (s.value === 'lost') setSheet('lost')
                  else status.mutate({ status: s.value })
                }}
                className={cx('chip h-10 px-4', r.status === s.value ? 'chip-on' : 'chip-off')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Details */}
      <section className="card mt-5 divide-y divide-line px-5">
        <Row label="Referral date">{fmtDate(r.referral_date)}</Row>
        {r.won_date && <Row label="Closed on">{fmtDate(r.won_date)}</Row>}
        {r.client_phone && (
          <Row label="Client phone">
            <a href={`tel:${r.client_phone}`} className="inline-flex items-center gap-1.5 text-gold-700">
              <Phone className="h-3.5 w-3.5" />
              {r.client_phone}
            </a>
          </Row>
        )}
        {r.client_email && (
          <Row label="Client email">
            <a href={`mailto:${r.client_email}`} className="inline-flex items-center gap-1.5 break-all text-gold-700">
              <Mail className="h-3.5 w-3.5" />
              {r.client_email}
            </a>
          </Row>
        )}
        {r.description && (
          <div className="py-3">
            <p className="text-[13.5px] text-ink-600">Description</p>
            <p className="mt-1 whitespace-pre-line text-[14.5px]">{r.description}</p>
          </div>
        )}
        {r.thank_you_note && (
          <div className="py-3">
            <p className="text-[13.5px] text-ink-600">Thank-you note</p>
            <p className="mt-1 whitespace-pre-line text-[14.5px] italic">“{r.thank_you_note}”</p>
          </div>
        )}
        {r.lost_reason && <Row label="Lost reason">{r.lost_reason}</Row>}
        {r.has_proof && (
          <Row label="Proof">
            <a href={`${API_BASE}/files/proof?code=${encodeURIComponent(r.code)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-gold-700">
              <FileText className="h-4 w-4" /> View file
            </a>
          </Row>
        )}
      </section>

      {/* Actions */}
      <section className="mt-4 flex flex-wrap gap-2">
        {r.can.edit && (
          <Button variant="outline" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setSheet('edit')}>
            Edit details
          </Button>
        )}
        {r.can.proof && <ProofUpload code={r.code} has={r.has_proof} onDone={done} />}
        {r.can.note && (
          <FollowupButton current={r.my_followup} pending={followup.isPending} onSet={(d) => followup.mutate(d)} />
        )}
        {r.can.dispute && (
          <Button variant="ghost" size="sm" className="text-danger" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setSheet('dispute')}>
            Dispute
          </Button>
        )}
      </section>

      {/* Timeline + notes */}
      <section className="mt-6">
        <h2 className="mb-3 text-[17px] font-bold">Timeline</h2>
        <div className="card p-5">
          <ol className="relative space-y-5 border-l border-line pl-5">
            {r.events.map((e) => (
              <li key={e.id} className="relative">
                <span className={cx('absolute -left-[26.5px] top-1 h-3 w-3 rounded-full ring-4 ring-white', e.kind === 'status' && e.to_status === 'won' ? 'bg-success' : e.kind === 'dispute' ? 'bg-danger' : e.kind === 'note' ? 'bg-ink-300' : 'bg-gold-500')} />
                <p className="text-[14px] leading-snug">
                  <span className="font-semibold">{e.member_name}</span>{' '}
                  {e.kind === 'created' && (r.type === 'direct' ? 'sent a thank-you note' : 'gave this referral')}
                  {e.kind === 'status' && (
                    <>
                      moved it to <StatusPill status={e.to_status ?? ''} className="ml-0.5 align-middle" />
                    </>
                  )}
                  {e.kind === 'note' && 'added a note'}
                  {e.kind === 'edit' && 'edited the details'}
                  {e.kind === 'dispute' && 'disputed this record'}
                  {e.kind === 'resolve' && 'admin update'}
                </p>
                {e.body && <p className="mt-1 whitespace-pre-line rounded-[10px] bg-cream-100 px-3 py-2 text-[14px] text-ink-800">{e.body}</p>}
                <p className="mt-1 text-[12px] text-ink-400">{fmtDateTime(e.created_at)}</p>
              </li>
            ))}
          </ol>
          {r.can.note && (
            <form
              className="mt-5 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (note.trim()) addNote.mutate()
              }}
            >
              <textarea className="field min-h-[48px] flex-1 resize-none py-3" rows={1} placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" variant="secondary" loading={addNote.isPending} disabled={!note.trim()} aria-label="Add note" className="w-12 px-0">
                {!addNote.isPending && <MessageSquare className="h-5 w-5" />}
              </Button>
            </form>
          )}
        </div>
      </section>

      <WonSheet open={sheet === 'won'} onClose={() => setSheet(null)} pending={status.isPending} est={r.estimated_value} onSubmit={(b) => status.mutate({ status: 'won', ...b })} errors={fieldErrors(status.error)} />
      <LostSheet open={sheet === 'lost'} onClose={() => setSheet(null)} pending={status.isPending} onSubmit={(reason) => status.mutate({ status: 'lost', lost_reason: reason })} />
      <DisputeSheet open={sheet === 'dispute'} onClose={() => setSheet(null)} code={r.code} onDone={done} />
      {sheet === 'edit' && <EditSheet r={r} onClose={() => setSheet(null)} onDone={done} />}
    </div>
  )
}

function WonSheet({ open, onClose, onSubmit, pending, est, errors }: { open: boolean; onClose: () => void; onSubmit: (b: Record<string, unknown>) => void; pending: boolean; est: number | null; errors: Record<string, string> }) {
  const [value, setValue] = useState(est ? String(Math.round(est)) : '')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Mark as Won 🎉">
      <form
        className="space-y-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (!value || Number(value) <= 0) return setErr('Enter the final business value.')
          setErr('')
          onSubmit({ final_value: value, won_date: date, thank_you_note: note })
        }}
      >
        <MoneyInput label="Final business value" value={value} onChange={setValue} error={err || errors.final_value} />
        <Input label="Conversion date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        <Textarea label="Thank-you note" optional rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown to the member who gave you this referral" />
        <Button type="submit" block size="lg" loading={pending}>
          Confirm Won
        </Button>
      </form>
    </Sheet>
  )
}

function LostSheet({ open, onClose, onSubmit, pending }: { open: boolean; onClose: () => void; onSubmit: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title="Mark as Lost">
      <form
        className="space-y-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(reason)
        }}
      >
        <Input label="Reason" optional value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client chose another vendor" />
        <Button type="submit" variant="secondary" block size="lg" loading={pending}>
          Mark as Lost
        </Button>
      </form>
    </Sheet>
  )
}

function DisputeSheet({ open, onClose, code, onDone }: { open: boolean; onClose: () => void; code: string; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const m = useMutation({
    mutationFn: () => api.post('referrals/dispute', { code, reason }),
    onSuccess: () => {
      toast.success('Dispute raised. An admin will review it.')
      onClose()
      onDone()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Sheet open={open} onClose={onClose} title="Dispute this record">
      <form
        className="space-y-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (!reason.trim()) return setErr('Tell the admins what is wrong.')
          m.mutate()
        }}
      >
        <p className="text-[14px] text-ink-600">The record will be flagged and excluded from totals until an admin reviews it.</p>
        <Input label="What's wrong?" value={reason} onChange={(e) => setReason(e.target.value)} error={err} placeholder="e.g. The value is incorrect" />
        <Button type="submit" variant="danger" block size="lg" loading={m.isPending}>
          Raise dispute
        </Button>
      </form>
    </Sheet>
  )
}

function EditSheet({ r, onClose, onDone }: { r: Detail; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({
    client_name: r.client_name ?? '',
    client_phone: r.client_phone ?? '',
    client_email: r.client_email ?? '',
    requirement: r.requirement,
    description: r.description ?? '',
    estimated_value: r.estimated_value ? String(Math.round(r.estimated_value)) : '',
    final_value: r.final_value ? String(Math.round(r.final_value)) : '',
    thank_you_note: r.thank_you_note ?? '',
  })
  const m = useMutation({
    mutationFn: () => api.post('referrals/update', { code: r.code, ...v }),
    onSuccess: () => {
      toast.success('Details saved')
      onClose()
      onDone()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const errs = fieldErrors(m.error)
  const set = (k: keyof typeof v, val: string) => setV({ ...v, [k]: val })
  return (
    <Sheet open onClose={onClose} title="Edit details">
      <form
        className="space-y-4 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          m.mutate()
        }}
      >
        <Input label="What they need" value={v.requirement} onChange={(e) => set('requirement', e.target.value)} error={errs.requirement} />
        <Input label="Client / business name" optional={r.type === 'direct'} value={v.client_name} onChange={(e) => set('client_name', e.target.value)} error={errs.client_name} />
        {r.type === 'referral' ? (
          <>
            <MoneyInput label="Estimated value" optional value={v.estimated_value} onChange={(x) => set('estimated_value', x)} error={errs.estimated_value} />
            <Input label="Client phone" optional type="tel" value={v.client_phone} onChange={(e) => set('client_phone', e.target.value)} />
            <Input label="Client email" optional type="email" value={v.client_email} onChange={(e) => set('client_email', e.target.value)} error={errs.client_email} />
            <Textarea label="Description" optional value={v.description} onChange={(e) => set('description', e.target.value)} />
          </>
        ) : (
          <>
            <MoneyInput label="Business value" value={v.final_value} onChange={(x) => set('final_value', x)} error={errs.final_value} />
            <Textarea label="Message" optional value={v.thank_you_note} onChange={(e) => set('thank_you_note', e.target.value)} />
          </>
        )}
        <Button type="submit" block size="lg" loading={m.isPending}>
          Save
        </Button>
      </form>
    </Sheet>
  )
}

function ProofUpload({ code, has, onDone }: { code: string; has: boolean; onDone: () => void }) {
  const m = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData()
      fd.append('code', code)
      fd.append('file', f)
      return api.post('referrals/proof', fd)
    },
    onSuccess: () => {
      toast.success('Proof uploaded')
      onDone()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-white px-3.5 text-[13px] font-semibold hover:border-ink-300">
      <Upload className="h-4 w-4" />
      {m.isPending ? 'Uploading…' : has ? 'Replace proof' : 'Upload proof'}
      <input
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) m.mutate(f)
        }}
      />
    </label>
  )
}

function FollowupButton({ current, onSet, pending }: { current: string | null; onSet: (d: string | null) => void; pending: boolean }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(current ?? todayISO())
  return (
    <>
      <Button variant="outline" size="sm" icon={<Bell className="h-4 w-4" />} onClick={() => setOpen(true)} loading={pending}>
        {current ? `Follow up ${fmtDate(current)}` : 'Set follow-up'}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Follow-up reminder">
        <div className="space-y-4 pt-1">
          <p className="text-[14px] text-ink-600">You'll get a reminder in the app on this date. Only you see it.</p>
          <Input label="Remind me on" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button
            block
            size="lg"
            onClick={() => {
              onSet(date)
              setOpen(false)
            }}
          >
            Save reminder
          </Button>
          {current && (
            <Button
              block
              variant="ghost"
              onClick={() => {
                onSet(null)
                setOpen(false)
              }}
            >
              Clear reminder
            </Button>
          )}
        </div>
      </Sheet>
    </>
  )
}
