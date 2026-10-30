import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button, ErrorState, ListSkeleton, Segmented } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { inr } from '@/lib/format'
import { AdminTitle, exportXlsx, useRangePicker } from './shared'

type Kind = 'members' | 'categories' | 'summary' | 'raw'

interface MemberRow {
  id: number
  full_name: string
  business_name: string
  category: string
  referrals_given: number
  referrals_received: number
  business_given: number
  business_received: number
  ones_done: number
  ones_target: number
  visitors_invited: number
  attendance_pct: number | null
}
interface CatRow {
  category: string
  members: number
  referrals_received: number
  business_value: number
}

const SUMMARY_LABELS: Record<string, string> = {
  members_total: 'Total members',
  new_members: 'New members',
  meetings_held: 'Meetings held',
  referrals_given: 'Referrals passed',
  business_referred: 'Est. business referred (₹)',
  business_closed: 'Confirmed business closed (₹)',
  ones_done: 'Completed 121s',
  visitors_invited: 'Visitors invited',
  visitors_joined: 'Visitors who joined',
}

export default function Reports() {
  const [kind, setKind] = useState<Kind>('members')
  const { range, picker } = useRangePicker()
  const [busy, setBusy] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = useQuery({ queryKey: ['admin', 'reports', kind, range.from, range.to], queryFn: () => api.get<any>('admin/reports', { kind, from: range.from, to: range.to }) })
  const label = range.label.replace(/\s+/g, '-')

  const doExport = async () => {
    if (!q.data) return
    setBusy(true)
    try {
      if (kind === 'members') {
        const rows = (q.data.rows as MemberRow[]).map((r) => ({
          Member: r.full_name,
          Business: r.business_name,
          Category: r.category,
          'Referrals given': r.referrals_given,
          'Referrals received': r.referrals_received,
          'Business given (₹)': r.business_given,
          'Business received (₹)': r.business_received,
          '121s done': r.ones_done,
          '121 target': r.ones_target,
          'Visitors invited': r.visitors_invited,
          'Attendance %': r.attendance_pct ?? '',
        }))
        await exportXlsx(`BBA_Member_Performance_${label}.xlsx`, [{ name: 'Member performance', rows, money: ['Business given (₹)', 'Business received (₹)'] }])
      } else if (kind === 'categories') {
        const rows = (q.data.rows as CatRow[]).map((r) => ({ Category: r.category, Members: r.members, 'Referrals received': r.referrals_received, 'Business (₹)': r.business_value }))
        await exportXlsx(`BBA_Category_Performance_${label}.xlsx`, [{ name: 'Categories', rows, money: ['Business (₹)'] }])
      } else if (kind === 'summary') {
        const rows = Object.entries(q.data.summary as Record<string, number>).map(([k, v]) => ({ Metric: SUMMARY_LABELS[k] ?? k, Value: v }))
        await exportXlsx(`BBA_Association_Summary_${label}.xlsx`, [{ name: 'Summary', rows }])
      } else {
        await exportXlsx(`BBA_Raw_Data_${label}.xlsx`, [
          { name: 'Referrals', rows: q.data.referrals, money: ['estimated_value', 'final_value'] },
          { name: '121s', rows: q.data.ones },
          { name: 'Visitors', rows: q.data.visitors },
          { name: 'Members', rows: q.data.members },
        ])
      }
      toast.success('Excel file downloaded')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page max-w-6xl">
      <AdminTitle title="Reports" action={picker} />
      <div className="scroll-x">
        <Segmented
          className="min-w-[420px] flex-1"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'members', label: 'Member-wise' },
            { value: 'categories', label: 'Category-wise' },
            { value: 'summary', label: 'Summary' },
            { value: 'raw', label: 'Raw data' },
          ]}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-ink-600">
          {range.from === '2000-01-01' ? 'All time' : `${range.from} → ${range.to}`}
        </p>
        <Button size="sm" icon={<Download className="h-4 w-4" />} loading={busy} disabled={!q.data} onClick={doExport}>
          Export to Excel
        </Button>
      </div>
      <div className="mt-4">
        {q.isLoading && <ListSkeleton />}
        {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
        {q.data && kind === 'members' && (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="border-b border-line bg-cream-50 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="sticky left-0 bg-cream-50 px-4 py-3">Member</th>
                  <th className="px-3 py-3 text-right">Ref. given</th>
                  <th className="px-3 py-3 text-right">Ref. recd</th>
                  <th className="px-3 py-3 text-right">Biz given</th>
                  <th className="px-3 py-3 text-right">Biz recd</th>
                  <th className="px-3 py-3 text-right">121s</th>
                  <th className="px-3 py-3 text-right">Visitors</th>
                  <th className="px-4 py-3 text-right">Attend.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(q.data.rows as MemberRow[]).map((r) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 bg-white px-4 py-2.5">
                      <p className="font-semibold">{r.full_name}</p>
                      <p className="text-[11.5px] text-ink-400">{r.category}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{r.referrals_given}</td>
                    <td className="px-3 py-2.5 text-right tabular">{r.referrals_received}</td>
                    <td className="px-3 py-2.5 text-right tabular">{inr(r.business_given)}</td>
                    <td className="px-3 py-2.5 text-right tabular">{inr(r.business_received)}</td>
                    <td className="px-3 py-2.5 text-right tabular">
                      {r.ones_done}
                      <span className="text-ink-400">/{r.ones_target}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{r.visitors_invited}</td>
                    <td className="px-4 py-2.5 text-right tabular">{r.attendance_pct === null ? '—' : `${r.attendance_pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {q.data && kind === 'categories' && (
          <div className="card divide-y divide-line overflow-hidden">
            {(q.data.rows as CatRow[]).map((r) => (
              <div key={r.category} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold">{r.category}</p>
                  <p className="text-[12.5px] text-ink-600">
                    {r.members} members · {r.referrals_received} referrals received
                  </p>
                </div>
                <span className="font-display text-[14.5px] font-bold tabular">{inr(r.business_value)}</span>
              </div>
            ))}
          </div>
        )}
        {q.data && kind === 'summary' && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Object.entries(q.data.summary as Record<string, number>).map(([k, v]) => (
              <div key={k} className="card p-4">
                <p className="text-[12.5px] text-ink-600">{SUMMARY_LABELS[k] ?? k}</p>
                <p className="mt-1 font-display text-[22px] font-bold tabular">{k.startsWith('business') ? inr(v) : v}</p>
              </div>
            ))}
          </div>
        )}
        {q.data && kind === 'raw' && (
          <div className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {[
              ['Referrals', q.data.referrals.length],
              ['121s', q.data.ones.length],
              ['Visitors', q.data.visitors.length],
              ['Members', q.data.members.length],
            ].map(([l, n]) => (
              <div key={l}>
                <p className="font-display text-[26px] font-bold">{n}</p>
                <p className="text-[13px] text-ink-600">{l} rows</p>
              </div>
            ))}
            <p className="col-span-full text-[13px] text-ink-600">Export downloads every field for the selected period in one workbook (one sheet each). Use it for monthly backups too.</p>
          </div>
        )}
      </div>
    </div>
  )
}
