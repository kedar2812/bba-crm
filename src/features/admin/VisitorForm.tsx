import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Copy, ExternalLink, FileSpreadsheet, FileText, ImagePlus, Lock, Mail, Phone, Plus, QrCode, RotateCcw, Search, Trash2, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { TagInput } from '@/components/inputs'
import { Sheet } from '@/components/Sheet'
import { Button, Chips, EmptyState, ErrorState, Input, ListSkeleton, MoneyInput, Segmented, Select, Skeleton, StatusPill, Switch, Textarea, cx } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { API_BASE } from '@/lib/config'
import { fmtDate, fmtShortDate, relTime } from '@/lib/format'
import { blobName, fitImage } from '@/lib/image'
import { FIELD_TYPES, LOCKED_FIELDS, fmtPhone, waLink, type VisitField, type VisitFieldType, type VisitFormConfig, type VisitRequest, type VisitStatus } from '../visit/types'
import { AdminTitle, exportXlsx } from './shared'

interface EditorData {
  form: VisitFormConfig
  defaults: VisitFormConfig
  public_url: string
  upcoming_meetings: number
  admin_emails: string[]
}
interface ResponsesData {
  items: VisitRequest[]
  counts: Record<VisitStatus, number>
  total: number
}

type Tab = 'responses' | 'questions' | 'page'

const STATUSES: { value: VisitStatus; label: string; hint: string }[] = [
  { value: 'new', label: 'New', hint: 'Not looked at yet' },
  { value: 'contacted', label: 'Contacted', hint: 'You called or messaged them' },
  { value: 'confirmed', label: 'Confirmed', hint: 'Seat confirmed / fee received' },
  { value: 'attended', label: 'Attended', hint: 'They came to the meeting' },
  { value: 'cancelled', label: 'Cancelled', hint: "Not coming" },
]

const fileUrl = (r: VisitRequest, fieldId: string, download = false) => `${API_BASE}/files/visit-upload?id=${r.id}&field=${encodeURIComponent(fieldId)}${download ? '&download=1' : ''}`

/** What the admin edits: everything except the QR image, which uploads on its own. */
type Draft = Omit<VisitFormConfig, 'qr_path' | 'qr_url'>
const toDraft = (f: VisitFormConfig): Draft => {
  const { qr_path: _p, qr_url: _u, ...rest } = f
  return JSON.parse(JSON.stringify(rest))
}

