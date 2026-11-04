import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, ClipboardList, IndianRupee, Search } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { MemberPicker } from '@/components/MemberPicker'
import { Sheet } from '@/components/Sheet'
import { Button, Checkbox, EmptyState, ErrorState, Input, ListSkeleton, MoneyInput, Segmented, Select, StatusPill } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { fmtDate, fmtDateTime, inr } from '@/lib/format'
import { useDebounced } from '@/lib/session'
import type { Paged, Referral } from '@/lib/types'
import { Add121, AddBusiness } from './AdminAdd'
import { AdminTitle } from './shared'

type Type = 'referrals' | '121s' | 'visitors' | 'testimonials'

interface OneRow {
  id: number
  code: string
  requester_name: string
  partner_name: string
  meeting_at: string
  status: string
  effective_status: string
  mode: string
}
interface VisRow {
  id: number
  code: string
  name: string
  mobile: string
  business: string | null
  inviter_name: string
  invited_date: string
  status: string
  meeting_title: string | null
}
interface TestRow {
  id: number
  author_name: string
  subject_name: string
  body: string
  is_visible: number
  created_at: string
}

const STATUS_OPTS: Record<Type, { value: string; label: string }[]> = {
  referrals: [
    { value: 'new', label: 'New' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
  ],
  '121s': [
    { value: 'requested', label: 'Requested' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'awaiting_confirmation', label: 'Awaiting confirmation' },
    { value: 'completed', label: 'Completed' },
    { value: 'declined', label: 'Declined' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  visitors: [
    { value: 'invited', label: 'Invited' },
    { value: 'attended', label: 'Attended' },
    { value: 'joined', label: 'Joined' },
    { value: 'not_interested', label: 'Not interested' },
  ],
  testimonials: [],
}

export default function AdminRecords() {
  const [params, setParams] = useSearchParams()
  const type = (['referrals', '121s', 'visitors', 'testimonials'].includes(params.get('type') ?? '') ? params.get('type') : 'referrals') as Type
  const disputed = params.get('disputed') === '1'
  const [status, setStatus] = useState('')
  const [member, setMember] = useState<number | null>(null)
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Referral | null>(null)
  const [adding, setAdding] = useState<null | 'business' | '121'>(null)
  const q = useDebounced(search, 250)
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['admin', 'records', type, status, member, disputed, q, page],
    queryFn: () => api.get<Paged<Referral | OneRow | VisRow | TestRow>>('admin/records', { type, status, member_id: member, disputed: disputed ? 1 : '', q, page }),
    placeholderData: keepPreviousData,
  })
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: Record<string, unknown> }) => api.post(path, body),
    onSuccess: () => {
      toast.success('Saved')
      qc.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const setType = (t: Type) => {
    setParams({ type: t }, { replace: true })
    setStatus('')
    setPage(1)
  }
  const data = list.data

  return (
    <div className="page max-w-6xl">
      <AdminTitle
        title="Records"
        sub="Admins can add and edit anything. Voided records are kept but never counted."
        action={
          <div className="flex gap-2">
            <Button size="sm" icon={<IndianRupee className="h-4 w-4" />} onClick={() => setAdding('business')}>
              Add business
            </Button>
            <Button size="sm" variant="secondary" icon={<CalendarCheck className="h-4 w-4" />} onClick={() => setAdding('121')}>
              Add 121
            </Button>
          </div>
        }
      />
      <div className="scroll-x">
        <Segmented
          className="min-w-[440px] flex-1"
          value={type}
          onChange={setType}
          options={[
            { value: 'referrals', label: 'Referrals & Business' },
            { value: '121s', label: '121s' },
            { value: 'visitors', label: 'Visitors' },
            { value: 'testimonials', label: 'Testimonials' },
          ]}
        />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <MemberPicker label="" value={member} onChange={(id) => { setMember(id); setPage(1) }} placeholder="Filter by member" />
        {type !== 'testimonials' && (
          <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All statuses</option>
            {STATUS_OPTS[type].map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        )}
        {type === 'referrals' && (
          <div className="flex h-12 items-center rounded-field border border-line bg-white px-3">
            <Checkbox
              checked={disputed}
              onChange={(v) => {
                const p = new URLSearchParams(params)
                if (v) p.set('disputed', '1')
                else p.delete('disputed')
                setParams(p, { replace: true })
                setPage(1)
              }}
            >
              Disputed only
            </Checkbox>
          </div>
        )}
      </div>
      {type === 'referrals' && (
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="field h-11 pl-10" placeholder="Search code, client or requirement" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
      )}

      <div className="mt-4">
        {list.isLoading && <ListSkeleton />}
        {list.isError && <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
        {data && data.items.length === 0 && <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No records match" />}
        {data && data.items.length > 0 && (
          <div className="card divide-y divide-line overflow-hidden">
            {type === 'referrals' &&
              (data.items as Referral[]).map((r) => (
                <div key={r.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold leading-snug">
                        {r.giver.full_name} → {r.receiver.full_name}
                      </p>
                      <p className="truncate text-[13px] text-ink-600">
                        {r.client_name ? `${r.client_name} · ` : ''}
                        {r.requirement}
                      </p>
                      <p className="text-[12px] text-ink-400">
                        {r.code} · {r.type === 'direct' ? 'Thank-you note' : 'Referral'} · {fmtDate(r.referral_date)}
                      </p>
                      {r.is_disputed && !r.is_void && <p className="mt-1 text-[12.5px] font-medium text-danger">Disputed: “{r.dispute_reason}”</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[13.5px] font-semibold tabular">{inr(r.status === 'won' ? r.final_value : r.estimated_value)}</span>
                      <StatusPill status={r.is_void ? 'void' : r.is_disputed ? 'disputed' : r.status} />
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    {r.is_disputed && !r.is_void && (
                      <>
                        <Button size="sm" onClick={() => act.mutate({ path: 'admin/records/resolve-dispute', body: { id: r.id, action: 'keep' } })}>
                          Keep as is
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => act.mutate({ path: 'admin/records/resolve-dispute', body: { id: r.id, action: 'void' } })}>
                          Void record
                        </Button>
                      </>
                    )}
                    {!r.is_disputed && (
                      <Button size="sm" variant="ghost" className={r.is_void ? '' : 'text-danger'} onClick={() => (r.is_void || confirm(`Void ${r.code}? It will be excluded from all totals.`)) && act.mutate({ path: 'admin/records/void', body: { id: r.id, restore: r.is_void ? 1 : 0 } })}>
                        {r.is_void ? 'Restore' : 'Void'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            {type === '121s' &&
              (data.items as OneRow[]).map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold">
                      {o.requester_name} & {o.partner_name}
                    </p>
                    <p className="text-[12px] text-ink-400">
                      {o.code} · {fmtDateTime(o.meeting_at)} · {o.mode === 'online' ? 'Online' : 'In person'}
                    </p>
                  </div>
                  <StatusPill status={o.effective_status} />
                  {o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'declined' && (
                    <Button size="sm" variant="outline" onClick={() => act.mutate({ path: 'admin/121s/force-confirm', body: { id: o.id } })}>
                      Force-confirm
                    </Button>
                  )}
                  {o.status !== 'cancelled' && (
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm('Cancel this 121? It will not count.') && act.mutate({ path: 'admin/records/void', body: { id: o.id, type: '121s' } })}>
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            {type === 'visitors' &&
              (data.items as VisRow[]).map((v) => (
                <div key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold">
                      {v.name} <span className="font-normal text-ink-400">· +91 {v.mobile}</span>
                    </p>
                    <p className="text-[12px] text-ink-400">
                      {v.code} · invited by {v.inviter_name} · {fmtDate(v.invited_date)}
                      {v.meeting_title ? ` · ${v.meeting_title}` : ''}
                    </p>
                  </div>
                  <select aria-label="Status" value={v.status} onChange={(e) => act.mutate({ path: 'visitors/status', body: { id: v.id, status: e.target.value } })} className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px] font-semibold">
                    {STATUS_OPTS.visitors.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            {type === 'testimonials' &&
              (data.items as TestRow[]).map((t) => (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink-600">
                      <span className="font-semibold text-ink-950">{t.author_name}</span> about <span className="font-semibold text-ink-950">{t.subject_name}</span>
                    </p>
                    <p className={`mt-1 text-[14px] ${t.is_visible ? '' : 'text-ink-400'}`}>“{t.body}”</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => act.mutate({ path: 'testimonials/visibility', body: { id: t.id, visible: !t.is_visible } })}>
                    {t.is_visible ? 'Hide' : 'Show'}
                  </Button>
                </div>
              ))}
          </div>
        )}
        {data && data.total > data.per_page && (
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-[13px] text-ink-600">
              Page {page} of {Math.ceil(data.total / data.per_page)} · {data.total} records
            </span>
            <Button variant="outline" size="sm" disabled={page * data.per_page >= data.total} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
      {editing && <EditReferral r={editing} onClose={() => setEditing(null)} />}
      <AddBusiness
        open={adding === 'business'}
        onClose={() => setAdding(null)}
        onDone={() => {
          setAdding(null)
          setType('referrals')
        }}
      />
      <Add121
        open={adding === '121'}
        onClose={() => setAdding(null)}
        onDone={() => {
          setAdding(null)
          setType('121s')
        }}
      />
    </div>
  )
}

function EditReferral({ r, onClose }: { r: Referral; onClose: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState({
    client_name: r.client_name ?? '',
    requirement: r.requirement,
    estimated_value: r.estimated_value ? String(Math.round(r.estimated_value)) : '',
    status: r.status as string,
    final_value: r.final_value ? String(Math.round(r.final_value)) : '',
    won_date: r.won_date ?? '',
    referral_date: r.referral_date,
  })
  const m = useMutation({
    mutationFn: () => api.post('admin/records/update', { id: r.id, ...v }),
    onSuccess: () => {
      toast.success(`${r.code} updated`)
      qc.invalidateQueries({ queryKey: ['admin'] })
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const e = fieldErrors(m.error)
  return (
    <Sheet open onClose={onClose} title={`Edit ${r.code}`}>
      <form
        className="space-y-4 pt-1"
        onSubmit={(ev) => {
          ev.preventDefault()
          m.mutate()
        }}
      >
        <Input label="Client name" optional value={v.client_name} onChange={(x) => setV({ ...v, client_name: x.target.value })} />
        <Input label="Requirement" value={v.requirement} onChange={(x) => setV({ ...v, requirement: x.target.value })} error={e.requirement} />
        <MoneyInput label="Estimated value" optional value={v.estimated_value} onChange={(x) => setV({ ...v, estimated_value: x })} />
        <Input label="Referral date" type="date" value={v.referral_date} onChange={(x) => setV({ ...v, referral_date: x.target.value })} error={e.referral_date} />
        <Select label="Status" value={v.status} onChange={(x) => setV({ ...v, status: x.target.value })}>
          {STATUS_OPTS.referrals.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        {v.status === 'won' && (
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput label="Final value" value={v.final_value} onChange={(x) => setV({ ...v, final_value: x })} error={e.final_value} />
            <Input label="Won date" type="date" value={v.won_date} onChange={(x) => setV({ ...v, won_date: x.target.value })} />
          </div>
        )}
        <Button type="submit" block size="lg" loading={m.isPending}>
          Save changes
        </Button>
        <p className="text-center text-[12px] text-ink-400">Logged in the audit log with before/after values.</p>
      </form>
    </Sheet>
  )
}
