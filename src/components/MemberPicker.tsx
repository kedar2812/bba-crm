import { AnimatePresence, motion } from 'framer-motion'
import { Check, Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useMemberPicker } from '@/lib/session'
import type { MemberMini } from '@/lib/types'
import { Avatar, Field, Spinner, cx } from './ui'

/**
 * Searchable member picker — search by name, business or category.
 * The result list opens inline (not floating) so it works inside bottom sheets
 * with the phone keyboard up.
 */
export function MemberPicker({ label, value, onChange, error, placeholder = 'Search by name or business' }: { label: string; value: number | null; onChange: (id: number | null, m?: MemberMini) => void; error?: string; placeholder?: string }) {
  const { data, isLoading } = useMemberPicker()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = data?.find((m) => m.id === value) ?? null

  const results = useMemo(() => {
    const list = data ?? []
    const s = q.trim().toLowerCase()
    if (!s) return list.slice(0, 50)
    return list.filter((m) => `${m.full_name} ${m.business_name} ${m.category ?? ''}`.toLowerCase().includes(s)).slice(0, 50)
  }, [data, q])

  if (selected && !open) {
    return (
      <Field label={label} error={error}>
        <div className="flex h-14 items-center gap-3 rounded-field border border-gold-500 bg-white pl-2.5 pr-1 ring-4 ring-gold-500/10">
          <Avatar src={selected.photo_url} name={selected.full_name} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">{selected.full_name}</p>
            <p className="truncate text-[12.5px] text-ink-600">{selected.business_name}</p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-400 hover:bg-ink-950/5"
            aria-label="Change member"
            onClick={() => {
              onChange(null)
              setOpen(true)
              setTimeout(() => inputRef.current?.focus(), 30)
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </Field>
    )
  }

  return (
    <Field label={label} error={error}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          ref={inputRef}
          className={cx('field pl-10', error && 'field-error')}
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-2 max-h-[264px] overflow-y-auto overscroll-contain rounded-field border border-line bg-white">
              {isLoading && (
                <div className="flex justify-center p-4">
                  <Spinner />
                </div>
              )}
              {!isLoading && results.length === 0 && <p className="p-4 text-center text-[14px] text-ink-600">No member matches “{q}”.</p>}
              {results.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m.id, m)
                    setOpen(false)
                    setQ('')
                  }}
                  className="flex w-full items-center gap-3 border-b border-line/70 px-3 py-2.5 text-left last:border-0 active:bg-cream-100 hover:bg-cream-50"
                >
                  <Avatar src={m.photo_url} name={m.full_name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold leading-tight">{m.full_name}</p>
                    <p className="truncate text-[12.5px] text-ink-600">
                      {m.business_name}
                      {m.category ? ` · ${m.category}` : ''}
                    </p>
                  </div>
                  {value === m.id && <Check className="h-4 w-4 text-gold-700" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Field>
  )
}
