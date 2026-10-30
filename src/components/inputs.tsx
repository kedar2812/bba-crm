import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Eye, EyeOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { squareImage } from '@/lib/image'
import { Avatar, Field, Input, cx } from './ui'

/** Type a tag and press Enter (or comma) to add it. */
export function TagInput({ label, value, onChange, error, placeholder = 'Type and press Enter', optional, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; error?: string; placeholder?: string; optional?: boolean; hint?: string }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    parts.forEach((p) => {
      if (p.length <= 60 && !next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p)
    })
    onChange(next.slice(0, 20))
    setDraft('')
  }
  return (
    <Field label={label} error={error} optional={optional} hint={hint ?? 'Press Enter or comma after each item'}>
      <div className={cx('field flex h-auto min-h-12 flex-wrap items-center gap-1.5 py-2', error && 'field-error')}>
        <AnimatePresence initial={false}>
          {value.map((t) => (
            <motion.span key={t} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="inline-flex items-center gap-1 rounded-full bg-gold-100 py-1 pl-3 pr-1 text-[13px] font-medium text-ink-800">
              {t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-gold-300/50" aria-label={`Remove ${t}`}>
                <X className="h-3 w-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          className="min-w-[8rem] flex-1 bg-transparent py-1 outline-none placeholder:text-ink-400"
          value={draft}
          placeholder={value.length ? '' : placeholder}
          enterKeyHint="enter"
          onChange={(e) => {
            const v = e.target.value
            if (v.includes(',')) add(v)
            else setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => draft && add(draft)}
        />
      </div>
    </Field>
  )
}

/** Six-box OTP input backed by one real input (paste + SMS/email autofill work). */
export function OtpInput({ value, onChange, onComplete, error, disabled }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; error?: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div>
      <div className="relative" onClick={() => ref.current?.focus()}>
        <input
          ref={ref}
          value={value}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="6-digit code"
          maxLength={6}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6)
            onChange(v)
            if (v.length === 6) onComplete?.(v)
          }}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => {
            const active = focused && (i === value.length || (i === 5 && value.length === 6))
            return (
              <div
                key={i}
                className={cx(
                  'flex h-14 items-center justify-center rounded-field border bg-white font-display text-[24px] font-bold tabular transition-all duration-150',
                  error ? 'border-danger' : active ? 'border-gold-500 ring-4 ring-gold-500/15' : value[i] ? 'border-ink-300' : 'border-line',
                )}
              >
                {value[i] ?? ''}
              </div>
            )
          })}
        </div>
      </div>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </div>
  )
}

export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false)
  return (
    <Input
      {...props}
      type={show ? 'text' : 'password'}
      suffix={
        <button type="button" onClick={() => setShow(!show)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-400 hover:text-ink-800" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  )
}

export function passwordStrength(p: string) {
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return Math.min(4, s)
}

export function StrengthMeter({ password }: { password: string }) {
  const s = passwordStrength(password)
  const labels = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong']
  const colors = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-success', 'bg-success']
  if (!password) return null
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-300', i < s ? colors[s] : 'bg-cream-200')} />
        ))}
      </div>
      <span className="w-16 text-right text-[12px] text-ink-600">{labels[s]}</span>
    </div>
  )
}

/** Photo picker: camera or gallery on mobile, square-cropped WebP preview. */
export function PhotoPicker({ value, onChange, name, error, size = 96, currentUrl }: { value: Blob | null; onChange: (b: Blob | null) => void; name?: string; error?: string; size?: number; currentUrl?: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [localErr, setLocalErr] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!value) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(value)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [value])
  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => ref.current?.click()} className="relative shrink-0 rounded-full" aria-label="Choose profile photo">
        {url || currentUrl ? (
          <img src={url ?? currentUrl ?? ''} alt="" style={{ width: size, height: size }} className="rounded-full object-cover ring-4 ring-gold-500/20" />
        ) : name ? (
          <Avatar name={name} size={size} />
        ) : (
          <span style={{ width: size, height: size }} className={cx('flex items-center justify-center rounded-full border-2 border-dashed bg-white', error ? 'border-danger' : 'border-line')}>
            <Camera className="h-7 w-7 text-ink-400" />
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink-950 text-white ring-2 ring-cream-50">
          <Camera className="h-4 w-4" />
        </span>
      </button>
      <div>
        <button type="button" onClick={() => ref.current?.click()} className="text-[15px] font-semibold text-ink-950 underline decoration-gold-500 decoration-2 underline-offset-4">
          {busy ? 'Processing…' : url || currentUrl ? 'Change photo' : 'Add a photo'}
        </button>
        <p className="mt-1 text-[12.5px] text-ink-600">A clear photo of your face helps members recognise you.</p>
        {(error || localErr) && <p className="mt-1 text-[13px] text-danger">{localErr || error}</p>}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setBusy(true)
          setLocalErr('')
          try {
            onChange(await squareImage(f))
          } catch (err) {
            setLocalErr(err instanceof Error ? err.message : 'That image could not be used.')
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}
