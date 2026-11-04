import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarCheck, IndianRupee, KeyRound, Shield, ShieldOff, UserCheck, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { TagInput } from '@/components/inputs'
import { Avatar, Button, ErrorState, Input, Segmented, Select, Skeleton, StatusPill, Textarea } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { fmtDate, fmtDateTime, inr, inrCompact, relTime } from '@/lib/format'
import { useCategories, useMe } from '@/lib/session'
import type { OneToOne, Referral, Visitor } from '@/lib/types'
import { Add121, AddBusiness } from './AdminAdd'
import { useRangePicker } from './shared'

interface Detail {
  member: Record<string, string | number | null> & { offers: string[]; looking_for: string[]; photo_url: string | null }
  stats: { referrals_given: number; referrals_received: number; business_given: number; business_received: number; ones_done: number; visitors_invited: number }
  attendance: number | null
  business_received: Referral[]
  business_generated: Referral[]
  referrals: Referral[]
  ones: OneToOne[]
  visitors: Visitor[]
}

const TEXT_FIELDS = ['full_name', 'email', 'mobile', 'its_number', 'business_name', 'designation', 'city', 'address', 'website', 'instagram', 'linkedin', 'facebook', 'category_other'] as const

export default function AdminMemberDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const meId = useMe().data?.member?.id
  const cats = useCategories()
  // The same saved period as the other admin pages, so it stays put until the admin changes it.
  const { range, picker } = useRangePicker()
  const q = useQuery({
    queryKey: ['admin', 'member', id, range.from, range.to],
    queryFn: () => api.get<Detail>('admin/members/view', { id, from: range.from, to: range.to }),
    placeholderData: (prev) => prev,
  })
  const [tab, setTab] = useState<'edit' | 'records'>('edit')
  const [adding, setAdding] = useState<null | 'received' | 'given' | '121'>(null)
  const [biz, setBiz] = useState<'received' | 'generated' | 'referrals'>('received')
  const [v, setV] = useState<Record<string, string>>({})
  const [offers, setOffers] = useState<string[]>([])
  const [looking, setLooking] = useState<string[]>([])

  // Fill the edit form when the member loads — not when only the period changes, which would wipe unsaved edits.
  const loadedKey = q.data ? `${q.data.member.id}:${q.data.member.updated_at}` : ''
  useEffect(() => {
    const m = q.data?.member
    if (!m) return
    const init: Record<string, string> = {}
    TEXT_FIELDS.forEach((k) => (init[k] = m[k] == null ? '' : String(m[k])))
    init.category_id = m.category_id ? String(m.category_id) : ''
    init.business_description = m.business_description ? String(m.business_description) : ''
    setV(init)
    setOffers(m.offers)
    setLooking(m.looking_for)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin'] })
  const save = useMutation({
    mutationFn: () => api.post('admin/members/update', { id: Number(id), ...v, offers, looking_for: looking }),
    onSuccess: () => {
      toast.success('Member updated')
      invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: Record<string, unknown> }) => api.post(path, { id: Number(id), ...body }),
    onSuccess: (_d, vars) => {
      const msg: Record<string, string> = { 'admin/members/status': 'Status updated', 'admin/members/role': 'Role updated', 'admin/members/reset-password': 'Password reset email sent' }
      toast.success(msg[vars.path] ?? 'Done')
      invalidate()
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (q.isLoading)
    return (
      <div className="page space-y-4">
        <Skeleton className="h-32 rounded-card" />
        <Skeleton className="h-96 rounded-card" />
      </div>
    )
  if (q.isError || !q.data)
    return (
      <div className="page">
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </div>
    )
  const { member: m, stats } = q.data
  const errs = fieldErrors(save.error)
  const set = (k: string, val: string) => setV({ ...v, [k]: val })
  const isSelf = Number(m.id) === meId

  return (
    <div className="page max-w-4xl">
      <Link to="/admin/members" className="-ml-2 mb-2 inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[14px] font-medium text-ink-600 hover:bg-ink-950/5">
        <ArrowLeft className="h-4 w-4" /> Members
      </Link>
      <div className="card p-5">
        <div className="flex items-center gap-4">
          <Avatar src={m.photo_url} name={String(m.full_name)} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-bold">{m.full_name}</h1>
            <p className="truncate text-[14px] text-ink-600">{m.business_name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusPill status={String(m.status)} />
              {m.role === 'admin' && <StatusPill status="admin" />}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-400">
          Joined {fmtDate(String(m.approved_at ?? m.created_at))} · Last login {m.last_login_at ? relTime(String(m.last_login_at)) : 'never'}
        </p>
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-[13px] text-ink-600">
            Numbers and records for <span className="font-semibold text-ink-950">{range.from === '2000-01-01' ? 'all time' : range.label.includes('_to_') ? `${fmtDate(range.from)} – ${fmtDate(range.to)}` : range.label}</span>
          </p>
          {picker}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          {[
            ['Ref. given', stats.referrals_given],
            ['Ref. received', stats.referrals_received],
            ['Biz given', inrCompact(stats.business_given)],
            ['Biz received', inrCompact(stats.business_received)],
            ['121s', stats.ones_done],
            ['Attendance', q.data.attendance === null ? '—' : `${q.data.attendance}%`],
          ].map(([l, val]) => (
            <div key={String(l)} className="rounded-[12px] bg-cream-100 px-2 py-2.5">
              <p className="font-display text-[16px] font-bold tabular">{val}</p>
              <p className="text-[11px] text-ink-600">{l}</p>
            </div>
          ))}
        </div>
        {m.status === 'approved' && m.role !== 'admin' && (
          <div className="mt-4 rounded-[12px] bg-gold-100/60 p-3">
            <p className="mb-2 text-[13px] text-ink-800">Enter for {m.full_name} (if they didn't log it themselves):</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<IndianRupee className="h-4 w-4" />} onClick={() => setAdding('received')}>
                Business received
              </Button>
              <Button size="sm" variant="secondary" icon={<IndianRupee className="h-4 w-4" />} onClick={() => setAdding('given')}>
                Business given
              </Button>
              <Button size="sm" variant="secondary" icon={<CalendarCheck className="h-4 w-4" />} onClick={() => setAdding('121')}>
                Add 121
              </Button>
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {m.status === 'approved' && !isSelf && (
            <Button size="sm" variant="outline" icon={<UserX className="h-4 w-4" />} onClick={() => confirm(`Deactivate ${m.full_name}? They will be logged out and hidden from the directory.`) && act.mutate({ path: 'admin/members/status', body: { status: 'deactivated' } })}>
              Deactivate
            </Button>
          )}
          {m.status === 'deactivated' && (
            <Button size="sm" variant="outline" icon={<UserCheck className="h-4 w-4" />} onClick={() => act.mutate({ path: 'admin/members/status', body: { status: 'approved' } })}>
              Reactivate
            </Button>
          )}
          {m.status === 'approved' &&
            (m.role === 'admin' ? (
              <Button size="sm" variant="outline" icon={<ShieldOff className="h-4 w-4" />} onClick={() => confirm(`Remove admin rights from ${m.full_name}?`) && act.mutate({ path: 'admin/members/role', body: { role: 'member' } })}>
                Remove admin
              </Button>
            ) : (
              <Button size="sm" variant="outline" icon={<Shield className="h-4 w-4" />} onClick={() => confirm(`Make ${m.full_name} an admin? Admin accounts run BBA only: they leave the member directory and can't give referrals or log 121s.`) && act.mutate({ path: 'admin/members/role', body: { role: 'admin' } })}>
                Make admin
              </Button>
            ))}
          {m.status === 'approved' && (
            <Button size="sm" variant="outline" icon={<KeyRound className="h-4 w-4" />} loading={act.isPending && act.variables?.path === 'admin/members/reset-password'} onClick={() => act.mutate({ path: 'admin/members/reset-password', body: {} })}>
              Send password reset
            </Button>
          )}
        </div>
      </div>

      <Segmented className="mt-5" value={tab} onChange={setTab} options={[{ value: 'edit', label: 'Edit details' }, { value: 'records', label: 'Records' }]} />

      {tab === 'edit' && (
        <form
          className="card mt-4 space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={v.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} error={errs.full_name} />
            <Input label="Email" value={v.email ?? ''} onChange={(e) => set('email', e.target.value)} error={errs.email} />
            <Input label="Mobile" value={v.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} error={errs.mobile} />
            <Input label="ITS number" value={v.its_number ?? ''} onChange={(e) => set('its_number', e.target.value)} error={errs.its_number} />
            <Input label="Business name" value={v.business_name ?? ''} onChange={(e) => set('business_name', e.target.value)} error={errs.business_name} />
            <Input label="Designation" value={v.designation ?? ''} onChange={(e) => set('designation', e.target.value)} error={errs.designation} />
            <Select label="Category" value={v.category_id ?? ''} onChange={(e) => set('category_id', e.target.value)} error={errs.category_id}>
              <option value="">Choose</option>
              {cats.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {m.category_id && !cats.data?.some((c) => c.id === Number(m.category_id)) && <option value={String(m.category_id)}>{String(m.category_name ?? 'Archived category')}</option>}
            </Select>
            <Input label="City" value={v.city ?? ''} onChange={(e) => set('city', e.target.value)} error={errs.city} />
          </div>
          <Input label="Address" value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} error={errs.address} />
          <Textarea label="Business description" counter={500} value={v.business_description ?? ''} onChange={(e) => set('business_description', e.target.value)} error={errs.business_description} />
          <TagInput label="Offers" value={offers} onChange={setOffers} error={errs.offers} />
          <TagInput label="Looking for" optional value={looking} onChange={setLooking} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Website" optional value={v.website ?? ''} onChange={(e) => set('website', e.target.value)} error={errs.website} />
            <Input label="Instagram" optional value={v.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} error={errs.instagram} />
            <Input label="LinkedIn" optional value={v.linkedin ?? ''} onChange={(e) => set('linkedin', e.target.value)} error={errs.linkedin} />
            <Input label="Facebook" optional value={v.facebook ?? ''} onChange={(e) => set('facebook', e.target.value)} error={errs.facebook} />
          </div>
          <Button type="submit" size="lg" loading={save.isPending} className="w-full sm:w-auto">
            Save changes
          </Button>
          <p className="text-[12px] text-ink-400">Every change is recorded in the audit log.</p>
        </form>
      )}

      {tab === 'records' && (
        <div className="mt-4 space-y-5">
          <section>
            {/* Business received and business generated for others are shown apart, never mixed. */}
            <Segmented
              value={biz}
              onChange={setBiz}
              options={[
                { value: 'received', label: `Received · ${inrCompact(stats.business_received)}` },
                { value: 'generated', label: `Generated · ${inrCompact(stats.business_given)}` },
                { value: 'referrals', label: `Referrals · ${q.data.referrals.length}` },
              ]}
            />
            <p className="mb-2 mt-2.5 text-[13px] text-ink-600">
              {biz === 'received' ? `Business ${m.full_name} received from other members.` : biz === 'generated' ? `Business ${m.full_name} generated for other members.` : 'Referrals given and received, by referral date.'}
            </p>
            {biz !== 'referrals' ? (
              <div className="card divide-y divide-line overflow-hidden">
                {(biz === 'received' ? q.data.business_received : q.data.business_generated).length === 0 && <p className="p-4 text-[14px] text-ink-600">None in this period.</p>}
                {(biz === 'received' ? q.data.business_received : q.data.business_generated).map((r) => (
                  <Link key={r.id} to={`/admin/records?type=referrals&q=${r.code}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-cream-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">
                        {biz === 'received' ? `From ${r.giver.full_name}` : `For ${r.receiver.full_name}`} · {r.requirement}
                      </p>
                      <p className="text-[12px] text-ink-400">
                        {r.code} · {fmtDate(r.won_date)}
                        {r.type === 'direct' && ' · Thank-you note'}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold tabular">{inr(r.final_value ?? 0)}</span>
                    {(r.is_void || r.is_disputed) && <StatusPill status={r.is_void ? 'void' : 'disputed'} />}
                  </Link>
                ))}
              </div>
            ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {q.data.referrals.length === 0 && <p className="p-4 text-[14px] text-ink-600">None in this period.</p>}
              {q.data.referrals.map((r) => (
                <Link key={r.id} to={`/admin/records?type=referrals&q=${r.code}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-cream-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">
                      {r.direction === 'given' ? `→ ${r.receiver.full_name}` : `← ${r.giver.full_name}`} · {r.requirement}
                    </p>
                    <p className="text-[12px] text-ink-400">
                      {r.code} · {fmtDate(r.referral_date)}
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold tabular">{inr(r.final_value ?? r.estimated_value ?? 0)}</span>
                  <StatusPill status={r.is_void ? 'void' : r.is_disputed ? 'disputed' : r.status} />
                </Link>
              ))}
            </div>
            )}
          </section>
          <section>
            <h2 className="mb-2 text-[15px] font-bold">121s ({q.data.ones.length})</h2>
            <div className="card divide-y divide-line overflow-hidden">
              {q.data.ones.length === 0 && <p className="p-4 text-[14px] text-ink-600">None yet.</p>}
              {q.data.ones.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">With {o.other.full_name}</p>
                    <p className="text-[12px] text-ink-400">
                      {o.code} · {fmtDateTime(o.meeting_at)}
                    </p>
                  </div>
                  <StatusPill status={o.effective_status} />
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-[15px] font-bold">Visitors ({q.data.visitors.length})</h2>
            <div className="card divide-y divide-line overflow-hidden">
              {q.data.visitors.length === 0 && <p className="p-4 text-[14px] text-ink-600">None yet.</p>}
              {q.data.visitors.map((vis) => (
                <div key={vis.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{vis.name}</p>
                    <p className="text-[12px] text-ink-400">
                      {vis.code} · {fmtDate(vis.invited_date)}
                    </p>
                  </div>
                  <StatusPill status={vis.status} />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      <AddBusiness open={adding === 'received' || adding === 'given'} onClose={() => setAdding(null)} onDone={() => setAdding(null)} receiver={adding === 'received' ? Number(m.id) : null} giver={adding === 'given' ? Number(m.id) : null} />
      <Add121 open={adding === '121'} onClose={() => setAdding(null)} onDone={() => setAdding(null)} member={Number(m.id)} />
    </div>
  )
}
