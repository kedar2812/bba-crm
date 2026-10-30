import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, Briefcase, CalendarPlus, Camera, Globe, Mail, MapPin, MessageCircle, Pencil, Phone, Send, ThumbsUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Sheet } from '@/components/Sheet'
import { Avatar, Button, ErrorState, Skeleton, Tags, Textarea } from '@/components/ui'
import { useQuickAdd } from '@/features/quickadd/QuickAdd'
import { api, errorMessage } from '@/lib/api'
import { fmtDate, inrCompact, relTime, waLink } from '@/lib/format'

interface Profile {
  id: number
  full_name: string
  designation: string
  business_name: string
  category: string | null
  photo_url: string | null
  mobile: string
  email: string
  city: string
  address: string | null
  business_description: string | null
  website: string | null
  instagram: string | null
  linkedin: string | null
  facebook: string | null
  offers: string[]
  looking_for: string[]
  member_since: string
  is_me: boolean
  stats: { referrals_given: number; business_given: number; ones_done: number; referrals_received: number; business_received: number }
  testimonials: { id: number; body: string; author_id: number; author_name: string; author_business: string; author_photo_url: string | null; updated_at: string; is_visible: number }[]
  my_testimonial: { id: number; body: string } | null
}

function Action({ icon, label, href, onClick }: { icon: ReactNode; label: string; href?: string; onClick?: () => void }) {
  const cls = 'flex flex-col items-center gap-1.5 rounded-[14px] py-2.5 text-[11.5px] font-semibold text-ink-800 transition-colors hover:bg-cream-100 active:bg-cream-200'
  const inner = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-950 text-gold-300">{icon}</span>
      {label}
    </>
  )
  if (href)
    return (
      <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={cls}>
        {inner}
      </a>
    )
  return (
    <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={onClick} className={cls}>
      {inner}
    </motion.button>
  )
}

