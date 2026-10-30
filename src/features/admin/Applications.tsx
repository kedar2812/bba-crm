import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Check, ChevronDown, Inbox, Mail, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Sheet } from '@/components/Sheet'
import { Avatar, Button, EmptyState, ErrorState, ListSkeleton, Segmented, StatusPill, Tags, Textarea, cx } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { fmtDate, relTime } from '@/lib/format'
import { AdminTitle } from './shared'

interface App {
  id: number
  full_name: string
  email: string
  mobile: string
  its_number: string
  photo_url: string | null
  business_name: string
  category_name: string | null
  category_other: string | null
  designation: string
  business_description: string
  address: string
  city: string
  website: string | null
  instagram: string | null
  linkedin: string | null
  facebook: string | null
  offers: string[]
  looking_for: string[]
  referred_by_text: string | null
  status: string
  created_at: string
  approved_at: string | null
  approver_name: string | null
  rejection_reason: string | null
  visitor_link: { code: string; inviter: string } | null
}

function Field({ l, v }: { l: string; v?: string | null }) {
  if (!v) return null
  return (
    <div>
      <p className="text-[12px] font-semibold text-ink-400">{l}</p>
      <p className="break-words text-[14px]">{v}</p>
    </div>
  )
}

export default function Applications() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [action, setAction] = useState<{ app: App; kind: 'approve' | 'reject' | 'info' } | null>(null)
  const [note, setNote] = useState('')
  const q = useQuery({ queryKey: ['admin', 'applications'], queryFn: () => api.get<{ pending: App[]; history: App[] }>('admin/applications') })

  const decide = useMutation({
    mutationFn: () => {
      if (!action) throw new Error('No action')
      if (action.kind === 'info') return api.post('admin/applications/request-info', { id: action.app.id, message: note })
      return api.post('admin/applications/decide', { id: action.app.id, action: action.kind, note })
    },
    onSuccess: () => {
      toast.success(action?.kind === 'approve' ? `${action.app.full_name} approved — welcome email sent` : action?.kind === 'reject' ? 'Application rejected' : 'Email sent to the applicant')
      setAction(null)
      setNote('')
      qc.invalidateQueries({ queryKey: ['admin'] })
      qc.invalidateQueries({ queryKey: ['unread'] })
      qc.invalidateQueries({ queryKey: ['picker'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const list = tab === 'pending' ? q.data?.pending : q.data?.history

  return (
    <div className="page">
      <AdminTitle title="Applications" sub="Oldest first. Approving emails the member and announces them to everyone." />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'pending', label: `Pending${q.data?.pending.length ? ` · ${q.data.pending.length}` : ''}` }, { value: 'history', label: 'History' }]} />
      <div className="mt-4">
        {q.isLoading && <ListSkeleton rows={3} />}
        {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
        {list && list.length === 0 && <EmptyState icon={<Inbox className="h-6 w-6" />} title={tab === 'pending' ? 'No pending applications' : 'No decisions yet'} sub={tab === 'pending' ? 'New applications appear here after the applicant verifies their email.' : undefined} />}
        <div className="space-y-3">
          {list?.map((a) => {
            const open = expanded === a.id
            return (
              <motion.div key={a.id} layout="position" className="card overflow-hidden">
                <button type="button" onClick={() => setExpanded(open ? null : a.id)} className="flex w-full items-center gap-3 p-4 text-left">
                  <Avatar src={a.photo_url} name={a.full_name} size={52} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15.5px] font-semibold">{a.full_name}</p>
                    <p className="truncate text-[13px] text-ink-600">
                      {a.business_name} · {a.category_other || a.category_name}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-400">
                      {a.city} · applied {relTime(a.created_at)}
                    </p>
                  </div>
                  {tab === 'history' ? <StatusPill status={a.status} /> : <ChevronDown className={cx('h-4 w-4 text-ink-400 transition-transform', open && 'rotate-180')} />}
                </button>
                {(open || tab === 'history') && (
                  <div className="border-t border-line bg-cream-50 p-4">
                    {tab === 'history' ? (
                      <p className="text-[13px] text-ink-600">
                        {a.status === 'approved' ? 'Approved' : 'Rejected'} by {a.approver_name ?? 'admin'} on {fmtDate(a.approved_at)}
                        {a.rejection_reason ? ` — “${a.rejection_reason}”` : ''}
                      </p>
                    ) : (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field l="ITS number" v={a.its_number} />
                          <Field l="Mobile" v={`+91 ${a.mobile}`} />
                          <Field l="Email" v={a.email} />
                          <Field l="Designation" v={a.designation} />
                          <Field l="Referred by" v={a.referred_by_text} />
                          {a.visitor_link && <Field l="Was a visitor" v={`Invited by ${a.visitor_link.inviter} (${a.visitor_link.code})`} />}
                          <Field l="Address" v={`${a.address}, ${a.city}`} />
                          <Field l="Website" v={a.website} />
                        </div>
                        <div className="mt-3 space-y-3">
                          <Field l="Business description" v={a.business_description} />
                          <div>
                            <p className="mb-1.5 text-[12px] font-semibold text-ink-400">Offers</p>
                            <Tags items={a.offers} />
                          </div>
                          {a.looking_for.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-[12px] font-semibold text-ink-400">Looking for</p>
                              <Tags items={a.looking_for} />
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {tab === 'pending' && (
                  <div className="grid grid-cols-3 gap-2 border-t border-line p-3">
                    <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => setAction({ app: a, kind: 'approve' })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" icon={<Mail className="h-4 w-4" />} onClick={() => setAction({ app: a, kind: 'info' })}>
                      Ask info
                    </Button>
                    <Button size="sm" variant="ghost" className="text-danger" icon={<X className="h-4 w-4" />} onClick={() => setAction({ app: a, kind: 'reject' })}>
                      Reject
                    </Button>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>

      <Sheet open={!!action} onClose={() => setAction(null)} title={action ? `${action.kind === 'approve' ? 'Approve' : action.kind === 'reject' ? 'Reject' : 'Request info from'} ${action.app.full_name.split(' ')[0]}` : ''}>
        {action && (
          <form
            className="space-y-4 pt-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (action.kind !== 'approve' && !note.trim()) return toast.error(action.kind === 'reject' ? 'An internal reason is required.' : 'Write a message.')
              decide.mutate()
            }}
          >
            <Textarea
              label={action.kind === 'approve' ? 'Welcome note' : action.kind === 'reject' ? 'Internal reason (not emailed)' : 'Message to the applicant'}
              optional={action.kind === 'approve'}
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {action.kind === 'reject' && <p className="text-[13px] text-ink-600">The applicant receives a polite, generic email. Your reason stays internal.</p>}
            <Button type="submit" block size="lg" variant={action.kind === 'reject' ? 'danger' : 'primary'} loading={decide.isPending}>
              {action.kind === 'approve' ? 'Approve & send welcome email' : action.kind === 'reject' ? 'Reject application' : 'Send email'}
            </Button>
          </form>
        )}
      </Sheet>
    </div>
  )
}
