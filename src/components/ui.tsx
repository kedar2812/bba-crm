import { animate, motion, useInView, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { ChevronDown, Loader2 } from 'lucide-react'
import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { initials } from '@/lib/format'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'light'
const variants: Record<Variant, string> = {
  primary: 'bg-gold-500 text-ink-950 hover:bg-gold-600 shadow-[0_1px_0_rgba(255,255,255,.35)_inset]',
  secondary: 'bg-ink-950 text-white hover:bg-ink-800',
  ghost: 'bg-transparent text-ink-800 hover:bg-ink-950/5',
  danger: 'bg-danger text-white hover:brightness-95',
  outline: 'bg-white text-ink-950 border border-line hover:border-ink-300',
  light: 'bg-transparent text-white border border-white/30 hover:bg-white/10',
}

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  block?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const sizes = { sm: 'h-9 px-3.5 text-[13px] rounded-[10px]', md: 'h-12 px-5 text-[15px] rounded-field', lg: 'h-14 px-6 text-[16px] rounded-[14px]' }
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
      disabled={disabled || loading}
      className={cx(
        'relative inline-flex items-center justify-center gap-2 font-semibold select-none transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizes[size],
        variants[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </motion.button>
  )
})

export function IconButton({ label, children, className, badge, ...rest }: HTMLMotionProps<'button'> & { label: string; badge?: number; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      className={cx('relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors', className)}
      {...rest}
    >
      {children}
      {!!badge && badge > 0 && (
        <span className="absolute right-1 top-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold-500 text-ink-950 text-[10px] font-bold leading-[18px] text-center tabular">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </motion.button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-ink-400', className)} />
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

export function Field({ label, error, hint, children, id, optional }: { label?: string; error?: string; hint?: ReactNode; children: ReactNode; id?: string; optional?: boolean }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-400">(optional)</span>}
        </label>
      )}
      {children}
      {error ? (
        <motion.p initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 text-[13px] text-danger" role="alert">
          {error}
        </motion.p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: ReactNode; optional?: boolean; prefix?: ReactNode; suffix?: ReactNode }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, optional, className, id, prefix, suffix, ...rest }, ref) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <Field label={label} error={error} hint={hint} id={fid} optional={optional}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-600 text-[15px]">{prefix}</span>}
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error}
          className={cx('field', error && 'field-error', !!prefix && 'pl-11', !!suffix && 'pr-12', className)}
          {...rest}
        />
        {suffix && <span className="absolute right-1 top-1/2 -translate-y-1/2">{suffix}</span>}
      </div>
    </Field>
  )
})

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: ReactNode; optional?: boolean; counter?: number }

export function Textarea({ label, error, hint, optional, className, id, counter, value, ...rest }: TextareaProps) {
  const auto = useId()
  const fid = id ?? auto
  const len = typeof value === 'string' ? value.length : 0
  return (
    <Field label={label} error={error} hint={counter ? `${len}/${counter}` : hint} id={fid} optional={optional}>
      <textarea
        id={fid}
        value={value}
        maxLength={counter}
        aria-invalid={!!error}
        className={cx('field h-auto min-h-[96px] py-3 leading-relaxed resize-y', error && 'field-error', className)}
        {...rest}
      />
    </Field>
  )
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; optional?: boolean; hint?: ReactNode }

export function Select({ label, error, optional, className, id, children, hint, ...rest }: SelectProps) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <Field label={label} error={error} id={fid} optional={optional} hint={hint}>
      <div className="relative">
        <select id={fid} aria-invalid={!!error} className={cx('field appearance-none pr-10', error && 'field-error', className)} {...rest}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      </div>
    </Field>
  )
}

/** ₹ input with Indian digit grouping as you type. Value is the raw digits string. */
export function MoneyInput({ value, onChange, ...rest }: Omit<InputProps, 'value' | 'onChange'> & { value: string; onChange: (raw: string) => void }) {
  const display = value ? new Intl.NumberFormat('en-IN').format(Number(value)) : ''
  return (
    <Input
      {...rest}
      prefix="₹"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12))}
    />
  )
}

/** Collapsible "More details" section. */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-field border border-line bg-cream-50">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 h-12 text-[14px] font-semibold text-ink-800" aria-expanded={open}>
        {title}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-ink-400" />
        </motion.span>
      </button>
      <motion.div initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }} className="overflow-hidden">
        <div className="space-y-4 px-4 pb-4 pt-1">{children}</div>
      </motion.div>
    </div>
  )
}

export function Checkbox({ checked, onChange, children, error }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: string }) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 py-1">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#E0A82E]" />
        <span className="text-[14px] leading-snug text-ink-800">{children}</span>
      </label>
      {error && <p className="mt-1 text-[13px] text-danger">{error}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

export function Avatar({ src, name, size = 40, className, ring }: { src?: string | null; name?: string | null; size?: number; className?: string; ring?: boolean }) {
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) }
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        style={style}
        className={cx('shrink-0 rounded-full object-cover bg-cream-200', ring && 'ring-2 ring-white', className)}
      />
    )
  }
  return (
    <span style={style} className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-gold-300 font-display font-bold text-ink-950', ring && 'ring-2 ring-white', className)}>
      {initials(name)}
    </span>
  )
}

