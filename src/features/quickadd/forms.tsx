import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { MemberPicker } from '@/components/MemberPicker'
import { Button, Disclosure, Input, MoneyInput, Segmented, Select, Textarea } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { firstName, fmtDate, inr, localDateTimeValue, todayISO } from '@/lib/format'
import { PhotoPicker, uploadOnePhotos } from '@/features/ones/OnePhotos'
import { useRefreshAll } from '@/lib/session'
import type { Meeting } from '@/lib/types'

/** Shared submit plumbing: field errors from the server, toasts, refresh. */
export function useFormSubmit<T>(path: string, onSuccess: (data: T) => void) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const refresh = useRefreshAll()
  const m = useMutation({
    mutationFn: (body: unknown) => api.post<T>(path, body),
    onMutate: () => setErrors({}),
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    },
    onSuccess: (data) => {
      refresh()
      onSuccess(data)
    },
  })
  return { errors, setErrors, submit: m.mutate, pending: m.isPending }
}

function requireFields(values: Record<string, unknown>, labels: Record<string, string>) {
  const errs: Record<string, string> = {}
  Object.entries(labels).forEach(([k, label]) => {
    const v = values[k]
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) errs[k] = `${label} is required.`
  })
  return errs
}

/* ------------------------------------------------------------------ */

export function GiveReferralForm({ prefillTo, onDone }: { prefillTo?: number; onDone: () => void }) {
  const [to, setTo] = useState<number | null>(prefillTo ?? null)
  const [client, setClient] = useState('')
  const [need, setNeed] = useState('')
  const [value, setValue] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState(todayISO())
  const [follow, setFollow] = useState('')
  const [notes, setNotes] = useState('')
  const f = useFormSubmit<{ code: string; receiver_name: string }>('referrals/create', (d) => {
    toast.success(`Referral sent to ${firstName(d.receiver_name)}`)
    onDone()
  })
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const errs = requireFields({ receiver_id: to, client_name: client, requirement: need }, { receiver_id: 'To member', client_name: 'Client / business name', requirement: 'What they need' })
    if (Object.keys(errs).length) return f.setErrors(errs)
    f.submit({ receiver_id: to, client_name: client, requirement: need, estimated_value: value, client_phone: phone, client_email: email, description: desc, referral_date: date, followup_date: follow, notes })
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-1" noValidate>
      <MemberPicker label="To member" value={to} onChange={(id) => setTo(id)} error={f.errors.receiver_id} />
      <Input label="Client / business name" value={client} onChange={(e) => setClient(e.target.value)} error={f.errors.client_name} placeholder="e.g. Sunrise Apartments" autoComplete="off" />
      <Input label="What they need" value={need} onChange={(e) => setNeed(e.target.value)} error={f.errors.requirement} placeholder="e.g. Office interior fit-out" autoComplete="off" />
      <MoneyInput label="Estimated value" optional value={value} onChange={setValue} error={f.errors.estimated_value} placeholder="0" />
      <Disclosure title="More details">
        <Input label="Client phone" optional type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={f.errors.client_phone} />
        <Input label="Client email" optional type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={f.errors.client_email} />
        <Textarea label="Description" optional value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Referral date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} error={f.errors.referral_date} />
          <Input label="Follow up on" optional type="date" value={follow} onChange={(e) => setFollow(e.target.value)} />
        </div>
        <Textarea label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Disclosure>
      <Button type="submit" block size="lg" loading={f.pending}>
        Send referral
      </Button>
    </form>
  )
}

/* ------------------------------------------------------------------ */

