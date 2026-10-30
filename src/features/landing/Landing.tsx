import '@fontsource-variable/anek-gujarati/wdth.css'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Logo } from '@/components/Brand'
import { api } from '@/lib/api'
import { appHref } from '@/lib/config'
import { fmtClock, inr, parseDate } from '@/lib/format'

/*
 * Landing page — a shopfront signboard.
 * Black condensed lettering on marigold is the look of a bazaar signboard, and it is
 * also BBA's own black-and-gold. The client's tagline is the signboard; each word
 * carries one live fact. Everything below the sign stays quiet.
 * One family throughout: Anek Gujarati (Ek Type), condensed for the sign, normal for reading.
 */

const FAMILY = "'Anek Gujarati Variable', system-ui, sans-serif"
const SIGN: CSSProperties = { fontFamily: FAMILY, fontStretch: '75%', fontWeight: 800 }
const HEAD: CSSProperties = { fontFamily: FAMILY, fontStretch: '88%', fontWeight: 700, letterSpacing: '-0.015em' }

const GOLD = '#E0A82E'
const LEDGER = '#F3E6C8'
const GOLD_INK = '#7A5500'

interface Content {
  hero_sub: string
  about: string
  contact_email: string
  contact_phone: string
  contact_address: string
  instagram_handle: string
  next_meeting: { title: string; meeting_date: string; start_time: string; venue: string | null } | null
}

