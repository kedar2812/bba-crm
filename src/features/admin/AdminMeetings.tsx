import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCheck, ClipboardCheck, Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sheet } from '@/components/Sheet'
import { Avatar, Button, Checkbox, EmptyState, ErrorState, Input, ListSkeleton, Skeleton, Textarea, cx } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { fmtClock, fmtDate, todayISO } from '@/lib/format'
import type { Meeting } from '@/lib/types'
import { AdminTitle } from './shared'

type Row = Meeting & { present_count: number; marked_count: number; visitors_count: number }
type Mark = 'present' | 'absent' | 'excused'

export default function AdminMeetings() {
  const q = useQuery({ queryKey: ['admin', 'meetings'], queryFn: () => api.get<Row[]>('admin/meetings') })
  const [editing, setEditing] = useState<Partial<Meeting> | null>(null)
  const [sheetFor, setSheetFor] = useState<number | null>(null)
  const today = todayISO()
  const rows = q.data ?? []

  return (
    <div className="page">
      <AdminTitle
        title="Meetings & Attendance"
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ title: 'Weekly chapter meeting', meeting_date: today, start_time: '08:00', venue: '', online_link: '', notes: '' })}>
            New meeting
          </Button>
        }
      />
      {q.isLoading && <ListSkeleton rows={4} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && rows.length === 0 && <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No meetings yet" sub="Create the next chapter meeting so members and the landing page can see it." />}
      {rows.length > 0 && (
        <div className="card divide-y divide-line overflow-hidden">
          {rows.map((m) => {
            const upcoming = m.meeting_date >= today
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">
                    {m.title} {upcoming && <span className="ml-1 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-semibold text-gold-700">Upcoming</span>}
                  </p>
                  <p className="text-[13px] text-ink-600">
                    {fmtDate(m.meeting_date)} · {fmtClock(m.start_time)}
                    {m.venue ? ` · ${m.venue}` : ''}
                  </p>
                  <p className="text-[12px] text-ink-400">
                    {m.marked_count ? `${m.present_count} present of ${m.marked_count} marked` : 'Attendance not marked'}
                    {m.visitors_count ? ` · ${m.visitors_count} visitor${m.visitors_count === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(m)}>
                    Edit
                  </Button>
                  <Button size="sm" variant={upcoming ? 'outline' : 'secondary'} icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => setSheetFor(m.id)}>
                    Attendance
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {editing && <MeetingForm m={editing} onClose={() => setEditing(null)} />}
      {sheetFor && <AttendanceSheet meetingId={sheetFor} onClose={() => setSheetFor(null)} />}
    </div>
  )
}

function MeetingForm({ m, onClose }: { m: Partial<Meeting>; onClose: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState({ title: m.title ?? '', meeting_date: m.meeting_date ?? todayISO(), start_time: (m.start_time ?? '08:00').slice(0, 5), venue: m.venue ?? '', online_link: m.online_link ?? '', notes: m.notes ?? '' })
  const save = useMutation({
    mutationFn: () => api.post('admin/meetings/save', { id: m.id, ...v }),
    onSuccess: () => {
      toast.success(m.id ? 'Meeting updated' : 'Meeting created')
      qc.invalidateQueries({ queryKey: ['admin'] })
      qc.invalidateQueries({ queryKey: ['meetings'] })
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const e = fieldErrors(save.error)
  return (
    <Sheet open onClose={onClose} title={m.id ? 'Edit meeting' : 'New meeting'}>
      <form
        className="space-y-4 pt-1"
        onSubmit={(ev) => {
          ev.preventDefault()
          save.mutate()
        }}
      >
        <Input label="Title" value={v.title} onChange={(x) => setV({ ...v, title: x.target.value })} error={e.title} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={v.meeting_date} onChange={(x) => setV({ ...v, meeting_date: x.target.value })} error={e.meeting_date} />
          <Input label="Start time" type="time" value={v.start_time} onChange={(x) => setV({ ...v, start_time: x.target.value })} error={e.start_time} />
        </div>
        <Input label="Venue" optional value={v.venue} onChange={(x) => setV({ ...v, venue: x.target.value })} />
        <Input label="Online link" optional value={v.online_link} onChange={(x) => setV({ ...v, online_link: x.target.value })} error={e.online_link} autoCapitalize="none" />
        <Textarea label="Notes" optional rows={2} value={v.notes} onChange={(x) => setV({ ...v, notes: x.target.value })} />
        <Button type="submit" block size="lg" loading={save.isPending}>
          {m.id ? 'Save meeting' : 'Create meeting'}
        </Button>
      </form>
    </Sheet>
  )
}

function AttendanceSheet({ meetingId, onClose }: { meetingId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['admin', 'attendance', meetingId],
    queryFn: () =>
      api.get<{ meeting: Meeting; members: { id: number; full_name: string; business_name: string; photo_url: string | null; status: Mark | null }[]; visitors: { id: number; name: string; business: string | null; status: string; inviter_name: string }[] }>('admin/attendance', { meeting_id: meetingId }),
  })
  const [marks, setMarks] = useState<Record<number, Mark>>({})
  const [vis, setVis] = useState<Record<number, boolean>>({})
  useEffect(() => {
    if (!q.data) return
    const m: Record<number, Mark> = {}
    q.data.members.forEach((x) => x.status && (m[x.id] = x.status))
    setMarks(m)
    const v: Record<number, boolean> = {}
    q.data.visitors.forEach((x) => (v[x.id] = x.status === 'attended' || x.status === 'joined'))
    setVis(v)
  }, [q.data])
  const save = useMutation({
    mutationFn: () => api.post('admin/attendance/save', { meeting_id: meetingId, members: marks, visitors: vis }),
    onSuccess: () => {
      toast.success('Attendance saved')
      qc.invalidateQueries({ queryKey: ['admin'] })
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const members = q.data?.members ?? []
  const present = Object.values(marks).filter((m) => m === 'present').length

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={q.data ? `Attendance · ${fmtDate(q.data.meeting.meeting_date)}` : 'Attendance'}
      footer={
        <div className="flex items-center gap-3">
          <p className="flex-1 text-[13px] text-ink-600">
            <span className="font-semibold text-ink-950">{present}</span> present · {Object.keys(marks).length}/{members.length} marked
          </p>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      }
    >
      {q.isLoading && <Skeleton className="h-64" />}
      {q.data && (
        <div className="space-y-4 pt-1">
          <Button
            block
            variant="secondary"
            icon={<CheckCheck className="h-4 w-4" />}
            onClick={() => {
              const m: Record<number, Mark> = {}
              members.forEach((x) => (m[x.id] = 'present'))
              setMarks(m)
            }}
          >
            Mark everyone present
          </Button>
          <div className="divide-y divide-line rounded-card border border-line bg-white">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar src={m.photo_url} name={m.full_name} size={34} />
                <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{m.full_name}</p>
                <div className="flex shrink-0 rounded-[10px] bg-ink-950/[.06] p-0.5">
                  {(['present', 'absent', 'excused'] as Mark[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setMarks({ ...marks, [m.id]: s })}
                      className={cx(
                        'h-9 w-9 rounded-[8px] text-[13px] font-bold transition-colors sm:w-auto sm:px-2.5',
                        marks[m.id] === s ? (s === 'present' ? 'bg-success text-white' : s === 'absent' ? 'bg-danger text-white' : 'bg-ink-600 text-white') : 'text-ink-600',
                      )}
                      aria-label={s}
                      title={s}
                    >
                      <span className="sm:hidden">{s[0].toUpperCase()}</span>
                      <span className="hidden sm:inline">{s[0].toUpperCase() + s.slice(1)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {q.data.visitors.length > 0 && (
            <div>
              <h3 className="mb-2 text-[15px] font-bold">Visitors invited to this meeting</h3>
              <div className="divide-y divide-line rounded-card border border-line bg-white">
                {q.data.visitors.map((v) => (
                  <div key={v.id} className="px-3 py-2">
                    <Checkbox checked={!!vis[v.id]} onChange={(c) => setVis({ ...vis, [v.id]: c })}>
                      <span className="font-semibold">{v.name}</span> <span className="text-ink-400">· invited by {v.inviter_name}</span>
                    </Checkbox>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