export default function VisitorForm() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = (['responses', 'questions', 'page'].includes(params.get('tab') ?? '') ? params.get('tab') : 'responses') as Tab
  const openId = Number(params.get('r')) || null
  const setTab = (t: Tab) => setParams((p) => (p.set('tab', t), p.delete('r'), p), { replace: true })
  const setOpenId = (id: number | null) => setParams((p) => (id ? p.set('r', String(id)) : p.delete('r'), p), { replace: true })

  const fq = useQuery({ queryKey: ['admin', 'visit-form'], queryFn: () => api.get<EditorData>('admin/visit-form') })
  const rq = useQuery({ queryKey: ['admin', 'visit-requests'], queryFn: () => api.get<ResponsesData>('admin/visit-requests') })

  const [draft, setDraft] = useState<Draft | null>(null)
  const server = fq.data ? toDraft(fq.data.form) : null
  // Follow the saved form (another admin's save, a restore) unless there are unsaved edits.
  const lastServer = useRef('')
  useEffect(() => {
    if (!fq.data) return
    const next = toDraft(fq.data.form)
    setDraft((d) => (!d || JSON.stringify(d) === lastServer.current ? next : d))
    lastServer.current = JSON.stringify(next)
  }, [fq.data])
  const dirty = !!draft && !!server && JSON.stringify(draft) !== JSON.stringify(server)

  const save = useMutation({
    mutationFn: (d: Draft) => api.post<VisitFormConfig>('admin/visit-form/save', d),
    onSuccess: (form) => {
      qc.setQueryData<EditorData>(['admin', 'visit-form'], (old) => (old ? { ...old, form } : old))
      setDraft(toDraft(form))
      qc.invalidateQueries({ queryKey: ['public-visit-form'] })
      qc.invalidateQueries({ queryKey: ['public-content'] })
      toast.success('Visitor form saved — the public page is updated')
    },
    onError: (e) => {
      const fe = fieldErrors(e)
      const keys = Object.keys(fe)
      if (keys.length) setTab(keys.some((k) => k === 'fields' || k.startsWith('field_')) ? 'questions' : 'page')
      toast.error(errorMessage(e))
    },
  })

  if (fq.isLoading || (fq.data && !draft))
    return (
      <div className="page space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    )
  if (fq.isError || !fq.data || !draft)
    return (
      <div className="page">
        <ErrorState message={errorMessage(fq.error)} onRetry={() => fq.refetch()} />
      </div>
    )

  const data = fq.data
  const errors = fieldErrors(save.error)
  const newCount = rq.data?.counts.new ?? 0

  return (
    <div className={cx('page', dirty && 'pb-28')}>
      <AdminTitle title="Visitor form" sub="The public “Attend as a visitor” page, and everyone who has filled it in." />

      <PublicLinkCard url={data.public_url} open={draft.enabled} onToggle={(v) => setDraft({ ...draft, enabled: v })} savedOpen={data.form.enabled} />

      <Segmented
        className="mt-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'responses', label: `Responses${rq.data ? ` · ${rq.data.total}` : ''}${newCount ? ` (${newCount} new)` : ''}` },
          { value: 'questions', label: 'Questions' },
          { value: 'page', label: 'Page & payment' },
        ]}
      />

      <div className="mt-4">
        {tab === 'responses' && <Responses q={rq} openId={openId} setOpenId={setOpenId} />}
        {tab === 'questions' && <Questions draft={draft} setDraft={setDraft} defaults={data.defaults} errors={errors} />}
        {tab === 'page' && <PageSettings draft={draft} setDraft={setDraft} data={data} errors={errors} />}
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-safe backdrop-blur lg:left-64"
          >
            <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
              <p className="hidden flex-1 text-[14px] font-medium text-ink-700 sm:block">You have unsaved changes to the visitor form.</p>
              <Button variant="ghost" onClick={() => server && setDraft(server)} className="flex-1 sm:flex-none">
                Discard
              </Button>
              <Button onClick={() => save.mutate(draft)} loading={save.isPending} className="flex-1 sm:flex-none">
                Save changes
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PublicLinkCard({ url, open, savedOpen, onToggle }: { url: string; open: boolean; savedOpen: boolean; onToggle: (v: boolean) => void }) {
  const share = `Attend a BBA meeting as a visitor. Register here: ${url}`
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusPill status={savedOpen ? 'approved' : 'deactivated'} label={savedOpen ? 'Live' : 'Closed'} />
            <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-[15px] font-semibold underline decoration-gold-500 decoration-2 underline-offset-4">
              {url.replace(/^https?:\/\//, '')}
            </a>
          </div>
          <p className="mt-1 text-[13px] text-ink-600">Share this link, or use the “Attend as a visitor” button on the website.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<Copy className="h-4 w-4" />}
            onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Link copied'), () => toast.error('Could not copy'))}
          >
            Copy
          </Button>
          <a href={waLink('', share)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3.5 text-[13px] font-semibold hover:border-ink-300">
            Share on WhatsApp
          </a>
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-ink-950 px-3.5 text-[13px] font-semibold text-white hover:bg-ink-800">
            Open <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <Switch
          checked={open}
          onChange={onToggle}
          label="Accepting registrations"
          hint={open ? 'Visitors can fill in the form.' : 'The page shows your “closed” message instead of the form, and the website hides its visitor button.'}
        />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

function answerText(a: VisitRequest['answers'][number]) {
  if (a.type === 'file') return a.answer ? 'Attached' : ''
  if (a.type === 'phone' && a.answer) return fmtPhone(a.answer)
  return a.answer ?? ''
}

function Responses({ q, openId, setOpenId }: { q: UseQueryResult<ResponsesData>; openId: number | null; setOpenId: (id: number | null) => void }) {
  const [status, setStatus] = useState<'all' | VisitStatus>('all')
  const [search, setSearch] = useState('')
  const items = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (q.data?.items ?? []).filter(
      (r) => (status === 'all' || r.status === status) && (!s || [r.name, r.mobile, r.email, r.code, ...r.answers.map((a) => a.answer)].some((x) => (x ?? '').toLowerCase().includes(s))),
    )
  }, [q.data, status, search])
  const open = q.data?.items.find((r) => r.id === openId) ?? null

  const exportAll = () => {
    const list = q.data?.items ?? []
    if (!list.length) return toast.error('No responses to export yet.')
    const labels: string[] = []
    list.forEach((r) => r.answers.forEach((a) => !labels.includes(a.label) && labels.push(a.label)))
    const rows = list.map((r) => {
      const row: Record<string, unknown> = { Reference: r.code, Submitted: r.created_at, Status: STATUSES.find((s) => s.value === r.status)?.label ?? r.status, Meeting: r.meeting_title ? `${r.meeting_title} (${fmtDate(r.meeting_date)})` : '' }
      labels.forEach((l) => {
        const a = r.answers.find((x) => x.label === l)
        row[l] = a ? answerText(a) : ''
      })
      row['Admin note'] = r.admin_note ?? ''
      return row
    })
    exportXlsx(`bba-visitor-responses-${new Date().toISOString().slice(0, 10)}.xlsx`, [{ name: 'Visitor responses', rows }])
  }

  if (q.isLoading) return <ListSkeleton rows={4} />
  if (q.isError || !q.data) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />

  const c = q.data.counts
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="field h-11 pl-10" placeholder="Search name, mobile, business…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search responses" />
        </div>
        <Button variant="outline" size="sm" className="h-11" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={exportAll}>
          Export to Excel
        </Button>
      </div>
      <div className="mt-3">
        <Chips
          value={status}
          onChange={setStatus}
          options={[{ value: 'all' as const, label: `All · ${q.data.total}` }, ...STATUSES.map((s) => ({ value: s.value, label: `${s.label} · ${c[s.value] ?? 0}` }))]}
        />
      </div>

      <div className="mt-3">
        {items.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={q.data.total === 0 ? 'No one has registered yet' : 'No responses match'}
            sub={q.data.total === 0 ? 'Share the form link. Each registration appears here and is emailed to you.' : 'Try another status or search.'}
          />
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {items.map((r) => {
              const biz = r.answers.find((a) => a.id === 'business')?.answer
              return (
                <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-cream-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">
                      {r.name}
                      {biz && <span className="font-normal text-ink-600"> · {biz}</span>}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-ink-600">
                      {fmtPhone(r.mobile)}
                      {r.meeting_date && ` · for ${fmtShortDate(r.meeting_date)}`} · {relTime(r.created_at)}
                    </p>
                  </div>
                  <StatusPill status={r.status} label={STATUSES.find((s) => s.value === r.status)?.label} />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? open.name : ''} wide>
        {open && <ResponseDetail r={open} onDeleted={() => setOpenId(null)} />}
      </Sheet>
    </div>
  )
}

function ResponseDetail({ r, onDeleted }: { r: VisitRequest; onDeleted: () => void }) {
  const qc = useQueryClient()
  const [note, setNote] = useState(r.admin_note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => setNote(r.admin_note ?? ''), [r.id, r.admin_note])
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'visit-requests'] })
    qc.invalidateQueries({ queryKey: ['unread'] })
  }
  const update = useMutation({
    mutationFn: (b: { status?: VisitStatus; admin_note?: string }) => api.post('admin/visit-requests/update', { id: r.id, ...b }),
    onSuccess: (_, b) => {
      refresh()
      toast.success(b.status ? `Marked ${STATUSES.find((s) => s.value === b.status)?.label.toLowerCase()}` : 'Note saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const del = useMutation({
    mutationFn: () => api.post('admin/visit-requests/delete', { id: r.id }),
    onSuccess: () => {
      refresh()
      toast.success('Response deleted')
      onDeleted()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const greeting = `Hello ${r.name.split(' ')[0]}, this is BBA. Thank you for registering to visit${r.meeting_title ? ` ${r.meeting_title} on ${fmtDate(r.meeting_date)}` : ' our meeting'}.`

  return (
    <div className="space-y-5 pt-1">
      <p className="text-[13px] text-ink-600">
        {r.code} · registered {fmtDate(r.created_at)} ({relTime(r.created_at)})
      </p>
      <div className="grid grid-cols-3 gap-2">
        <a href={waLink(r.mobile, greeting)} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-field bg-[#25D366] text-[14px] font-semibold text-white hover:brightness-95">
          WhatsApp
        </a>
        <a href={`tel:${r.mobile.startsWith('+') ? r.mobile : `+91${r.mobile}`}`} className="flex h-11 items-center justify-center gap-1.5 rounded-field border border-line bg-white text-[14px] font-semibold hover:border-ink-300">
          <Phone className="h-4 w-4" /> Call
        </a>
        {r.email ? (
          <a href={`mailto:${r.email}`} className="flex h-11 items-center justify-center gap-1.5 rounded-field border border-line bg-white text-[14px] font-semibold hover:border-ink-300">
            <Mail className="h-4 w-4" /> Email
          </a>
        ) : (
          <span className="flex h-11 items-center justify-center rounded-field border border-dashed border-line text-[13px] text-ink-400">No email</span>
        )}
      </div>

      {r.meeting_title && (
        <div className="rounded-field bg-cream-100 px-4 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Meeting</p>
          <p className="text-[15px] font-semibold">
            {r.meeting_title} · {fmtDate(r.meeting_date)}
          </p>
        </div>
      )}

      <dl className="divide-y divide-line rounded-field border border-line bg-white">
        {r.answers.map((a) => (
          <div key={a.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className="text-[13px] font-semibold text-ink-400">{a.label}</dt>
            <dd className="min-w-0 break-words text-[14.5px]">
              {a.type === 'file' ? (
                a.answer ? (
                  a.answer.endsWith('.pdf') ? (
                    <a href={fileUrl(r, a.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold underline decoration-gold-500 decoration-2 underline-offset-4">
                      <FileText className="h-4 w-4" /> Open PDF
                    </a>
                  ) : (
                    <a href={fileUrl(r, a.id)} target="_blank" rel="noopener noreferrer" className="block w-fit">
                      <img src={fileUrl(r, a.id)} alt={a.label} className="max-h-64 rounded-[10px] border border-line object-contain" loading="lazy" />
                      <span className="mt-1 block text-[12px] text-ink-600">Open full size</span>
                    </a>
                  )
                ) : (
                  <span className="text-ink-400">Not attached</span>
                )
              ) : answerText(a) ? (
                <span className="whitespace-pre-line">{answerText(a)}</span>
              ) : (
                <span className="text-ink-400">—</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="label">Status</p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.hint}
              disabled={update.isPending}
              onClick={() => s.value !== r.status && update.mutate({ status: s.value })}
              className={cx('chip', r.status === s.value ? 'chip-on' : 'chip-off')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Textarea label="Note for admins" optional rows={3} counter={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid ₹500 by UPI on 12 Nov" />
        {note !== (r.admin_note ?? '') && (
          <Button size="sm" className="mt-2" loading={update.isPending} onClick={() => update.mutate({ admin_note: note })}>
            Save note
          </Button>
        )}
      </div>

      <div className="border-t border-line pt-4">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-[14px] text-ink-700">Delete this response and its attachments for good?</p>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button size="sm" variant="danger" loading={del.isPending} onClick={() => del.mutate()}>
              Delete
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
            Delete response
          </Button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

const newId = () => `q_${Math.random().toString(36).slice(2, 8)}`

function Questions({ draft, setDraft, defaults, errors }: { draft: Draft; setDraft: (d: Draft) => void; defaults: VisitFormConfig; errors: Record<string, string> }) {
  const [adding, setAdding] = useState<VisitFieldType | ''>('')
  const [confirmReset, setConfirmReset] = useState(false)
  const fields = draft.fields
  const setFields = (next: VisitField[]) => setDraft({ ...draft, fields: next })
  const update = (i: number, f: VisitField) => setFields(fields.map((x, j) => (j === i ? f : x)))
  const move = (i: number, by: number) => {
    const next = [...fields]
    const [it] = next.splice(i, 1)
    next.splice(i + by, 0, it)
    setFields(next)
  }
  const add = (type: VisitFieldType) => {
    const label = FIELD_TYPES.find((t) => t.value === type)?.label ?? 'New question'
    setFields([...fields, { id: newId(), label: type === 'checkbox' ? 'I agree to…' : `New question (${label.toLowerCase()})`, type, required: false, help: '', options: type === 'select' ? ['Option 1', 'Option 2'] : [] }])
    setAdding('')
  }
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-ink-600">
        These are the questions on the form, in order. The name and mobile number are always asked, so you can reach every visitor. Changes go live when you save.
      </p>
      {errors.fields && <p className="rounded-field bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">{errors.fields}</p>}
      <AnimatePresence initial={false}>
        {fields.map((f, i) => (
          <motion.div key={f.id} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
            <FieldCard
              field={f}
              index={i}
              count={fields.length}
              error={errors[`field_${i}`]}
              onChange={(nf) => update(i, nf)}
              onMove={(by) => move(i, by)}
              onRemove={() => setFields(fields.filter((_, j) => j !== i))}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Select label="Add a question" value={adding} onChange={(e) => setAdding(e.target.value as VisitFieldType)}>
            <option value="">Choose the kind of answer…</option>
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} disabled={!adding || fields.length >= 40} onClick={() => adding && add(adding)}>
          Add question
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        {confirmReset ? (
          <>
            <p className="text-[14px] text-ink-700">Replace all questions with the original set? (Nothing changes until you save.)</p>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFields(JSON.parse(JSON.stringify(defaults.fields)))
                setConfirmReset(false)
              }}
            >
              Use the original questions
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>
            Reset to the original questions
          </Button>
        )}
      </div>
    </div>
  )
}

function FieldCard({ field, index, count, error, onChange, onMove, onRemove }: { field: VisitField; index: number; count: number; error?: string; onChange: (f: VisitField) => void; onMove: (by: number) => void; onRemove: () => void }) {
  const locked = LOCKED_FIELDS.includes(field.id)
  return (
    <section className={cx('card p-4', error && 'ring-2 ring-danger/50')}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col pt-6">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-600 hover:bg-ink-950/5 disabled:opacity-25">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-600 hover:bg-ink-950/5 disabled:opacity-25">
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Input label={`Question ${index + 1}`} value={field.label} maxLength={150} onChange={(e) => onChange({ ...field, label: e.target.value })} className="h-11" />
            <Select
              label="Answer type"
              value={field.type}
              disabled={locked}
              className="h-11 text-[14px]"
              onChange={(e) => {
                const type = e.target.value as VisitFieldType
                onChange({ ...field, type, options: type === 'select' && !field.options.length ? ['Option 1', 'Option 2'] : field.options })
              }}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          {field.type === 'select' && <TagInput label="Choices" value={field.options} onChange={(options) => onChange({ ...field, options })} placeholder="Type a choice and press Enter" />}
          <Input label="Hint under the question" optional value={field.help} maxLength={300} onChange={(e) => onChange({ ...field, help: e.target.value })} className="h-11" placeholder={field.type === 'file' ? 'e.g. A screenshot of the UPI payment' : ''} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {locked ? (
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-600">
                <Lock className="h-3.5 w-3.5" /> Always asked and required
              </p>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 text-[14px] font-medium">
                <input type="checkbox" checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} className="h-5 w-5 accent-[#E0A82E]" />
                {field.type === 'checkbox' ? 'Must be ticked' : 'Required'}
              </label>
            )}
            {!locked && (
              <Button size="sm" variant="ghost" className="text-danger" icon={<X className="h-4 w-4" />} onClick={onRemove}>
                Remove
              </Button>
            )}
          </div>
          {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Page & payment                                                      */
/* ------------------------------------------------------------------ */

function PageSettings({ draft, setDraft, data, errors }: { draft: Draft; setDraft: (d: Draft) => void; data: EditorData; errors: Record<string, string> }) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v })
  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-[17px] font-bold">Page text</h2>
          <p className="mt-0.5 text-[13px] text-ink-600">What visitors read on the page and after they register.</p>
        </div>
        <Input label="Page title" value={draft.title} maxLength={120} onChange={(e) => set('title', e.target.value)} error={errors.title} />
        <Textarea label="Introduction" optional rows={4} counter={3000} value={draft.intro} onChange={(e) => set('intro', e.target.value)} error={errors.intro} />
        <Input label="Button text" value={draft.submit_label} maxLength={60} onChange={(e) => set('submit_label', e.target.value)} error={errors.submit_label} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Thank-you heading" value={draft.success_title} maxLength={120} onChange={(e) => set('success_title', e.target.value)} error={errors.success_title} />
          <div className="sm:col-span-2">
            <Textarea label="Thank-you message" optional rows={3} counter={1500} value={draft.success_message} onChange={(e) => set('success_message', e.target.value)} error={errors.success_message} />
          </div>
        </div>
        <Textarea label="Message when registrations are closed" optional rows={2} counter={1500} value={draft.closed_message} onChange={(e) => set('closed_message', e.target.value)} error={errors.closed_message} />
        <Switch
          checked={draft.show_meeting}
          onChange={(v) => set('show_meeting', v)}
          label="Let visitors pick the meeting"
          hint={`Lists the next upcoming meetings from Admin → Meetings (${data.upcoming_meetings === 0 ? 'none scheduled right now, so the choice is hidden' : `${data.upcoming_meetings} scheduled`}).`}
        />
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-[17px] font-bold">Payment</h2>
          <p className="mt-0.5 text-[13px] text-ink-600">Shown next to the form. Leave everything empty if there is no visitor fee.</p>
        </div>
        <QrUploader url={data.form.qr_url ?? null} />
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput label="Visitor fee" optional value={draft.fee_amount} onChange={(v) => set('fee_amount', v)} error={errors.fee_amount} />
          <Input label="Heading" optional value={draft.payment_title} maxLength={120} placeholder="Visitor fee" onChange={(e) => set('payment_title', e.target.value)} error={errors.payment_title} />
        </div>
        <Textarea label="Payment instructions" optional rows={3} counter={1500} value={draft.payment_note} onChange={(e) => set('payment_note', e.target.value)} error={errors.payment_note} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="UPI ID" optional autoCapitalize="none" placeholder="bba@okhdfcbank" value={draft.upi_id} onChange={(e) => set('upi_id', e.target.value.trim())} error={errors.upi_id} hint="Shown with a Copy button, and a “Pay with a UPI app” button on phones." />
          <Input label="Online payment link" optional autoCapitalize="none" inputMode="url" placeholder="https://rzp.io/…" value={draft.payment_link} onChange={(e) => set('payment_link', e.target.value)} error={errors.payment_link} hint="Razorpay, Instamojo or similar." />
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-[17px] font-bold">When someone registers</h2>
          <p className="mt-0.5 text-[13px] text-ink-600">Every registration appears under Responses and on the bell. It is also emailed, and the visitor can send it to you on WhatsApp.</p>
        </div>
        <TagInput
          label="Email the details to"
          optional
          value={draft.notify_emails}
          onChange={(v) => set('notify_emails', v.map((x) => x.toLowerCase()))}
          error={errors.notify_emails}
          placeholder="name@example.com"
          hint={draft.notify_emails.length ? 'Press Enter after each address.' : `Empty: every admin is emailed (${data.admin_emails.join(', ') || 'no admins'}).`}
        />
        <Input
          label="BBA WhatsApp number"
          optional
          type="tel"
          inputMode="tel"
          placeholder="98765 43210"
          value={draft.whatsapp_number}
          onChange={(e) => set('whatsapp_number', e.target.value)}
          error={errors.whatsapp_number}
          hint="After registering, visitors get a “Send my details on WhatsApp” button that opens a chat with this number, details filled in."
        />
      </section>
    </div>
  )
}

function QrUploader({ url }: { url: string | null }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'visit-form'] })
    qc.invalidateQueries({ queryKey: ['public-visit-form'] })
  }
  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Keep QR codes sharp: shrink only very large images.
      const blob = file.size > 1.5 * 1024 * 1024 ? await fitImage(file, 1400) : file
      const fd = new FormData()
      fd.append('file', blob, blob instanceof File ? blob.name : blobName(blob))
      return api.post<{ qr_url: string }>('admin/visit-form/qr', fd)
    },
    onSuccess: () => {
      refresh()
      toast.success('QR code updated on the visitor page')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: () => api.post('admin/visit-form/qr/remove'),
    onSuccess: () => {
      refresh()
      toast.success('QR code removed')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <div>
      <p className="label">Payment QR code</p>
      <div className="flex items-center gap-4 rounded-field border border-line bg-cream-50 p-3">
        {url ? <img src={url} alt="Payment QR code" className="h-28 w-28 shrink-0 rounded-[10px] border border-line bg-white object-contain" /> : <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-ink-300 text-ink-400"><QrCode className="h-8 w-8" /></span>}
        <div className="min-w-0 space-y-2">
          <p className="text-[13px] text-ink-600">{url ? 'Visitors scan this to pay. It changes on the page as soon as you upload a new one.' : 'Upload a screenshot of the QR code from your UPI or bank app (JPG, PNG or WebP).'}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<ImagePlus className="h-4 w-4" />} loading={upload.isPending} onClick={() => input.current?.click()}>
              {url ? 'Replace' : 'Upload QR code'}
            </Button>
            {url && (
              <Button size="sm" variant="ghost" className="text-danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) upload.mutate(f)
        }}
      />
    </div>
  )
}
