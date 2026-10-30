import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Bell, CalendarCheck, CheckCheck, HeartHandshake, Inbox, MessageSquareQuote, PartyPopper, Send, TriangleAlert, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, ErrorState, ListSkeleton, cx, itemVariants, listVariants } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { relTime } from '@/lib/format'
import type { Notification } from '@/lib/types'

function iconFor(type: string): ReactNode {
  if (type.startsWith('121')) return <CalendarCheck className="h-4 w-4" />
  if (type === 'referral_won') return <HeartHandshake className="h-4 w-4" />
  if (type.startsWith('referral')) return <Send className="h-4 w-4" />
  if (type === 'disputed') return <TriangleAlert className="h-4 w-4" />
  if (type === 'testimonial') return <MessageSquareQuote className="h-4 w-4" />
  if (type === 'member_joined' || type === 'visitor_joined') return <UserPlus className="h-4 w-4" />
  if (type === 'welcome') return <PartyPopper className="h-4 w-4" />
  if (type === 'application') return <Inbox className="h-4 w-4" />
  return <Bell className="h-4 w-4" />
}

export default function Notifications() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<Notification[]>('notifications') })
  const read = useMutation({
    mutationFn: (ids?: number[]) => api.post('notifications/read', { ids }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['notifications'] })
      const prev = qc.getQueryData<Notification[]>(['notifications'])
      const now = new Date().toISOString()
      qc.setQueryData<Notification[]>(['notifications'], (old) => old?.map((n) => (!ids || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)))
      qc.setQueryData<{ unread: number }>(['unread'], (old) => (old ? { ...old, unread: ids ? Math.max(0, old.unread - ids.length) : 0 } : old))
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['notifications'], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['unread'] }),
  })
  const items = q.data ?? []
  const unread = items.filter((n) => !n.read_at).length

  return (
    <div className="page max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">Notifications</h1>
        {unread > 0 && (
          <Button size="sm" variant="outline" icon={<CheckCheck className="h-4 w-4" />} onClick={() => read.mutate(undefined)}>
            Mark all read
          </Button>
        )}
      </div>
      <div className="mt-4">
        {q.isLoading && <ListSkeleton />}
        {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
        {q.data && items.length === 0 && <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up" sub="Referrals, 121 requests and updates will show up here." />}
        {items.length > 0 && (
          <motion.div variants={listVariants} initial="hidden" animate="show" className="card divide-y divide-line overflow-hidden">
            {items.map((n) => (
              <motion.button
                key={n.id}
                variants={itemVariants}
                type="button"
                onClick={() => {
                  if (!n.read_at) read.mutate([n.id])
                  if (n.link) nav(n.link)
                }}
                className={cx('flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-cream-50', !n.read_at && 'bg-gold-100/40')}
              >
                <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', n.read_at ? 'bg-cream-100 text-ink-600' : 'bg-ink-950 text-gold-300')}>{iconFor(n.type)}</span>
                <div className="min-w-0 flex-1">
                  <p className={cx('text-[14.5px] leading-snug', !n.read_at && 'font-semibold')}>{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-600">{n.body}</p>}
                  <p className="mt-1 text-[12px] text-ink-400">{relTime(n.created_at)}</p>
                </div>
                {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-500" />}
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