const pillStyles: Record<string, string> = {
  new: 'bg-info/10 text-info',
  contacted: 'bg-ink-950/[.07] text-ink-600',
  in_progress: 'bg-warning/15 text-warning',
  won: 'bg-success/15 text-success',
  lost: 'bg-danger/10 text-danger',
  pending: 'bg-transparent text-gold-700 ring-1 ring-inset ring-gold-500',
  disputed: 'bg-transparent text-danger ring-1 ring-inset ring-danger/60',
  void: 'bg-ink-950/[.06] text-ink-400 line-through',
  requested: 'bg-info/10 text-info',
  scheduled: 'bg-info/10 text-info',
  awaiting_confirmation: 'bg-transparent text-gold-700 ring-1 ring-inset ring-gold-500',
  completed: 'bg-success/15 text-success',
  declined: 'bg-danger/10 text-danger',
  cancelled: 'bg-ink-950/[.06] text-ink-400',
  invited: 'bg-info/10 text-info',
  attended: 'bg-warning/15 text-warning',
  joined: 'bg-success/15 text-success',
  not_interested: 'bg-ink-950/[.06] text-ink-400',
  present: 'bg-success/15 text-success',
  absent: 'bg-danger/10 text-danger',
  substitute: 'bg-gold-100 text-gold-700',
  approved: 'bg-success/15 text-success',
  pending_review: 'bg-transparent text-gold-700 ring-1 ring-inset ring-gold-500',
  rejected: 'bg-danger/10 text-danger',
  deactivated: 'bg-ink-950/[.06] text-ink-400',
  admin: 'bg-ink-950 text-gold-300',
}

const pillLabels: Record<string, string> = {
  new: 'New', contacted: 'Contacted', in_progress: 'In Progress', won: 'Won', lost: 'Lost', pending: 'Pending', disputed: 'Disputed', void: 'Voided',
  requested: 'Requested', scheduled: 'Scheduled', awaiting_confirmation: 'Unconfirmed', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled',
  invited: 'Invited', attended: 'Attended', joined: 'Joined', not_interested: 'Not interested', present: 'Present', absent: 'Absent', substitute: 'Substitute',
  approved: 'Active', pending_review: 'Pending review', rejected: 'Rejected', deactivated: 'Inactive', admin: 'Admin',
}

export function StatusPill({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className={cx('inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11.5px] font-semibold whitespace-nowrap', pillStyles[status] ?? 'bg-cream-200 text-ink-600', className)}
    >
      {label ?? pillLabels[status] ?? status}
    </motion.span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, action, sub }: { icon: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cream-100 text-gold-700">{icon}</div>
      <p className="font-display text-[17px] font-bold">{title}</p>
      {sub && <p className="mt-1 max-w-xs text-[14px] text-ink-600">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <p className="font-semibold text-ink-800">Couldn't load this</p>
      <p className="mt-1 text-[14px] text-ink-600">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Segmented control with a sliding indicator. */
export function Segmented<T extends string>({ value, onChange, options, className, dark }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; dark?: boolean }) {
  const id = useId()
  return (
    <div role="tablist" className={cx('flex rounded-[12px] p-1', dark ? 'bg-white/10' : 'bg-ink-950/[.06]', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx('relative flex-1 h-9 px-2 rounded-[9px] text-[13px] font-semibold transition-colors whitespace-nowrap', on ? (dark ? 'text-ink-950' : 'text-ink-950') : dark ? 'text-white/70' : 'text-ink-600')}
          >
            {on && <motion.span layoutId={`seg-${id}`} className={cx('absolute inset-0 rounded-[9px] shadow-sm', dark ? 'bg-gold-500' : 'bg-white')} transition={{ type: 'spring', bounce: 0, duration: 0.3 }} />}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="scroll-x py-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cx('chip', o.value === value ? 'chip-on' : 'chip-off')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Count up from 0 the first time the number scrolls into view. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-IN'), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const started = useRef(false)
  const [shown, setShown] = useState(reduce ? value : 0)
  useEffect(() => {
    if (!inView) return
    if (reduce || started.current) {
      setShown(value)
      return
    }
    started.current = true
    const c = animate(0, value, { duration: 0.7, ease: [0.16, 1, 0.3, 1], onUpdate: setShown })
    return () => c.stop()
  }, [inView, value, reduce])
  return (
    <span ref={ref} className={cx('tabular', className)}>
      {format(shown)}
    </span>
  )
}

export function ProgressRing({ value, max, size = 44, stroke = 4 }: { value: number; max: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, value / max) : 0
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#F3EAD7" strokeWidth={stroke} fill="none" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#E0A82E"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  )
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-cream-200">
      <motion.div className="h-full rounded-full bg-gold-500" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between">
      <h2 className="text-[17px] font-bold">{children}</h2>
      {action}
    </div>
  )
}

/** Stagger children on first mount only. */
export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}
export const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', bounce: 0, duration: 0.35 } },
}

export function Tags({ items, max }: { items: string[]; max?: number }) {
  const list = max ? items.slice(0, max) : items
  if (!list.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((t) => (
        <span key={t} className="tag">
          {t}
        </span>
      ))}
      {max && items.length > max && <span className="tag">+{items.length - max}</span>}
    </div>
  )
}
