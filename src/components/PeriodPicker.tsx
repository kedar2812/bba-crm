import type { PeriodSel } from '@/lib/period'
import { cx, Input, Select } from './ui'

export const MEMBER_PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
]

/** Period select plus From/To dates for a custom range. */
export function PeriodPicker({ sel, onChange, options = MEMBER_PERIODS, className }: { sel: PeriodSel; onChange: (v: Partial<PeriodSel>) => void; options?: { value: string; label: string }[]; className?: string }) {
  return (
    <div className={cx('flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end', className)}>
      <div className="sm:w-48">
        <Select aria-label="Period" value={sel.period} onChange={(e) => onChange({ period: e.target.value })} className="h-11">
          {options.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      {sel.period === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="From" type="date" value={sel.from} max={sel.to} onChange={(e) => e.target.value && onChange({ from: e.target.value })} className="h-11" />
          <Input aria-label="To" type="date" value={sel.to} min={sel.from} onChange={(e) => e.target.value && onChange({ to: e.target.value })} className="h-11" />
        </div>
      )}
    </div>
  )
}
