import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { useState } from 'react'
import { Button, EmptyState, ErrorState, ListSkeleton, Select } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { fmtDateTime } from '@/lib/format'
import type { Paged } from '@/lib/types'
import { AdminTitle } from './shared'

interface Log {
  id: number
  actor_name: string | null
  action: string
  entity: string
  entity_id: number | null
  before_json: string | null
  after_json: string | null
  ip: string
  created_at: string
}

function Diff({ before, after }: { before: string | null; after: string | null }) {
  let b: Record<string, unknown> = {}
  let a: Record<string, unknown> = {}
  try {
    b = before ? JSON.parse(before) : {}
    a = after ? JSON.parse(after) : {}
  } catch {
    return null
  }
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]))
  if (!keys.length) return null
  return (
    <div className="mt-2 space-y-1 rounded-[10px] bg-cream-100 p-2.5 text-[12.5px]">
      {keys.map((k) => (
        <p key={k} className="break-words">
          <span className="font-semibold">{k}:</span> {b[k] !== undefined && <span className="text-danger line-through">{String(b[k] ?? '∅')}</span>} {a[k] !== undefined && <span className="text-success">{String(a[k] ?? '∅')}</span>}
        </p>
      ))}
    </div>
  )
}

export default function Audit() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['admin', 'audit', action, page], queryFn: () => api.get<Paged<Log> & { actions: string[] }>('admin/audit', { action, page }), placeholderData: keepPreviousData })
  const d = q.data
  return (
    <div className="page max-w-4xl">
      <AdminTitle
        title="Audit Log"
        sub="Read-only record of logins, approvals, edits and settings changes."
        action={
          <div className="sm:w-60">
            <Select aria-label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className="h-11 text-[14px]">
              <option value="">All actions</option>
              {d?.actions.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {q.isLoading && <ListSkeleton />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {d && d.items.length === 0 && <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No entries" />}
      {d && d.items.length > 0 && (
        <div className="card divide-y divide-line overflow-hidden">
          {d.items.map((l) => (
            <div key={l.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[14px]">
                  <span className="font-semibold">{l.actor_name ?? 'System'}</span> · <span className="font-medium text-gold-700">{l.action.replace(/_/g, ' ')}</span>
                  <span className="text-ink-400">
                    {' '}
                    · {l.entity}
                    {l.entity_id ? ` #${l.entity_id}` : ''}
                  </span>
                </p>
                <p className="text-[12px] text-ink-400">
                  {fmtDateTime(l.created_at)} · {l.ip}
                </p>
              </div>
              <Diff before={l.before_json} after={l.after_json} />
            </div>
          ))}
        </div>
      )}
      {d && d.total > d.per_page && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-[13px] text-ink-600">
            Page {page} of {Math.ceil(d.total / d.per_page)}
          </span>
          <Button variant="outline" size="sm" disabled={page * d.per_page >= d.total} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
