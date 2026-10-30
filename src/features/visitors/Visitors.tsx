import { useMutation, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Phone, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button, EmptyState, ErrorState, ListSkeleton, StatusPill, itemVariants, listVariants } from '@/components/ui'
import { useQuickAdd } from '@/features/quickadd/QuickAdd'
import { api, errorMessage } from '@/lib/api'
import { fmtShortDate } from '@/lib/format'
import { useRefreshAll } from '@/lib/session'
import type { Meeting, Visitor } from '@/lib/types'

const STATUSES: { value: Visitor['status']; label: string }[] = [
  { value: 'invited', label: 'Invited' },
  { value: 'attended', label: 'Attended' },
  { value: 'joined', label: 'Joined' },
  { value: 'not_interested', label: 'Not interested' },
]

export default function Visitors() {
  const qa = useQuickAdd()
  const refresh = useRefreshAll()
  const q = useQuery({ queryKey: ['visitors'], queryFn: () => api.get<{ items: Visitor[]; meetings: Meeting[] }>('visitors') })
  const update = useMutation({
    mutationFn: (v: { id: number; status: string }) => api.post('visitors/status', v),
    onSuccess: () => {
      toast.success('Visitor updated')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const items = q.data?.items ?? []
  const joined = items.filter((v) => v.status === 'joined').length

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Visitors</h1>
        <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => qa.open('visitor')}>
          Invite
        </Button>
      </div>
      {items.length > 0 && (
        <p className="mt-2 text-[14px] text-ink-600">
          You've invited <span className="font-semibold text-ink-950">{items.length}</span> visitor{items.length === 1 ? '' : 's'}
          {joined > 0 && (
            <>
              {' '}
              · <span className="font-semibold text-success">{joined} joined</span>
            </>
          )}
        </p>
      )}
      <div className="mt-4">
        {q.isLoading && <ListSkeleton />}
        {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
        {q.data && items.length === 0 && (
          <EmptyState icon={<UserPlus className="h-6 w-6" />} title="No visitors yet" sub="Invite a business owner to a chapter meeting. If they join, you get the credit." action={<Button onClick={() => qa.open('visitor')}>Invite a visitor</Button>} />
        )}
        {items.length > 0 && (
          <motion.div variants={listVariants} initial="hidden" animate="show" className="card divide-y divide-line overflow-hidden">
            {items.map((v) => (
              <motion.div key={v.id} variants={itemVariants} className="flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{v.name}</p>
                  <p className="truncate text-[13px] text-ink-600">
                    {v.business || 'No business added'} · {fmtShortDate(v.invited_date)}
                  </p>
                  {v.meeting_title && <p className="truncate text-[12px] text-ink-400">For: {v.meeting_title}{v.meeting_date ? ` · ${fmtShortDate(v.meeting_date)}` : ''}</p>}
                  <div className="mt-2">
                    {v.status === 'joined' ? (
                      <StatusPill status="joined" />
                    ) : (
                      <select
                        aria-label="Visitor status"
                        value={v.status}
                        onChange={(e) => update.mutate({ id: v.id, status: e.target.value })}
                        className="h-9 rounded-[10px] border border-line bg-white px-2.5 text-[13px] font-semibold"
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <a href={`tel:+91${v.mobile}`} aria-label={`Call ${v.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-100 text-ink-800 hover:bg-cream-200">
                  <Phone className="h-4 w-4" />
                </a>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
