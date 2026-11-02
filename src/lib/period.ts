import { useState } from 'react'
import { todayISO } from './format'
import { useMe } from './session'

export interface PeriodSel {
  period: string
  from: string
  to: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
// Survives page changes even where the browser blocks localStorage.
const memory = new Map<string, PeriodSel>()

function read(key: string): Partial<PeriodSel> | null {
  const hit = memory.get(key)
  if (hit) return hit
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Partial<PeriodSel>) : null
  } catch {
    return null
  }
}

function write(key: string, v: PeriodSel) {
  memory.set(key, v)
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* private mode / storage blocked: the in-memory copy still holds for this visit */
  }
}

function clean(v: Partial<PeriodSel> | null, valid: string[]): PeriodSel {
  const monthStart = todayISO().slice(0, 8) + '01'
  const from = typeof v?.from === 'string' && ISO.test(v.from) ? v.from : monthStart
  const to = typeof v?.to === 'string' && ISO.test(v.to) ? v.to : todayISO()
  const period = typeof v?.period === 'string' && valid.includes(v.period) ? v.period : 'this_month'
  return { period, from, to }
}

/**
 * The period someone picked — remembered across pages, reloads and logins (per account, on
 * this device) until they change it themselves.
 */
export function useSavedPeriod(scope: 'member' | 'admin', valid: string[]) {
  const id = useMe().data?.member?.id ?? 0
  const key = `bba:period:${scope}:${id}`
  const [, rerender] = useState(0)
  const sel = clean(read(key), valid)
  const set = (next: Partial<PeriodSel>) => {
    write(key, clean({ ...sel, ...next }, valid))
    rerender((n) => n + 1)
  }
  return [sel, set] as const
}

/** Query-string params the API reads for a period (custom ranges carry their dates). */
export function periodParams(sel: PeriodSel): Record<string, string> {
  return sel.period === 'custom' ? { period: 'custom', from: sel.from, to: sel.to } : { period: sel.period }
}