export default function MemberProfile() {
  const { id } = useParams()
  const nav = useNavigate()
  const qa = useQuickAdd()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['member', id], queryFn: () => api.get<Profile>('members/view', { id }) })
  const [writing, setWriting] = useState(false)
  const [body, setBody] = useState('')
  const save = useMutation({
    mutationFn: () => api.post('testimonials/save', { subject_id: Number(id), body }),
    onSuccess: () => {
      toast.success('Testimonial saved')
      setWriting(false)
      qc.invalidateQueries({ queryKey: ['member', id] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (q.isLoading)
    return (
      <div className="page space-y-4">
        <Skeleton className="h-56 rounded-card" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    )
  if (q.isError || !q.data)
    return (
      <div className="page">
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </div>
    )
  const m = q.data
  const socials = [
    { url: m.website, icon: <Globe className="h-4 w-4" />, label: 'Website' },
    { url: m.instagram, icon: <Camera className="h-4 w-4" />, label: 'Instagram' },
    { url: m.linkedin, icon: <Briefcase className="h-4 w-4" />, label: 'LinkedIn' },
    { url: m.facebook, icon: <ThumbsUp className="h-4 w-4" />, label: 'Facebook' },
  ].filter((s) => s.url)

  return (
    <div className="page max-w-3xl">
      <button type="button" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/app/directory'))} className="-ml-2 mb-2 inline-flex h-10 items-center gap-1.5 rounded-full px-2 text-[14px] font-medium text-ink-600 hover:bg-ink-950/5">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="card overflow-hidden">
        <div className="relative h-24 bg-ink-950">
          <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(120% 140% at 85% 0%, rgba(224,168,46,.35), transparent 55%)' }} />
        </div>
        <div className="px-5 pb-5">
          <div className="relative z-10 -mt-12 flex items-end justify-between">
            <Avatar src={m.photo_url} name={m.full_name} size={96} className="ring-4 ring-white" />
            {m.is_me && (
              <Link to="/app/profile" className="mb-1 inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-semibold hover:border-ink-300">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
            )}
          </div>
          <h1 className="mt-3 text-[24px] font-bold leading-tight">{m.full_name}</h1>
          <p className="text-[15px] text-ink-700">
            {m.designation} · {m.business_name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {m.category && <span className="rounded-full bg-gold-100 px-3 py-1 text-[12.5px] font-semibold text-gold-700">{m.category}</span>}
            {m.city && (
              <span className="inline-flex items-center gap-1 text-[13px] text-ink-600">
                <MapPin className="h-3.5 w-3.5" />
                {m.city}
              </span>
            )}
          </div>
        </div>
        {!m.is_me && (
          <div className="grid grid-cols-5 gap-1 border-t border-line px-2 py-2">
            <Action icon={<Phone className="h-[18px] w-[18px]" />} label="Call" href={`tel:+91${m.mobile}`} />
            <Action icon={<MessageCircle className="h-[18px] w-[18px]" />} label="WhatsApp" href={waLink(m.mobile)} />
            <Action icon={<Mail className="h-[18px] w-[18px]" />} label="Email" href={`mailto:${m.email}`} />
            <Action icon={<CalendarPlus className="h-[18px] w-[18px]" />} label="121" onClick={() => qa.open('request121', { memberId: m.id })} />
            <Action icon={<Send className="h-[18px] w-[18px]" />} label="Referral" onClick={() => qa.open('referral', { memberId: m.id })} />
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: 'Referrals given', v: String(m.stats.referrals_given) },
          { l: 'Business given', v: inrCompact(m.stats.business_given) },
          { l: '121s done', v: String(m.stats.ones_done) },
          { l: 'Member since', v: fmtDate(m.member_since).split(' ').slice(1).join(' ') },
        ].map((s) => (
          <div key={s.l} className="card p-4">
            <p className="font-display text-[20px] font-bold leading-none tabular">{s.v}</p>
            <p className="mt-1.5 text-[12px] text-ink-600">{s.l}</p>
          </div>
        ))}
      </div>

      <section className="card mt-4 space-y-5 p-5">
        {m.business_description && (
          <div>
            <h2 className="text-[15px] font-bold">About the business</h2>
            <p className="mt-1.5 whitespace-pre-line text-[14.5px] leading-relaxed text-ink-800">{m.business_description}</p>
          </div>
        )}
        {m.offers.length > 0 && (
          <div>
            <h2 className="mb-2 text-[15px] font-bold">Offers</h2>
            <Tags items={m.offers} />
          </div>
        )}
        {m.looking_for.length > 0 && (
          <div>
            <h2 className="mb-2 text-[15px] font-bold">Looking for</h2>
            <Tags items={m.looking_for} />
          </div>
        )}
        {m.address && (
          <div>
            <h2 className="text-[15px] font-bold">Address</h2>
            <p className="mt-1 text-[14.5px] text-ink-800">{m.address}</p>
          </div>
        )}
        {socials.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {socials.map((s) => (
              <a key={s.label} href={s.url!} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-semibold hover:border-ink-300">
                {s.icon} {s.label}
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-bold">Testimonials</h2>
          {!m.is_me && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setBody(m.my_testimonial?.body ?? '')
                setWriting(true)
              }}
            >
              {m.my_testimonial ? 'Edit yours' : 'Write a testimonial'}
            </Button>
          )}
        </div>
        {m.testimonials.length === 0 ? (
          <p className="card p-5 text-center text-[14px] text-ink-600">No testimonials yet.</p>
        ) : (
          <div className="space-y-3">
            {m.testimonials.map((t) => (
              <div key={t.id} className="card p-4">
                <p className="text-[14.5px] leading-relaxed text-ink-800">“{t.body}”</p>
                <div className="mt-3 flex items-center gap-2.5">
                  <Avatar src={t.author_photo_url} name={t.author_name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{t.author_name}</p>
                    <p className="truncate text-[12px] text-ink-400">
                      {t.author_business} · {relTime(t.updated_at)}
                    </p>
                  </div>
                  {m.is_me && !t.is_visible && <span className="text-[11.5px] text-ink-400">Hidden</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Sheet open={writing} onClose={() => setWriting(false)} title={`Testimonial for ${m.full_name.split(' ')[0]}`}>
        <form
          className="space-y-4 pt-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (body.trim().length < 10) return toast.error('Write at least a sentence.')
            save.mutate()
          }}
        >
          <Textarea label="Your testimonial" counter={1000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What was it like to work with them?" />
          <Button type="submit" block size="lg" loading={save.isPending}>
            Save testimonial
          </Button>
        </form>
      </Sheet>
    </div>
  )
}
