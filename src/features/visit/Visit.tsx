import '@fontsource-variable/anek-gujarati/wdth.css'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Download, ExternalLink, FileText, Loader2, Paperclip, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Logo } from '@/components/Brand'
import { api, ApiError } from '@/lib/api'
import { API_BASE, siteHref } from '@/lib/config'
import { fmtClock, parseDate } from '@/lib/format'
import { blobName, fitImage } from '@/lib/image'
import { FAMILY, GOLD, GOLD_INK, HEAD, LEDGER, SIGN } from '../landing/style'
import { fmtPhone, waLink, type PublicVisitForm, type VisitField, type VisitMeeting } from './types'

/*
 * "Attend as a visitor" — bbanetworking.com/visit. Same signboard look as the landing page.
 * Everything on it (questions, wording, fee, QR code) is edited in Admin → Visitor form.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MAX_FILE = 5 * 1024 * 1024

type Attachment = { blob: Blob; name: string; preview: string | null }

/** Posted without cookies or custom headers, so the main domain can send it straight to the API. */
async function submitVisit(fd: FormData) {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/public/visit`, { method: 'POST', body: fd })
  } catch {
    throw new ApiError('network', 'No connection. Check your internet and try again.', 0)
  }
  let json: { ok: boolean; data?: { code: string | null }; error?: { code: string; message: string; fields?: Record<string, string> } }
  try {
    json = await res.json()
  } catch {
    throw new ApiError('bad_response', res.status === 413 ? 'The attached file is too large. Please attach a smaller photo or PDF.' : 'Something went wrong. Please try again.', res.status)
  }
  if (!json.ok) {
    const e = json.error ?? { code: 'unknown', message: 'Something went wrong.' }
    throw new ApiError(e.code, e.message, res.status, e.fields)
  }
  return json.data ?? { code: null }
}

function meetingLine(m: VisitMeeting) {
  const d = parseDate(m.meeting_date)
  if (!d) return m.title
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${fmtClock(m.start_time).toLowerCase()}`
}

function Label({ field, htmlFor }: { field: VisitField; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[17px] font-semibold leading-snug">
      {field.label}
      {!field.required && <span className="ml-1.5 font-normal text-black/50">(optional)</span>}
    </label>
  )
}

const inputCls = (error?: string) =>
  `block w-full rounded-[6px] border-2 bg-white px-4 text-[17px] outline-none transition-colors placeholder:text-black/35 focus:border-black ${error ? 'border-[#B3261E]' : 'border-black/15 hover:border-black/30'}`

function FieldError({ error, help }: { error?: string; help?: string }) {
  if (error)
    return (
      <p className="mt-2 text-[15px] font-medium text-[#B3261E]" role="alert">
        {error}
      </p>
    )
  return help ? <p className="mt-2 text-[15px] leading-snug text-black/55">{help}</p> : null
}