/** "₹1.7 crore", "₹45 lakh" — how members actually say amounts. */
function rupeesInWords(n: number) {
  const t = (x: number) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, '')
  if (n >= 1e7) return `₹${t(n / 1e7)} crore`
  if (n >= 1e5) return `₹${t(n / 1e5)} lakh`
  return inr(n)
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function meetingWhen(date: string, time: string) {
  const d = parseDate(date)
  if (!d) return ''
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${fmtClock(time).toLowerCase()}`
}

function daysAway(d: Date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const n = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / 86400000)
  return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? `In ${n} days` : ''
}

/** The next meeting, pinned to the signboard like a ticket stub. */
function NextMeetingTicket({ m }: { m: NonNullable<Content['next_meeting']> }) {
  const d = parseDate(m.meeting_date)
  if (!d) return null
  const soon = daysAway(d)
  return (
    <motion.div
      className="mb-10 flex max-w-[640px] items-stretch overflow-hidden rounded-[6px] bg-black text-white md:mb-14"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 }}
    >
      <div className="flex w-[86px] shrink-0 flex-col items-center justify-center border-r-2 border-dashed border-white/25 py-3 md:w-[108px]">
        <span className="text-[13px] font-semibold uppercase tracking-[0.12em]" style={{ color: GOLD }}>
          {DAYS[d.getDay()].slice(0, 3)}
        </span>
        <span className="text-[48px] leading-[0.92] md:text-[60px]" style={{ ...SIGN, color: GOLD }}>
          {d.getDate()}
        </span>
        <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/70">{MONTHS[d.getMonth()].slice(0, 3)}</span>
      </div>
      <div className="min-w-0 flex-1 px-4 py-3.5 md:px-6 md:py-4">
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: GOLD }}>
          Next meeting
          {soon && <span className="rounded-[4px] px-1.5 py-px text-[12px] tracking-[0.08em] text-black" style={{ background: GOLD }}>{soon}</span>}
        </p>
        <p className="mt-1 text-[21px] leading-[1.15] md:text-[27px]" style={HEAD}>
          {m.title}
        </p>
        <p className="mt-1.5 text-[16px] leading-snug text-white/80 md:text-[17px]">
          {DAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}, {fmtClock(m.start_time).toLowerCase()}
          {m.venue && <span className="block text-white/65">{m.venue}</span>}
        </p>
      </div>
    </motion.div>
  )
}

function JoinButton({ tone = 'dark' }: { tone?: 'dark' | 'gold' }) {
  return (
    <motion.a
      href={appHref('/join')}
      whileTap={{ scale: 0.97 }}
      className={`inline-flex h-14 items-center justify-center rounded-[6px] px-7 text-[17px] font-semibold transition-colors ${
        tone === 'dark' ? 'bg-black text-white hover:bg-[#2b2b2b]' : 'bg-[#E0A82E] text-black hover:bg-[#ECBC4E]'
      }`}
    >
      I want to join BBA
    </motion.a>
  )
}

function MemberButton({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <motion.a
      href={appHref('/login')}
      whileTap={{ scale: 0.97 }}
      className={`inline-flex h-14 items-center justify-center rounded-[6px] border-2 px-7 text-[17px] font-semibold transition-colors ${
        tone === 'dark' ? 'border-black text-black hover:bg-black hover:text-[#E0A82E]' : 'border-white/70 text-white hover:border-white hover:bg-white hover:text-black'
      }`}
    >
      I'm already a member
    </motion.a>
  )
}

/** One line of the signboard: the word, and the fact that backs it up. */
function SignRow({ word, fact, i }: { word: string; fact: ReactNode; i: number }) {
  return (
    <div className="md:contents">
      <motion.span
        aria-hidden
        className="block uppercase leading-[0.8]"
        style={{ ...SIGN, fontSize: 'clamp(78px, 25vw, 236px)', letterSpacing: '-0.01em' }}
        initial={{ opacity: 0, x: -48 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, delay: 0.1 + i * 0.09, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {word}
      </motion.span>
      <motion.p
        className="mb-6 mt-2 max-w-[30ch] self-end text-[17px] leading-[1.4] text-black/80 md:mb-[0.45em] md:mt-0 md:text-[19px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.55 + i * 0.09 }}
      >
        {fact}
      </motion.p>
    </div>
  )
}

/** A real-looking notification, as members see it in the app. */
function Notice({ initials, title, sub, when, children }: { initials: string; title: string; sub: string; when: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-[14px] border border-black/10 bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold" style={{ background: GOLD }}>
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[16px] font-semibold leading-snug">{title}</p>
          <span className="shrink-0 text-[13px] text-black/45">{when}</span>
        </div>
        <p className="mt-0.5 text-[15px] leading-snug text-black/60">{sub}</p>
        {children}
      </div>
    </div>
  )
}

function ConfirmDemo() {
  const [state, setState] = useState<'ask' | 'yes' | 'no'>('ask')
  if (state !== 'ask')
    return (
      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-[14px] font-semibold" style={{ color: state === 'yes' ? '#2E7D4F' : 'rgba(0,0,0,.55)' }}>
        {state === 'yes' ? 'Confirmed. It now counts for both of you.' : "Marked as didn't happen. It won't count."}
      </motion.p>
    )
  return (
    <div className="mt-3 flex gap-2">
      <button type="button" onClick={() => setState('yes')} className="h-11 rounded-[6px] bg-black px-4 text-[15px] font-semibold text-white">
        Confirm
      </button>
      <button type="button" onClick={() => setState('no')} className="h-11 rounded-[6px] border border-black/20 px-4 text-[15px] font-semibold">
        Didn't happen
      </button>
    </div>
  )
}

export default function Landing() {
  const content = useQuery({ queryKey: ['public-content'], queryFn: () => api.get<Content>('public/content'), staleTime: 5 * 60_000 })
  const stats = useQuery({ queryKey: ['public-stats'], queryFn: () => api.get<{ members: number; business: number; ones: number; referrals: number }>('public/stats'), staleTime: 5 * 60_000 })
  const trades = useQuery({ queryKey: ['public-trades'], queryFn: () => api.get<{ name: string; n: number }[]>('public/trades'), staleTime: 5 * 60_000 })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ id: number; name: string }[]>('public/categories'), staleTime: 10 * 60_000 })

  const c = content.data
  const next = c?.next_meeting
  const business = stats.data?.business ?? 0
  const tradeList = trades.data ?? []
  const memberCount = tradeList.reduce((s, t) => s + Number(t.n), 0)
  const fallbackTrades = (categories.data ?? []).map((x) => x.name).filter((n) => n.toLowerCase() !== 'other')
  const year = new Date().getFullYear()

  return (
    <div className="min-h-[100dvh] bg-white text-black [&_:focus-visible]:outline-black" style={{ fontFamily: FAMILY }}>
      {/* The signboard */}
      <header style={{ background: GOLD }} className="pt-safe">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
          <nav className="flex items-center justify-between pb-10 pt-5 md:pb-16">
            <a href="/" className="flex items-center gap-3" aria-label="BBA home">
              <Logo size={52} />
              <span className="flex flex-col">
                <span className="text-[26px] leading-none" style={SIGN}>
                  BBA
                </span>
                <span className="mt-0.5 text-[14px] font-medium text-black/75 sm:text-[15px]">Burhani Business Association</span>
              </span>
            </a>
            <a href={appHref('/login')} className="-mr-2 rounded-[6px] px-2 py-2 text-[16px] font-semibold underline decoration-2 underline-offset-[6px] hover:decoration-[3px]">
              Log in
            </a>
          </nav>

          {next && <NextMeetingTicket m={next} />}

          <h1 className="sr-only">Burhani Business Association: Network, Trust, Business</h1>
          <div className="md:grid md:grid-cols-[minmax(0,auto)_minmax(0,1fr)] md:gap-x-12">
          <SignRow i={0} word="Network" fact="Members meet in person, and get to know each other one-to-one." />
          <SignRow i={1} word="Trust" fact="A referral or a one-to-one meeting only counts once both members confirm it." />
          <SignRow i={2} word="Business" fact={business > 0 ? <>{rupeesInWords(business)} of work has passed between members so far.</> : 'Every rupee of work members pass to each other is recorded.'} />
          </div>

          <motion.div className="flex flex-col gap-3 pb-12 pt-6 sm:flex-row md:pb-20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.85 }}>
            <JoinButton />
            <MemberButton />
          </motion.div>
        </div>
      </header>

      <main>
        {/* What BBA is */}
        <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 md:py-28">
          <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-16">
            <p className="max-w-[24ch] text-[28px] leading-[1.18] md:text-[40px]" style={HEAD}>
              {c?.hero_sub || 'Business owners in BBA send each other work, and keep a shared record of it.'}
            </p>
            <p className="max-w-[46ch] text-[18px] leading-[1.6] text-black/75 md:pt-2 md:text-[19px]">
              {c?.about ||
                'Most good clients come through someone you trust. BBA makes that deliberate: you get to know other owners at meetings and over one-to-one conversations, pass along leads when you hear of them, and see what that trust adds up to.'}
            </p>
          </div>
        </section>

        {/* Who's in the room */}
        {(tradeList.length > 0 || fallbackTrades.length > 0) && (
          <section className="border-t-2 border-black">
            <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 md:py-28">
              <h2 className="text-[36px] leading-[1.05] md:text-[56px]" style={HEAD}>
                {tradeList.length > 0 ? 'Who you’ll meet' : 'The trades we bring together'}
              </h2>
              <p className="mt-3 max-w-[48ch] text-[18px] leading-[1.5] text-black/70">
                {tradeList.length > 0
                  ? `${memberCount} member${memberCount === 1 ? '' : 's'} across ${tradeList.length} trade${tradeList.length === 1 ? '' : 's'}. The small number is how many members work in each.`
                  : 'Owners from every kind of business, so there is usually someone who can use what you sell.'}
              </p>
              <p className="mt-10 text-[34px] leading-[1.12] md:text-[60px]" style={{ ...SIGN, fontWeight: 700 }}>
                {tradeList.length > 0
                  ? tradeList.map((t) => (
                      <span key={t.name} className="mr-[0.45em] inline-block">
                        {t.name}
                        <sup className="ml-[0.12em] text-[0.42em] font-semibold" style={{ color: GOLD_INK, fontStretch: '100%' }}>
                          {t.n}
                        </sup>
                      </span>
                    ))
                  : fallbackTrades.map((name) => (
                      <span key={name} className="mr-[0.45em] inline-block">
                        {name}
                      </span>
                    ))}
              </p>
            </div>
          </section>
        )}

        {/* What members do */}
        <section style={{ background: LEDGER }}>
          <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-20 sm:px-8 md:grid-cols-[1.1fr_1fr] md:gap-x-16 md:gap-y-12 md:py-28">
            <h2 className="text-[36px] leading-[1.05] md:col-span-2 md:text-[56px]" style={HEAD}>
              What members do in the app
            </h2>
            <div>
              <dl className="space-y-8">
                {[
                  ['Pass a referral', "Pick the member, name the client, add a rough value. It takes under a minute, and they're told straight away."],
                  ['Say thank you', "When someone's referral turns into work, record the amount. It counts once, for both of you."],
                  ['Confirm a one-to-one', 'After you meet a member one-to-one, they confirm it happened. Only confirmed meetings count.'],
                ].map(([t, d]) => (
                  <div key={t} className="max-w-[44ch]">
                    <dt className="text-[21px] font-bold leading-tight">{t}</dt>
                    <dd className="mt-1.5 text-[17px] leading-[1.55] text-black/70">{d}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <div className="space-y-3">
                <Notice initials="FR" title="Fatema thanked you for ₹25,000" sub="Catering for an office opening" when="2h" />
                <Notice initials="MS" title="Murtaza sent you a referral" sub="Office fit-out for Sunrise Apartments" when="Yesterday" />
                <Notice initials="HK" title="Did you meet Huzefa on Tuesday?" sub="Confirm the meeting so it counts for both of you." when="Tue">
                  <ConfirmDemo />
                </Notice>
              </div>
              <p className="mt-4 text-[14px] text-black/55">Examples of what members see on their phones. Try the buttons.</p>
            </div>
          </div>
        </section>

        {/* How to join — a real sequence, so it is numbered */}
        <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 md:py-28">
          <h2 className="text-[36px] leading-[1.05] md:text-[56px]" style={HEAD}>
            How to join
          </h2>
          <ol className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {[
              ['Apply online', 'About five minutes. Keep your ITS number and a clear photo of yourself handy.'],
              ['Confirm your email', 'We send a 6-digit code to check the address is yours.'],
              ['The committee reviews it', 'You get an email as soon as your application is approved.'],
              ['Come to your first meeting', 'Log in, finish your profile, and start meeting members.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-5">
                <span className="w-[0.6em] shrink-0 text-[64px] leading-[0.8]" style={{ ...SIGN, color: GOLD_INK }}>
                  {i + 1}
                </span>
                <div className="pt-1">
                  <p className="text-[21px] font-bold leading-tight">{t}</p>
                  <p className="mt-1.5 max-w-[40ch] text-[17px] leading-[1.55] text-black/70">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-14 flex flex-col sm:flex-row">
            <JoinButton />
          </div>
        </section>
        <InstagramSection handle={c?.instagram_handle ?? ''} />
      </main>

      {/* Close */}
      <footer className="bg-black pb-safe text-white">
        <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-20 sm:px-8 md:pt-28">
          <p className="max-w-[12ch] text-[64px] uppercase leading-[0.86] md:text-[120px]" style={{ ...SIGN, color: GOLD }}>
            {next ? 'See you at the next meeting' : 'Grow with people you trust'}
          </p>
          {next && (
            <p className="mt-6 text-[19px] leading-[1.5] text-white/85">
              {next.title}, {meetingWhen(next.meeting_date, next.start_time)}
              {next.venue ? `. ${next.venue}` : ''}.
            </p>
          )}
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <JoinButton tone="gold" />
            <MemberButton tone="light" />
          </div>

          <div className="mt-20 grid gap-8 border-t border-white/20 pt-8 text-[16px] text-white/70 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Logo size={72} className="mb-4" />
              <p className="text-white">Burhani Business Association</p>
              {c?.contact_address && <p>{c.contact_address}</p>}
            </div>
            <div className="space-y-1.5 md:text-right">
              {c?.contact_email && (
                <a href={`mailto:${c.contact_email}`} className="block hover:text-white">
                  {c.contact_email}
                </a>
              )}
              {c?.contact_phone && (
                <a href={`tel:${c.contact_phone}`} className="block hover:text-white">
                  {c.contact_phone}
                </a>
              )}
              <p className="text-white/45">© {year} Burhani Business Association</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

interface InstaPost {
  id: string
  permalink: string
  image: string
  type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  alt: string
  caption: string
}

/** Latest Instagram posts (from the API's cached Behold feed), each linking to the post itself. */
function InstagramSection({ handle }: { handle: string }) {
  const feed = useQuery({ queryKey: ['public-instagram'], queryFn: () => api.get<{ username: string; posts: InstaPost[] }>('public/instagram'), staleTime: 30 * 60_000 })
  const user = feed.data?.username || handle
  const posts = (feed.data?.posts ?? []).slice(0, 6)
  if (!user) return null
  const profile = `https://www.instagram.com/${user}/`
  return (
    <section className="border-t-2 border-black">
      <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 md:py-28">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[36px] leading-[1.05] md:text-[56px]" style={HEAD}>
              BBA on Instagram
            </h2>
            <p className="mt-3 max-w-[44ch] text-[18px] leading-[1.5] text-black/70">Meetings, new members and the work they do together, as it happens.</p>
          </div>
          <a
            href={profile}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-14 shrink-0 items-center justify-center gap-2.5 self-start rounded-[6px] bg-black px-7 text-[17px] font-semibold text-white transition-colors hover:bg-[#2b2b2b] md:self-auto"
          >
            <InstagramGlyph />
            Follow @{user}
          </a>
        </div>
        {posts.length > 0 && (
          <ul className="mt-10 grid grid-cols-3 gap-1 sm:gap-2">
            {posts.map((p, i) => (
              <motion.li key={p.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}>
                <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="group relative block aspect-square overflow-hidden" style={{ background: LEDGER }} aria-label={p.caption ? `Instagram post: ${p.caption.slice(0, 80)}` : 'Open this post on Instagram'}>
                  <img src={p.image} alt={p.alt} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  {p.type !== 'IMAGE' && (
                    <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">{p.type === 'VIDEO' ? 'Reel' : 'Album'}</span>
                  )}
                  {p.caption && (
                    <span className="pointer-events-none absolute inset-0 hidden items-end bg-gradient-to-t from-black/75 via-black/10 to-transparent p-4 text-left text-[15px] leading-snug text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 md:flex">
                      <span className="line-clamp-3">{p.caption}</span>
                    </span>
                  )}
                </a>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