export function ThankYouForm({ prefillFrom, onDone }: { prefillFrom?: number; onDone: () => void }) {
  const [from, setFrom] = useState<number | null>(prefillFrom ?? null)
  const [value, setValue] = useState('')
  const [what, setWhat] = useState('')
  const [date, setDate] = useState(todayISO())
  const [msg, setMsg] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const f = useFormSubmit<{ code: string; giver_name: string }>('referrals/direct', async (d) => {
    if (proof) {
      const fd = new FormData()
      fd.append('code', d.code)
      fd.append('file', proof)
      try {
        await api.post('referrals/proof', fd)
      } catch (e) {
        toast.error(`Saved, but the proof didn't upload: ${errorMessage(e)}`)
      }
    }
    toast.success(`Thank you sent to ${firstName(d.giver_name)} · ${inr(Number(value))}`)
    onDone()
  })
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const errs = requireFields({ giver_id: from, value, requirement: what }, { giver_id: 'From member', value: 'Value', requirement: 'What it was for' })
    if (Object.keys(errs).length) return f.setErrors(errs)
    f.submit({ giver_id: from, value, requirement: what, won_date: date, thank_you_note: msg })
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-1" noValidate>
      <p className="rounded-field bg-gold-100/70 px-3.5 py-2.5 text-[13.5px] leading-snug text-ink-800">Received business from a member without a logged referral? Thank them here — it counts once, for both of you.</p>
      <MemberPicker label="Who gave you the business?" value={from} onChange={(id) => setFrom(id)} error={f.errors.giver_id} />
      <MoneyInput label="Business value" value={value} onChange={setValue} error={f.errors.value} placeholder="0" />
      <Input label="What was it for?" value={what} onChange={(e) => setWhat(e.target.value)} error={f.errors.requirement} placeholder="e.g. Catering for a wedding" autoComplete="off" />
      <Disclosure title="More details">
        <Input label="Date" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} error={f.errors.won_date} />
        <Textarea label="Message to them" optional value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder="Thank you for the referral!" />
        <div>
          <label className="label">
            Proof <span className="font-normal text-ink-400">(optional · invoice photo or PDF, private)</span>
          </label>
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="block w-full text-[14px] file:mr-3 file:h-10 file:rounded-[10px] file:border-0 file:bg-ink-950 file:px-4 file:text-[13px] file:font-semibold file:text-white" />
        </div>
      </Disclosure>
      <Button type="submit" block size="lg" loading={f.pending}>
        Send thank you
      </Button>
    </form>
  )
}

/* ------------------------------------------------------------------ */

function OneDetailsFields({ v, set }: { v: Record<string, string>; set: (k: string, val: string) => void }) {
  return (
    <>
      <Textarea label="Business discussed" optional rows={2} value={v.business_discussed} onChange={(e) => set('business_discussed', e.target.value)} />
      <Textarea label="Products / services introduced" optional rows={2} value={v.products_introduced} onChange={(e) => set('products_introduced', e.target.value)} />
      <Textarea label="Referrals exchanged" optional rows={2} value={v.referrals_exchanged} onChange={(e) => set('referrals_exchanged', e.target.value)} />
      <Textarea label="Follow-up actions" optional rows={2} value={v.follow_up_actions} onChange={(e) => set('follow_up_actions', e.target.value)} />
      <Textarea label="Notes" optional rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
    </>
  )
}

export const emptyDetails = { business_discussed: '', products_introduced: '', referrals_exchanged: '', follow_up_actions: '', notes: '' }

export function Log121Form({ prefillWith, onDone }: { prefillWith?: number; onDone: () => void }) {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  const [partner, setPartner] = useState<number | null>(prefillWith ?? null)
  const [at, setAt] = useState(localDateTimeValue(now))
  const [mode, setMode] = useState<'in_person' | 'online'>('in_person')
  const [details, setDetails] = useState(emptyDetails)
  const [photos, setPhotos] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const refresh = useRefreshAll()
  const f = useFormSubmit<{ id: number; partner_name: string }>('121s/log', async (d) => {
    if (photos.length) {
      setUploading(true)
      await uploadOnePhotos(d.id, photos)
      setUploading(false)
      refresh()
    }
    toast.success(`121 logged · waiting for ${firstName(d.partner_name)} to confirm`)
    onDone()
  })
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const errs = requireFields({ partner_id: partner, meeting_at: at }, { partner_id: 'Member met', meeting_at: 'Date & time' })
    if (Object.keys(errs).length) return f.setErrors(errs)
    f.submit({ partner_id: partner, meeting_at: at, mode, ...details })
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-1" noValidate>
      <MemberPicker label="Who did you meet?" value={partner} onChange={(id) => setPartner(id)} error={f.errors.partner_id} />
      <Input label="When" type="datetime-local" max={localDateTimeValue(new Date())} value={at} onChange={(e) => setAt(e.target.value)} error={f.errors.meeting_at} />
      <div>
        <span className="label">Where</span>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'in_person', label: 'In person' }, { value: 'online', label: 'Online' }]} />
      </div>
      <PhotoPicker files={photos} onChange={setPhotos} />
      <Disclosure title="More details">
        <OneDetailsFields v={details} set={(k, val) => setDetails({ ...details, [k]: val })} />
      </Disclosure>
      <p className="text-[12.5px] text-ink-600">It counts once the other member confirms the meeting.</p>
      <Button type="submit" block size="lg" loading={f.pending || uploading}>
        Log 121
      </Button>
    </form>
  )
}

