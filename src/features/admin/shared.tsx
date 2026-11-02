import { Input, Select } from '@/components/ui'
import { useSavedPeriod } from '@/lib/period'

export type Range = { from: string; to: string; label: string }

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function rangeFor(kind: string): Range {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (kind) {
    case 'last_month':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)), label: new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) }
    case 'this_quarter': {
      const qs = Math.floor(m / 3) * 3
      return { from: iso(new Date(y, qs, 1)), to: iso(new Date(y, qs + 3, 0)), label: `${y}-Q${qs / 3 + 1}` }
    }
    case 'last_quarter': {
      const qs = Math.floor(m / 3) * 3 - 3
      const d = new Date(y, qs, 1)
      return { from: iso(d), to: iso(new Date(y, qs + 3, 0)), label: `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}` }
    }
    case 'this_year':
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) }
    case 'all':
      return { from: '2000-01-01', to: '2999-12-31', label: 'All-time' }
    default:
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)), label: new Date(y, m, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }) }
  }
}

const ADMIN_PERIODS = ['this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'all', 'custom']

/** Period selector with a custom range option, remembered across admin pages and logins until changed. */
export function useRangePicker() {
  const [sel, setSel] = useSavedPeriod('admin', ADMIN_PERIODS)
  const kind = sel.period
  const custom = sel.from <= sel.to ? { from: sel.from, to: sel.to } : { from: sel.to, to: sel.from }
  const setKind = (period: string) => setSel({ period })
  const setCustom = (v: { from: string; to: string }) => setSel(v)
  const range: Range = kind === 'custom' ? { ...custom, label: `${custom.from}_to_${custom.to}` } : rangeFor(kind)
  const picker = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="sm:w-48">
        <Select aria-label="Period" value={kind} onChange={(e) => setKind(e.target.value)} className="h-11 text-[14px]">
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="this_quarter">This quarter</option>
          <option value="last_quarter">Last quarter</option>
          <option value="this_year">This year</option>
          <option value="all">All time</option>
          <option value="custom">Custom range</option>
        </Select>
      </div>
      {kind === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="From" type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} className="h-11" />
          <Input aria-label="To" type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} className="h-11" />
        </div>
      )}
    </div>
  )
  return { range, picker }
}

/** Build and download an .xlsx file client-side. SheetJS is loaded only when needed. */
export async function exportXlsx(filename: string, sheets: { name: string; rows: Record<string, unknown>[]; money?: string[] }[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Note: 'No data for this period' }])
    // ₹ columns stay numeric; give them a rupee number format.
    if (s.money?.length && s.rows.length) {
      const headers = Object.keys(s.rows[0])
      const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
      s.money.forEach((col) => {
        const c = headers.indexOf(col)
        if (c < 0) return
        for (let r = 1; r <= range.e.r; r++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          if (cell && typeof cell.v === 'number') cell.z = '"₹"#,##,##0'
        }
      })
    }
    const headers = Object.keys(s.rows[0] ?? { Note: '' })
    ws['!cols'] = headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 2)) }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  })
  XLSX.writeFile(wb, filename)
}

export function AdminTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="mt-0.5 text-[14px] text-ink-600">{sub}</p>}
      </div>
      {action}
    </div>
  )
}
