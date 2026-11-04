import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, Button, EmptyState, ErrorState, ListSkeleton, Select, StatusPill } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { fmtDate, fmtShortDate, inrCompact, relTime } from '@/lib/format'
import { useDebounced } from '@/lib/session'
import { InviteButton, PendingInvites } from './Invites'
import { AdminTitle } from './shared'

interface Row {
  id: number
  full_name: string
  business_name: string
  email: string
  mobile: string
  city: string
  status: string
  role: string
  photo_url: string | null
  category_name: string
  approved_at: string | null
  created_at: string
  last_login_at: string | null
  referrals_given: number
  business_given: number
}

export default function AdminMembers() {
  const [search, setSearch] = useState('')
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [role, setRole] = useState(params.get('role') ?? '')
  const [sort, setSort] = useState('name')
  // "Active members" from the Overview: members who did something in that period.
  const active = params.get('active') === '1' && !!params.get('from') && !!params.get('to')
  const from = active ? params.get('from') ?? '' : ''
  const to = active ? params.get('to') ?? '' : ''
  const q = useDebounced(search, 250)
  const list = useQuery({
    queryKey: ['admin', 'members', q, status, role, sort, from, to],
    queryFn: () => api.get<Row[]>('admin/members', { q, status, role, sort, active: active ? 1 : '', from, to }),
    placeholderData: keepPreviousData,
  })
  const rows = list.data ?? []

  return (
    <div className="page max-w-6xl">
      <AdminTitle title="Members" sub={list.data ? `${rows.length} member${rows.length === 1 ? '' : 's'}` : undefined} action={<InviteButton />} />
      <PendingInvites />
      {active && (
        <div className="mb-3 flex items-start gap-3 rounded-field bg-gold-100/70 px-3.5 py-2.5">
          <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-800">
            <span className="font-semibold">Active members</span> · {from === '2000-01-01' ? 'all time' : `${fmtDate(from)} – ${fmtDate(to)}`}
            <span className="block text-[12.5px] text-ink-600">Gave or received a referral, completed a 121, or invited a visitor in this period.</span>
          </p>
          <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setParams({}, { replace: true })}>
            Show all
          </Button>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="field h-11 pl-10" placeholder="Name, business, email, mobile, ITS, city" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:contents">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 text-[14px]">
            <option value="">All statuses</option>
            <option value="approved">Active</option>
            <option value="deactivated">Inactive</option>
            <option value="rejected">Rejected</option>
          </Select>
          <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className="h-11 text-[14px]">
            <option value="">All roles</option>
            <option value="member">Members</option>
            <option value="admin">Admins</option>
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className="h-11 text-[14px]">
            <option value="name">Name</option>
            <option value="joined">Newest</option>
            <option value="login">Last login</option>
            <option value="business">Business given</option>
            <option value="referrals">Referrals given</option>
          </Select>
        </div>
      </div>

      <div className="mt-4">
        {list.isLoading && <ListSkeleton />}
        {list.isError && <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
        {list.data && rows.length === 0 && <EmptyState icon={<Users className="h-6 w-6" />} title="No members found" />}
        {rows.length > 0 && (
          <>
            {/* Phones: cards */}
            <div className="card divide-y divide-line overflow-hidden md:hidden">
              {rows.map((m) => (
                <Link key={m.id} to={`/admin/members/${m.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-cream-100">
                  <Avatar src={m.photo_url} name={m.full_name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{m.full_name}</p>
                    <p className="truncate text-[12.5px] text-ink-600">
                      {m.business_name} · {m.city}
                    </p>
                    <p className="text-[12px] text-ink-400">
                      {m.referrals_given} referrals · {inrCompact(m.business_given)} given
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusPill status={m.status} />
                    {m.role === 'admin' && <StatusPill status="admin" />}
                  </div>
                </Link>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="card hidden overflow-x-auto md:block">
              <table className="w-full text-left text-[13.5px]">
                <thead className="border-b border-line bg-cream-50 text-[12px] font-semibold uppercase tracking-wide text-ink-400">
                  <tr>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3">City</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Joined</th>
                    <th className="px-3 py-3">Last login</th>
                    <th className="px-3 py-3 text-right">Referrals</th>
                    <th className="px-4 py-3 text-right">Business given</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((m) => (
                    <tr key={m.id} className="hover:bg-cream-50">
                      <td className="px-4 py-2.5">
                        <Link to={`/admin/members/${m.id}`} className="flex items-center gap-2.5">
                          <Avatar src={m.photo_url} name={m.full_name} size={32} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{m.full_name}</p>
                            <p className="truncate text-[12px] text-ink-600">{m.business_name}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-ink-700">{m.category_name}</td>
                      <td className="px-3 py-2.5 text-ink-700">{m.city}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <StatusPill status={m.status} />
                          {m.role === 'admin' && <StatusPill status="admin" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-700">{fmtShortDate(m.approved_at ?? m.created_at)}</td>
                      <td className="px-3 py-2.5 text-ink-700">{m.last_login_at ? relTime(m.last_login_at) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular">{m.referrals_given}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular">{inrCompact(m.business_given)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
