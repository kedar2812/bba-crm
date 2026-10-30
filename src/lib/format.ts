const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const numFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export function inr(n: number | null | undefined) {
  return inrFmt.format(Number(n) || 0)
}

/** ₹12.5L / ₹1.2Cr for stat cards; full grouping below one lakh. */
export function inrCompact(n: number | null | undefined) {
  const v = Number(n) || 0
  const abs = Math.abs(v)
  const trim = (x: number) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, '')
  if (abs >= 1e7) return `₹${trim(v / 1e7)}Cr`
  if (abs >= 1e5) return `₹${trim(v / 1e5)}L`
  return inr(v)
}

export function num(n: number | null | undefined) {
  return numFmt.format(Number(n) || 0)
}

/** Parse "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss" (IST, from the server) as local time. */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const [d, t = '00:00:00'] = s.split(/[ T]/)
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm, ss] = t.split(':').map(Number)
  const out = new Date(y, (m || 1) - 1, day || 1, hh || 0, mm || 0, ss || 0)
  return isNaN(out.getTime()) ? null : out
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(s: string | null | undefined) {
  const d = parseDate(s)
  if (!d) return ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtShortDate(s: string | null | undefined) {
  const d = parseDate(s)
  if (!d) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`
}

export function fmtTime(s: string | null | undefined) {
  const d = parseDate(s)
  if (!d) return ''
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

/** "08:00" → "8:00 AM" */
export function fmtClock(hhmm: string | null | undefined) {
  if (!hhmm) return ''
  return fmtTime(`2000-01-01 ${hhmm}:00`)
}

export function fmtDateTime(s: string | null | undefined) {
  return `${fmtShortDate(s)}, ${fmtTime(s)}`
}

export function relTime(s: string | null | undefined) {
  const d = parseDate(s)
  if (!d) return ''
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 0) return fmtShortDate(s)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return fmtShortDate(s)
}

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Value for <input type="datetime-local"> */
export function localDateTimeValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function firstName(name: string | null | undefined) {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Indian digit grouping for a raw numeric string: "1250000" → "12,50,000" */
export function groupIndian(raw: string) {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (!digits) return ''
  return numFmt.format(Number(digits))
}

export function waLink(mobile: string) {
  return `https://wa.me/91${mobile.replace(/\D/g, '').slice(-10)}`
}
