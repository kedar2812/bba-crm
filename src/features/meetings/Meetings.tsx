import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Link2, MapPin } from 'lucide-react'
import { EmptyState, ErrorState, ListSkeleton, StatusPill } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { fmtClock, fmtDate, parseDate } from '@/lib/format'
import type { Meeting } from '@/lib/types'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function DateBadge({ date, dark }: { date: string; dark?: boolean }) {
  const d = parseDate(date)
  return (
    <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[14px] ${dark ? 'bg-ink-950 text-white' : 'bg-cream-100 text-ink-950'}`}>
      <span className={`text-[10.5px] font-bold tracking-wider ${dark ? 'text-gold-300' : 'text-gold-700'}`}>{d ? MONTHS[d.getMonth()] : ''}</span>
      <span className="font-display text-[21px] font-bold leading-none">{d?.getDate()}</span>
    </div>
  )
}

function MeetingRow({ m, upcoming }: { m: Meeting; upcoming?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <DateBadge date={m.meeting_date} dark={upcoming} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{m.title}</p>
        <p className="text-[13px] text-ink-600">
          {fmtDate(m.meeting_date)} · {fmtClock(m.start_time)}
        </p>
        {m.venue && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-ink-600">
            <MapPin className="h-3 w-3 shrink-0" /> {m.venue}
          </p>
        )}
        {m.online_link && upcoming && (
          <a href={m.online_link} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-gold-700">
            <Link2 className="h-3 w-3" /> Join online
          </a>
        )}
      </div>
      {!upcoming && (m.my_status ? <StatusPill status={m.my_status} /> : <span className="text-[12px] text-ink-400">Not marked</span>)}
    </div>
  )
}

export default function Meetings() {
  const q = useQuery({ queryKey: ['meetings'], queryFn: () => api.get<{ upcoming: Meeting[]; past: Meeting[]; attendance_quarter: number | null; attendance_all: number | null }>('meetings') })
  const d = q.data
  return (
    <div className="page">
      <h1 className="page-title">Meetings & Attendance</h1>
      {d && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-card bg-ink-950 p-4 text-white">
            <p className="text-[12px] text-white/60">Attendance this quarter</p>
            <p className="mt-1 font-display text-[26px] font-bold text-gold-300">{d.attendance_quarter === null ? '—' : `${d.attendance_quarter}%`}</p>
          </div>
          <div className="card p-4">
            <p className="text-[12px] text-ink-600">All time</p>
            <p className="mt-1 font-display text-[26px] font-bold">{d.attendance_all === null ? '—' : `${d.attendance_all}%`}</p>
          </div>
        </div>
      )}
      {q.isLoading && (
        <div className="mt-4">
          <ListSkeleton rows={4} />
        </div>
      )}
      {q.isError && (
        <div className="mt-4">
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </div>
      )}
      {d && (
        <>
          <h2 className="mb-3 mt-7 text-[17px] font-bold">Upcoming</h2>
          {d.upcoming.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No meetings scheduled" sub="The committee will add the next chapter meeting soon." />
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {d.upcoming.map((m) => (
                <MeetingRow key={m.id} m={m} upcoming />
              ))}
            </div>
          )}
          {d.past.length > 0 && (
            <>
              <h2 className="mb-3 mt-7 text-[17px] font-bold">Past meetings</h2>
              <div className="card divide-y divide-line overflow-hidden">
                {d.past.map((m) => (
                  <MeetingRow key={m.id} m={m} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