export function Request121Form({ prefillWith, onDone }: { prefillWith?: number; onDone: () => void }) {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  d.setHours(11, 0, 0, 0)
  const [partner, setPartner] = useState<number | null>(prefillWith ?? null)
  const [at, setAt] = useState(localDateTimeValue(d))
  const [mode, setMode] = useState<'in_person' | 'online'>('in_person')
  const [msg, setMsg] = useState('')
  const f = useFormSubmit<{ partner_name: string }>('121s/request', (r) => {
    toast.success(`121 request sent to ${firstName(r.partner_name)}`)
    onDone()
  })
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const errs = requireFields({ partner_id: partner, meeting_at: at }, { partner_id: 'Member', meeting_at: 'Date & time' })
    if (Object.keys(errs).length) return f.setErrors(errs)
    f.submit({ partner_id: partner, meeting_at: at, mode, request_message: msg })
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-1" noValidate>
      <MemberPicker label="Meet with" value={partner} onChange={(id) => setPartner(id)} error={f.errors.partner_id} />
      <Input label="Proposed date & time" type="datetime-local" min={localDateTimeValue(new Date())} value={at} onChange={(e) => setAt(e.target.value)} error={f.errors.meeting_at} />
      <div>
        <span className="label">Where</span>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'in_person', label: 'In person' }, { value: 'online', label: 'Online' }]} />
      </div>
      <Textarea label="Message" optional rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Would love to learn more about your business." />
      <Button type="submit" block size="lg" loading={f.pending}>
        Send request
      </Button>
    </form>
  )
}

/* ------------------------------------------------------------------ */

export function InviteVisitorForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [business, setBusiness] = useState('')
  const [meeting, setMeeting] = useState('')
  const [notes, setNotes] = useState('')
  const meetings = useQuery({ queryKey: ['visitors'], queryFn: () => api.get<{ meetings: Meeting[] }>('visitors') })
  const f = useFormSubmit('visitors/create', () => {
    toast.success(`${firstName(name)} added as your visitor`)
    onDone()
  })
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const errs = requireFields({ name, mobile }, { name: 'Visitor name', mobile: 'Mobile number' })
    if (Object.keys(errs).length) return f.setErrors(errs)
    f.submit({ name, mobile, business, meeting_id: meeting || null, notes })
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-1" noValidate>
      <Input label="Visitor name" value={name} onChange={(e) => setName(e.target.value)} error={f.errors.name} autoComplete="off" />
      <Input label="Mobile number" type="tel" inputMode="numeric" prefix="+91" maxLength={14} value={mobile} onChange={(e) => setMobile(e.target.value)} error={f.errors.mobile} />
      <Input label="Business / category" optional value={business} onChange={(e) => setBusiness(e.target.value)} />
      {!!meetings.data?.meetings.length && (
        <Select label="Invited to" optional value={meeting} onChange={(e) => setMeeting(e.target.value)}>
          <option value="">Not decided yet</option>
          {meetings.data.meetings.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title} · {fmtDate(m.meeting_date)}
            </option>
          ))}
        </Select>
      )}
      <Textarea label="Notes" optional rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button type="submit" block size="lg" loading={f.pending}>
        Add visitor
      </Button>
    </form>
  )
}
