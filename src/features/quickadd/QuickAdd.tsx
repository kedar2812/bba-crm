import { motion } from 'framer-motion'
import { ArrowLeft, CalendarCheck, HeartHandshake, Send, UserPlus } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Sheet } from '@/components/Sheet'
import { GiveReferralForm, InviteVisitorForm, Log121Form, Request121Form, ThankYouForm } from './forms'

export type QuickKind = 'referral' | 'thanks' | '121' | 'request121' | 'visitor'
interface Prefill {
  memberId?: number
}
interface Ctx {
  open: (kind?: QuickKind | null, prefill?: Prefill) => void
}

const QuickAddCtx = createContext<Ctx>({ open: () => {} })
export const useQuickAdd = () => useContext(QuickAddCtx)

const options: { kind: QuickKind; title: string; sub: string; icon: ReactNode }[] = [
  { kind: 'referral', title: 'Give a Referral', sub: 'Pass a lead to a member', icon: <Send className="h-6 w-6" /> },
  { kind: 'thanks', title: 'Thank You Note', sub: 'I received business', icon: <HeartHandshake className="h-6 w-6" /> },
  { kind: '121', title: 'Log a 121', sub: 'A meeting that happened', icon: <CalendarCheck className="h-6 w-6" /> },
  { kind: 'visitor', title: 'Invite a Visitor', sub: 'Bring a guest to BBA', icon: <UserPlus className="h-6 w-6" /> },
]

const titles: Record<QuickKind, string> = {
  referral: 'Give a Referral',
  thanks: 'Thank You Note',
  '121': 'Log a 121',
  request121: 'Request a 121',
  visitor: 'Invite a Visitor',
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [kind, setKind] = useState<QuickKind | null>(null)
  const [prefill, setPrefill] = useState<Prefill>({})
  const [direct, setDirect] = useState(false)

  const open = useCallback((k: QuickKind | null = null, p: Prefill = {}) => {
    setKind(k)
    setPrefill(p)
    setDirect(!!k)
    setOpen(true)
  }, [])
  const close = useCallback(() => setOpen(false), [])
  const value = useMemo(() => ({ open }), [open])

  const title = kind ? (
    <span className="flex items-center gap-1">
      {!direct && (
        <button type="button" onClick={() => setKind(null)} className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink-950/5" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      {titles[kind]}
    </span>
  ) : (
    'Quick Add'
  )

  return (
    <QuickAddCtx.Provider value={value}>
      {children}
      <Sheet open={isOpen} onClose={close} title={title}>
        {!kind && (
          <motion.div className="grid grid-cols-2 gap-3 pt-1 pb-2" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}>
            {options.map((o) => (
              <motion.button
                key={o.kind}
                type="button"
                onClick={() => setKind(o.kind)}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                whileTap={{ scale: 0.97 }}
                className="flex min-h-[132px] flex-col items-start justify-between rounded-[18px] border border-line bg-white p-4 text-left shadow-card transition-colors hover:border-gold-500"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-ink-950 text-gold-300">{o.icon}</span>
                <span>
                  <span className="block font-display text-[15px] font-bold leading-tight">{o.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-600">{o.sub}</span>
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
        {kind === 'referral' && <GiveReferralForm prefillTo={prefill.memberId} onDone={close} />}
        {kind === 'thanks' && <ThankYouForm prefillFrom={prefill.memberId} onDone={close} />}
        {kind === '121' && <Log121Form prefillWith={prefill.memberId} onDone={close} />}
        {kind === 'request121' && <Request121Form prefillWith={prefill.memberId} onDone={close} />}
        {kind === 'visitor' && <InviteVisitorForm onDone={close} />}
      </Sheet>
    </QuickAddCtx.Provider>
  )
}