function FileInput({ field, value, onChange, error, setError }: { field: VisitField; value?: Attachment | null; onChange: (a: Attachment | null) => void; error?: string; setError: (e: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (file: File) => {
    setBusy(true)
    try {
      if (file.type.startsWith('image/')) {
        const blob = await fitImage(file, 1800)
        onChange({ blob, name: blobName(blob), preview: URL.createObjectURL(blob) })
      } else if (file.type === 'application/pdf') {
        if (file.size > MAX_FILE) throw new Error('That PDF is larger than 5 MB.')
        onChange({ blob: file, name: file.name, preview: null })
      } else {
        throw new Error('Attach a photo, a screenshot or a PDF.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <Label field={field} />
      {value ? (
        <div className="flex items-center gap-3 rounded-[6px] border-2 border-black/15 bg-white p-2.5 pr-2">
          {value.preview ? <img src={value.preview} alt="" className="h-14 w-14 rounded-[4px] object-cover" /> : <FileText className="mx-3 h-7 w-7 text-black/50" />}
          <span className="min-w-0 flex-1 truncate text-[16px]">{value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/5" aria-label={`Remove ${field.label}`}>
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className={`flex h-14 w-full items-center justify-center gap-2 rounded-[6px] border-2 border-dashed text-[17px] font-semibold transition-colors hover:border-black ${error ? 'border-[#B3261E]' : 'border-black/25'}`}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          {busy ? 'Preparing…' : 'Choose a photo or PDF'}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) pick(f)
        }}
      />
      <FieldError error={error} help={field.help} />
    </div>
  )
}

function Question({ field, value, onChange, error }: { field: VisitField; value: string | boolean | undefined; onChange: (v: string | boolean) => void; error?: string }) {
  const id = `q-${field.id}`
  const common = { id, name: field.id, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-err` : undefined }
  if (field.type === 'checkbox')
    return (
      <div>
        <label className="flex cursor-pointer items-start gap-3.5 py-1">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 accent-black" {...common} />
          <span className="text-[17px] leading-snug">
            {field.label}
            {!field.required && <span className="ml-1.5 text-black/50">(optional)</span>}
          </span>
        </label>
        <FieldError error={error} help={field.help} />
      </div>
    )
  const str = typeof value === 'string' ? value : ''
  let control: ReactNode
  if (field.type === 'textarea') {
    control = <textarea rows={4} value={str} onChange={(e) => onChange(e.target.value)} maxLength={3000} className={`${inputCls(error)} py-3 leading-relaxed`} {...common} />
  } else if (field.type === 'select') {
    control = (
      <select value={str} onChange={(e) => onChange(e.target.value)} className={`${inputCls(error)} h-14 appearance-none`} {...common}>
        <option value="">Choose…</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  } else {
    const typeProps =
      field.type === 'phone'
        ? { type: 'tel', inputMode: 'tel' as const, autoComplete: field.id === 'mobile' ? 'tel' : 'off', placeholder: '98765 43210' }
        : field.type === 'email'
          ? { type: 'email', inputMode: 'email' as const, autoComplete: 'email', autoCapitalize: 'none' }
          : field.type === 'number'
            ? { type: 'text', inputMode: 'decimal' as const }
            : field.type === 'date'
              ? { type: 'date' }
              : { type: 'text', autoComplete: field.id === 'name' ? 'name' : field.id === 'city' ? 'address-level2' : field.id === 'business' ? 'organization' : 'off' }
    control = <input value={str} onChange={(e) => onChange(e.target.value)} maxLength={300} className={`${inputCls(error)} h-14`} {...typeProps} {...common} />
  }
  return (
    <div>
      <Label field={field} htmlFor={id} />
      {control}
      <span id={`${id}-err`}>
        <FieldError error={error} help={field.help} />
      </span>
    </div>
  )
}

function PaymentCard({ p }: { p: PublicVisitForm['payment'] }) {
  const [copied, setCopied] = useState(false)
  const amount = Number(p.amount) > 0 ? `₹${Number(p.amount).toLocaleString('en-IN')}` : ''
  const upi = p.upi_id ? `upi://pay?pa=${encodeURIComponent(p.upi_id)}&pn=${encodeURIComponent('BBA')}${amount ? `&am=${p.amount}` : ''}&cu=INR&tn=${encodeURIComponent('BBA visitor fee')}` : ''
  return (
    <div className="rounded-[10px] border-2 border-black bg-white p-5 md:p-6">
      <p className="text-[15px] font-semibold uppercase tracking-[0.12em]" style={{ color: GOLD_INK }}>
        {p.title || 'Visitor fee'}
      </p>
      {amount && (
        <p className="mt-1 text-[56px] leading-none" style={SIGN}>
          {amount}
        </p>
      )}
      {p.qr_url && (
        <div className="mt-4">
          <img src={p.qr_url} alt={`Payment QR code${p.upi_id ? ` for ${p.upi_id}` : ''}`} className="mx-auto aspect-square w-full max-w-[280px] rounded-[6px] border border-black/10 object-contain" />
          <a href={p.qr_url} target="_blank" rel="noopener noreferrer" download className="mt-2 flex items-center justify-center gap-1.5 text-[15px] font-semibold underline decoration-2 underline-offset-4">
            <Download className="h-4 w-4" /> Save the QR code
          </a>
        </div>
      )}
      {p.upi_id && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-[6px] px-3.5 py-2.5" style={{ background: LEDGER }}>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold uppercase tracking-[0.1em] text-black/55">UPI ID</span>
            <span className="block truncate text-[17px] font-semibold">{p.upi_id}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(p.upi_id).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1800)
              })
            }}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-[6px] bg-black px-3.5 text-[15px] font-semibold text-white"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      {p.note && <p className="mt-4 whitespace-pre-line text-[16px] leading-[1.55] text-black/75">{p.note}</p>}
      {(upi || p.link) && (
        <div className="mt-4 flex flex-col gap-2">
          {upi && (
            <a href={upi} className="flex h-12 items-center justify-center rounded-[6px] text-[16px] font-semibold text-black md:hidden" style={{ background: GOLD }}>
              Pay with a UPI app
            </a>
          )}
          {p.link && (
            <a href={p.link} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-[6px] border-2 border-black text-[16px] font-semibold hover:bg-black hover:text-white">
              Pay online <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-white text-black [&_:focus-visible]:outline-black" style={{ fontFamily: FAMILY }}>
      {children}
    </div>
  )
}

function Nav() {
  return (
    <nav className="flex items-center justify-between pb-10 pt-5 md:pb-14">
      <a href={siteHref('/')} className="flex items-center gap-3" aria-label="BBA home">
        <Logo size={52} />
        <span className="flex flex-col">
          <span className="text-[26px] leading-none" style={SIGN}>
            BBA
          </span>
          <span className="mt-0.5 text-[14px] font-medium text-black/75 sm:text-[15px]">Burhani Business Association</span>
        </span>
      </a>
    </nav>
  )
}

export default function Visit() {
  const q = useQuery({ queryKey: ['public-visit-form'], queryFn: () => api.get<PublicVisitForm>('public/visit-form'), staleTime: 60_000 })
  const f = q.data
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [files, setFiles] = useState<Record<string, Attachment | null>>({})
  const [meetingId, setMeetingId] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ code: string | null } | null>(null)
  const hp = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (f?.title) document.title = `${f.title} · BBA — Burhani Business Association`
  }, [f?.title])
  useEffect(() => {
    if (f?.meetings.length && meetingId === null) setMeetingId(f.meetings[0].id)
  }, [f, meetingId])

  const setValue = (id: string, v: string | boolean) => {
    setValues((s) => ({ ...s, [id]: v }))
    if (errors[id]) setErrors(({ [id]: _, ...rest }) => rest)
  }

  const focusFirstError = (errs: Record<string, string>) => {
    const first = [...(f?.fields ?? []).map((x) => x.id), 'meeting_id'].find((k) => errs[k])
    if (!first) return
    const el = document.getElementById(first === 'meeting_id' ? 'meetings' : `q-${first}`) ?? document.getElementById(`wrap-${first}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.focus({ preventScroll: true })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f || busy) return
    setFormError('')
    const errs: Record<string, string> = {}
    f.fields.forEach((x) => {
      const v = values[x.id]
      if (x.type === 'file') {
        if (x.required && !files[x.id]) errs[x.id] = `Attach ${x.label.toLowerCase()}.`
      } else if (x.type === 'checkbox') {
        if (x.required && !v) errs[x.id] = 'Please tick this box to continue.'
      } else {
        const s = typeof v === 'string' ? v.trim() : ''
        if (!s) {
          if (x.required) errs[x.id] = `${x.label} is required.`
        } else if (x.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) errs[x.id] = 'Enter a valid email address.'
        else if (x.type === 'phone' && !/^\+?[\d\s()-]{8,20}$/.test(s)) errs[x.id] = 'Enter a valid mobile number.'
      }
    })
    if (f.meetings.length && !meetingId) errs.meeting_id = 'Choose the meeting you will attend.'
    setErrors(errs)
    if (Object.keys(errs).length) return focusFirstError(errs)

    const fd = new FormData()
    const data: Record<string, unknown> = { ...values, meeting_id: meetingId, website: hp.current?.value ?? '' }
    fd.append('data', JSON.stringify(data))
    Object.entries(files).forEach(([id, a]) => a && fd.append(`file_${id}`, a.blob, a.name))
    setBusy(true)
    try {
      const res = await submitVisit(fd)
      setDone(res)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        // Upload errors come back keyed file_<id>.
        const mapped = Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.replace(/^file_/, ''), v]))
        setErrors(mapped)
        focusFirstError(mapped)
      }
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (q.isLoading)
    return (
      <Shell>
        <header style={{ background: GOLD }} className="pt-safe">
          <div className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-8">
            <Nav />
            <div className="h-24 w-3/4 animate-pulse rounded-[6px] bg-black/10" />
          </div>
        </header>
      </Shell>
    )

  if (q.isError || !f)
    return (
      <Shell>
        <div className="mx-auto max-w-[640px] px-5 py-24 text-center">
          <p className="text-[32px]" style={HEAD}>
            Can't load the form right now
          </p>
          <p className="mt-2 text-[18px] text-black/65">Check your connection and try again.</p>
          <button type="button" onClick={() => q.refetch()} className="mt-6 h-14 rounded-[6px] bg-black px-7 text-[17px] font-semibold text-white">
            Try again
          </button>
        </div>
      </Shell>
    )

  const meeting = f.meetings.find((m) => m.id === meetingId)
  const showPayment = !!(f.payment.qr_url || Number(f.payment.amount) > 0 || f.payment.upi_id || f.payment.link)

  if (done) {
    const lines = [
      `Hello BBA, I have registered to attend ${meeting ? `${meeting.title} (${meetingLine(meeting)})` : 'a BBA meeting'} as a visitor.`,
      done.code ? `Reference: ${done.code}` : '',
      ...f.fields
        .filter((x) => x.type !== 'file' && x.type !== 'checkbox' && typeof values[x.id] === 'string' && (values[x.id] as string).trim())
        .map((x) => `${x.label}: ${(values[x.id] as string).trim()}`),
      ...f.fields.filter((x) => x.type === 'file' && files[x.id]).map((x) => `${x.label}: I'll send it here.`),
    ].filter(Boolean)
    return (
      <Shell>
        <header style={{ background: GOLD }} className="min-h-[100dvh] pt-safe">
          <div className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-8 md:pb-24">
            <Nav />
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black text-[#E0A82E]">
                <Check className="h-9 w-9" strokeWidth={3} />
              </span>
              <h1 className="mt-6 max-w-[16ch] text-[56px] uppercase leading-[0.86] md:text-[96px]" style={SIGN}>
                {f.success_title}
              </h1>
              {f.success_message && <p className="mt-5 max-w-[40ch] whitespace-pre-line text-[19px] leading-[1.5] text-black/80">{f.success_message}</p>}
              {done.code && (
                <p className="mt-5 text-[17px]">
                  Your reference: <span className="rounded-[4px] bg-black px-2 py-0.5 font-semibold tracking-wide text-white">{done.code}</span>
                </p>
              )}
              {meeting && (
                <p className="mt-3 text-[17px] text-black/80">
                  {meeting.title}: {meetingLine(meeting)}
                  {meeting.venue ? `, ${meeting.venue}` : ''}
                </p>
              )}
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {f.whatsapp_number && (
                  <a href={waLink(f.whatsapp_number, lines.join('\n'))} target="_blank" rel="noopener noreferrer" className="inline-flex h-14 items-center justify-center gap-2.5 rounded-[6px] bg-black px-7 text-[17px] font-semibold text-white hover:bg-[#2b2b2b]">
                    <WhatsAppGlyph /> Send my details on WhatsApp
                  </a>
                )}
                <a href={siteHref('/')} className="inline-flex h-14 items-center justify-center rounded-[6px] border-2 border-black px-7 text-[17px] font-semibold hover:bg-black hover:text-[#E0A82E]">
                  Back to BBA
                </a>
              </div>
            </motion.div>
          </div>
        </header>
      </Shell>
    )
  }

  return (
    <Shell>
      <header style={{ background: GOLD }} className="pt-safe">
        <div className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-8 md:pb-16">
          <Nav />
          <motion.h1
            className="max-w-[14ch] text-[60px] uppercase leading-[0.84] md:text-[112px]"
            style={SIGN}
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {f.title}
          </motion.h1>
          {f.enabled && f.intro && (
            <motion.p className="mt-6 max-w-[46ch] whitespace-pre-line text-[19px] leading-[1.5] text-black/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.25 }}>
              {f.intro}
            </motion.p>
          )}
        </div>
      </header>

      {!f.enabled ? (
        <main className="mx-auto max-w-[1100px] px-5 py-16 sm:px-8 md:py-24">
          <p className="max-w-[30ch] whitespace-pre-line text-[28px] leading-[1.2] md:text-[36px]" style={HEAD}>
            {f.closed_message || 'Visitor registrations are closed right now.'}
          </p>
          {(f.contact_phone || f.contact_email) && (
            <p className="mt-6 text-[18px] text-black/70">
              {f.contact_phone && (
                <a href={`tel:${f.contact_phone}`} className="mr-6 font-semibold underline decoration-2 underline-offset-4">
                  {f.contact_phone}
                </a>
              )}
              {f.contact_email && (
                <a href={`mailto:${f.contact_email}`} className="font-semibold underline decoration-2 underline-offset-4">
                  {f.contact_email}
                </a>
              )}
            </p>
          )}
        </main>
      ) : (
        <main className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 md:py-16">
          <form noValidate onSubmit={submit} className="grid gap-10 md:grid-cols-[minmax(0,1fr)_340px] md:gap-14">
            <div className="space-y-8">
              {f.meetings.length > 0 && (
                <fieldset id="meetings" tabIndex={-1} className="outline-none">
                  <legend className="mb-3 text-[24px] leading-tight" style={HEAD}>
                    {f.meetings.length === 1 ? 'The meeting' : 'Which meeting will you attend?'}
                  </legend>
                  <div className="space-y-2.5">
                    {f.meetings.map((m) => {
                      const d = parseDate(m.meeting_date)
                      const on = m.id === meetingId
                      return (
                        <label key={m.id} className={`flex cursor-pointer items-stretch overflow-hidden rounded-[6px] border-2 transition-colors ${on ? 'border-black' : 'border-black/15 hover:border-black/35'}`}>
                          <input type="radio" name="meeting" className="sr-only" checked={on} onChange={() => setMeetingId(m.id)} />
                          <span className={`flex w-[76px] shrink-0 flex-col items-center justify-center py-2 ${on ? 'bg-black text-[#E0A82E]' : ''}`} style={on ? undefined : { background: LEDGER }}>
                            <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">{d ? DAYS[d.getDay()].slice(0, 3) : ''}</span>
                            <span className="text-[38px] leading-[0.95]" style={SIGN}>
                              {d?.getDate()}
                            </span>
                            <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">{d ? MONTHS[d.getMonth()].slice(0, 3) : ''}</span>
                          </span>
                          <span className="min-w-0 flex-1 px-4 py-3">
                            <span className="block text-[18px] font-semibold leading-tight">{m.title}</span>
                            <span className="mt-1 block text-[16px] leading-snug text-black/65">
                              {fmtClock(m.start_time).toLowerCase()}
                              {m.venue ? ` · ${m.venue}` : ''}
                            </span>
                          </span>
                          <span className="flex items-center pr-4">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${on ? 'border-black bg-black text-white' : 'border-black/30'}`}>{on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  <FieldError error={errors.meeting_id} />
                </fieldset>
              )}

              <div className="space-y-7">
                <h2 className="text-[24px] leading-tight" style={HEAD}>
                  Your details
                </h2>
                {f.fields.map((field) =>
                  field.type === 'file' ? (
                    <div key={field.id} id={`wrap-${field.id}`}>
                      <FileInput
                        field={field}
                        value={files[field.id]}
                        error={errors[field.id]}
                        setError={(msg) => setErrors((s) => ({ ...s, [field.id]: msg }))}
                        onChange={(a) => {
                          setFiles((s) => ({ ...s, [field.id]: a }))
                          if (errors[field.id]) setErrors(({ [field.id]: _, ...rest }) => rest)
                        }}
                      />
                    </div>
                  ) : (
                    <Question key={field.id} field={field} value={values[field.id]} onChange={(v) => setValue(field.id, v)} error={errors[field.id]} />
                  ),
                )}
              </div>

              {/* Bots fill in every field; people never see this one. */}
              <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
                <label>
                  Website
                  <input ref={hp} type="text" name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <div>
                <AnimatePresence>
                  {formError && (
                    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 rounded-[6px] bg-[#B3261E]/10 px-4 py-3 text-[16px] font-medium text-[#B3261E]" role="alert">
                      {formError}
                    </motion.p>
                  )}
                </AnimatePresence>
                <motion.button
                  type="submit"
                  disabled={busy}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-[6px] bg-black px-8 text-[18px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] disabled:opacity-60 sm:w-auto"
                >
                  {busy && <Loader2 className="h-5 w-5 animate-spin" />}
                  {busy ? 'Sending…' : f.submit_label || 'Book my visit'}
                </motion.button>
              </div>
            </div>

            {showPayment && (
              <aside className="order-first md:order-none">
                <div className="md:sticky md:top-6">
                  <PaymentCard p={f.payment} />
                </div>
              </aside>
            )}
          </form>
        </main>
      )}

      <footer className="bg-black pb-safe text-white">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-2 px-5 py-10 text-[16px] text-white/70 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-white">Burhani Business Association</p>
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            {f.contact_phone && (
              <a href={`tel:${f.contact_phone}`} className="hover:text-white">
                {fmtPhone(f.contact_phone)}
              </a>
            )}
            {f.contact_email && (
              <a href={`mailto:${f.contact_email}`} className="hover:text-white">
                {f.contact_email}
              </a>
            )}
          </p>
        </div>
      </footer>
    </Shell>
  )
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  )
}
