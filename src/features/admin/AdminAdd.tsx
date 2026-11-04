import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, IndianRupee } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MemberPicker } from '@/components/MemberPicker'
import { Sheet } from '@/components/Sheet'
import { Button, Input, MoneyInput, Segmented } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { localDateTimeValue, todayISO } from '@/lib/format'

function useAdminAdd(path: string, done: (code: string) => void) {
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ code: string }>(path, body),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['admin'] })
      done(d.code)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return { ...m, errors: fieldErrors(m.error) }
}

/**
 * Business closed between two members, recorded by an admin. Counts once, like a thank-you note.
 * `giver` / `receiver` pre-fill one side when opened from a member's page.
 */
export function AddBusiness({ open, onClose, onDone, giver, receiver }: { open: boolean; onClose: () => void; onDone: () => void; giver?: number | null; receiver?: number | null }) {
  const empty = () => ({ giver: giver ?? null, receiver: receiver ?? null, value: '', requirement: '', client: '', date: todayISO(), note: '' })
  const [v, setV] = useState(empty)
  const [local, setLocal] = useState<Record<string, string>>({})
  // Re-apply the pre-filled member each time the sheet opens (the same sheet can open for "given" or "received").
  useEffect(() => {
    if (open && (giver !== undefined || receiver !== undefined)) setV((cur) => ({ ...cur, giver: giver ?? null, receiver: receiver ?? null }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, giver, receiver])
  const m = useAdminAdd('admin/records/add-business', (code) => {
    toast.success(`Business recorded · ${code}`)
    setV(empty())
    setLocal({})
    onDone()
  })
  const e = { ...m.errors, ...local }
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault()
    const x: Record<string, string> = {}
    if (!v.giver) x.giver_id = 'Pick the member who gave the business.'
    if (!v.receiver) x.receiver_id = 'Pick the member who received it.'
    if (v.giver && v.giver === v.receiver) x.receiver_id = 'Pick two different members.'
    if (!Number(v.value)) x.value = 'Enter the business value.'
    if (!v.requirement.trim()) x.requirement = 'Say what the business was for.'
    setLocal(x)
    if (Object.keys(x).length) return
    m.mutate({ giver_id: v.giver, receiver_id: v.receiver, value: v.value, requirement: v.requirement, client_name: v.client, won_date: v.date, note: v.note })
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add business">
      <form className="space-y-4 pt-1" onSubmit={submit} noValidate>
        <p className="rounded-field bg-gold-100/70 px-3.5 py-2.5 text-[13.5px] leading-snug text-ink-800">
          Business one member passed to another. It counts once (received for one, generated for the other) and both are notified.
        </p>
        <MemberPicker label="Who gave the business?" value={v.giver} onChange={(id) => setV({ ...v, giver: id })} error={e.giver_id} />
        <MemberPicker label="Who received it?" value={v.receiver} onChange={(id) => setV({ ...v, receiver: id })} error={e.receiver_id} />
        <MoneyInput label="Business value (amount)" value={v.value} onChange={(x) => setV({ ...v, value: x })} error={e.value} placeholder="0" />
        <Input label="What was it for?" value={v.requirement} onChange={(x) => setV({ ...v, requirement: x.target.value })} error={e.requirement} placeholder="e.g. PVC flooring" autoComplete="off" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" max={todayISO()} value={v.date} onChange={(x) => setV({ ...v, date: x.target.value })} error={e.won_date} />
          <Input label="Client" optional value={v.client} onChange={(x) => setV({ ...v, client: x.target.value })} autoComplete="off" />
        </div>
        <Input label="Note" optional value={v.note} onChange={(x) => setV({ ...v, note: x.target.value })} />
        <Button type="submit" block size="lg" loading={m.isPending}>
          Record business
        </Button>
      </form>
    </Sheet>
  )
}

/** A 121 that already happened, recorded by an admin. Counts right away for both members. */
export function Add121({ open, onClose, onDone, member }: { open: boolean; onClose: () => void; onDone: () => void; member?: number | null }) {
  const start = () => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    return localDateTimeValue(d)
  }
  const empty = () => ({ a: member ?? null, b: null as number | null, at: start(), mode: 'in_person' as 'in_person' | 'online', discussed: '' })
  const [v, setV] = useState(empty)
  const [local, setLocal] = useState<Record<string, string>>({})
  useEffect(() => {
    if (open && member) setV((cur) => ({ ...cur, a: member }))
  }, [open, member])
  const m = useAdminAdd('admin/records/add-121', (code) => {
    toast.success(`121 recorded · ${code}`)
    setV(empty())
    setLocal({})
    onDone()
  })
  const e = { ...m.errors, ...local }
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault()
    const x: Record<string, string> = {}
    if (!v.a) x.member_a = 'Pick the first member.'
    if (!v.b) x.member_b = 'Pick the second member.'
    if (v.a && v.a === v.b) x.member_b = 'Pick two different members.'
    if (!v.at) x.meeting_at = 'Pick the date and time.'
    setLocal(x)
    if (Object.keys(x).length) return
    m.mutate({ member_a: v.a, member_b: v.b, meeting_at: v.at, mode: v.mode, business_discussed: v.discussed })
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add 121">
      <form className="space-y-4 pt-1" onSubmit={submit} noValidate>
        <p className="rounded-field bg-gold-100/70 px-3.5 py-2.5 text-[13.5px] leading-snug text-ink-800">
          A 121 that already happened. It counts right away for both members (confirmed by you), and both are notified.
        </p>
        <MemberPicker label="Member" value={v.a} onChange={(id) => setV({ ...v, a: id })} error={e.member_a} />
        <MemberPicker label="Met with" value={v.b} onChange={(id) => setV({ ...v, b: id })} error={e.member_b} />
        <Input label="When" type="datetime-local" max={localDateTimeValue(new Date())} value={v.at} onChange={(x) => setV({ ...v, at: x.target.value })} error={e.meeting_at} />
        <div>
          <span className="label">Where</span>
          <Segmented value={v.mode} onChange={(mode) => setV({ ...v, mode })} options={[{ value: 'in_person', label: 'In person' }, { value: 'online', label: 'Online' }]} />
        </div>
        <Input label="Business discussed" optional value={v.discussed} onChange={(x) => setV({ ...v, discussed: x.target.value })} />
        <Button type="submit" block size="lg" loading={m.isPending}>
          Record 121
        </Button>
      </form>
    </Sheet>
  )
}

/** Card on the admin Overview: the shortcut for entering business and 121s on behalf of members. */
export function AdminAddCard() {
  const [adding, setAdding] = useState<null | 'business' | '121'>(null)
  return (
    <div className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[15px] font-semibold">Enter records for members</p>
        <p className="text-[13px] text-ink-600">Member didn't log it? Add their business amount or a 121 here. It counts for both members.</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" icon={<IndianRupee className="h-4 w-4" />} onClick={() => setAdding('business')}>
          Add business
        </Button>
        <Button size="sm" variant="secondary" icon={<CalendarCheck className="h-4 w-4" />} onClick={() => setAdding('121')}>
          Add 121
        </Button>
      </div>
      <AddBusiness open={adding === 'business'} onClose={() => setAdding(null)} onDone={() => setAdding(null)} />
      <Add121 open={adding === '121'} onClose={() => setAdding(null)} onDone={() => setAdding(null)} />
    </div>
  )
}
