import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { OtpInput, PasswordInput, PhotoPicker, StrengthMeter, TagInput } from '@/components/inputs'
import { Button, Checkbox, Input, Select, Spinner, Textarea, cx } from '@/components/ui'
import { api, errorMessage, fieldErrors, setCsrf } from '@/lib/api'
import { appHref } from '@/lib/config'
import { blobName } from '@/lib/image'
import { fetchMe, useCategories } from '@/lib/session'
import { AuthLayout } from './AuthLayout'

interface Invite {
  full_name: string
  email: string
  mobile: string | null
  role: 'member' | 'admin'
  inviter: string | null
  expires_at: string
}

const STORE = 'bba-join-draft'
const CITIES = ['Pune', 'Mumbai', 'Surat', 'Ahmedabad', 'Indore', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Delhi', 'Nashik', 'Nagpur', 'Thane']

interface Draft {
  full_name: string
  mobile: string
  email: string
  its_number: string
  business_name: string
  category_id: string
  category_other: string
  designation: string
  business_description: string
  address: string
  city: string
  website: string
  instagram: string
  linkedin: string
  facebook: string
  offers: string[]
  looking_for: string[]
  referred_by_text: string
  consent: boolean
}

const empty: Draft = {
  full_name: '', mobile: '', email: '', its_number: '', business_name: '', category_id: '', category_other: '', designation: '',
  business_description: '', address: '', city: '', website: '', instagram: '', linkedin: '', facebook: '', offers: [], looking_for: [], referred_by_text: '', consent: false,
}

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(STORE)
    return raw ? { ...empty, ...JSON.parse(raw) } : empty
  } catch {
    return empty
  }
}

const stepFields: Record<number, (keyof Draft | 'photo' | 'password' | 'confirm')[]> = {
  1: ['full_name', 'photo', 'mobile', 'email', 'its_number', 'password', 'confirm'],
  2: ['business_name', 'category_id', 'category_other', 'designation', 'business_description', 'address', 'city', 'website', 'instagram', 'linkedin', 'facebook'],
  3: ['offers', 'looking_for', 'referred_by_text', 'consent'],
}

/** /join (apply, then verify email with a code) and /invite/:token (an admin's invite: no code, joins approved). */
export default function Join() {
  const { token } = useParams()
  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => api.get<Invite>('invite/view', { token }), enabled: !!token, retry: false, staleTime: Infinity })
  if (!token) return <JoinForm />
  if (invite.isLoading)
    return (
      <AuthLayout title="Your invitation">
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      </AuthLayout>
    )
  if (invite.isError || !invite.data)
    return (
      <AuthLayout title="Invitation unavailable">
        <p className="text-[15px] leading-relaxed text-ink-700">{errorMessage(invite.error)}</p>
        <Link to="/login" className="mt-6 inline-block text-[14px] font-semibold text-ink-950 underline decoration-gold-500 decoration-2 underline-offset-4">
          Go to login
        </Link>
      </AuthLayout>
    )
  return <JoinForm invite={{ ...invite.data, token }} />
}

function JoinForm({ invite }: { invite?: Invite & { token: string } }) {
  const [step, setStep] = useState(1)
  // Admin accounts administer only: no photo, ITS or business profile — just sign-in details.
  const adminInvite = invite?.role === 'admin'
  const [d, setD] = useState<Draft>(() =>
    invite ? { ...empty, full_name: invite.full_name, email: invite.email, mobile: invite.mobile ?? '' } : loadDraft(),
  )
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const cats = useCategories()
  const isOther = cats.data?.find((c) => String(c.id) === d.category_id)?.name.toLowerCase() === 'other'

  useEffect(() => {
    if (invite) return
    try {
      sessionStorage.setItem(STORE, JSON.stringify(d))
    } catch {
      /* private mode */
    }
  }, [d, invite])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }))
  }

  const validate = (s: number) => {
    const e: Record<string, string> = {}
    if (s === 1) {
      if (d.full_name.trim().length < 2) e.full_name = 'Enter your full name.'
      if (!photo && !adminInvite) e.photo = 'Please add a profile photo.'
      if (!/^[6-9]\d{9}$/.test(d.mobile.replace(/\D/g, '').slice(-10)) || d.mobile.replace(/\D/g, '').length < 10) e.mobile = 'Enter a valid 10-digit mobile number.'
      if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = 'Enter a valid email address.'
      if (!/^\d{8}$/.test(d.its_number.trim()) && !adminInvite) e.its_number = 'ITS number must be exactly 8 digits.'
      if (password.length < 8) e.password = 'Use at least 8 characters.'
      if (password !== confirm) e.confirm = "Passwords don't match."
    }
    if (s === 2) {
      if (!d.business_name.trim()) e.business_name = 'Business name is required.'
      if (!d.category_id) e.category_id = 'Pick a category.'
      if (isOther && !d.category_other.trim()) e.category_other = 'Tell us your category.'
      if (!d.designation.trim()) e.designation = 'Designation is required.'
      if (!d.business_description.trim()) e.business_description = 'Describe your business in a line or two.'
      if (!d.address.trim()) e.address = 'Business address is required.'
      if (!d.city.trim()) e.city = 'City is required.'
    }
    if (s === 3) {
      if (!d.offers.length) e.offers = 'Add at least one product or service.'
      if (!d.consent) e.consent = 'Please agree to continue.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const start = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('data', JSON.stringify({ ...d, password, consent: d.consent ? 1 : 0, ...(invite ? { token: invite.token } : {}) }))
      if (photo) fd.append('photo', photo, blobName(photo))
      if (!invite) return api.post<{ email: string; cooldown: number }>('join/start', fd)
      const r = await api.post<{ csrf: string }>('invite/accept', fd)
      setCsrf(r.csrf)
      await qc.fetchQuery({ queryKey: ['me'], queryFn: fetchMe })
      return null
    },
    onSuccess: (r) => {
      if (!r) {
        toast.success(`Welcome to BBA, ${d.full_name.split(' ')[0]}!`)
        navigate(invite?.role === 'admin' ? '/admin' : '/app', { replace: true })
        return
      }
      setCooldown(r.cooldown)
      setCode('')
      setStep(4)
    },
    onError: (e) => {
      const f = fieldErrors(e)
      setErrors(f)
      toast.error(errorMessage(e))
      // Jump back to the first step that has a server error
      for (const s of [1, 2, 3]) {
        if (stepFields[s].some((k) => f[k as string])) {
          setStep(s)
          break
        }
      }
    },
  })

  const resend = useMutation({
    mutationFn: () => api.post<{ cooldown: number }>('join/resend', { email: d.email }),
    onSuccess: (r) => {
      setCooldown(r.cooldown)
      toast.success('A new code is on its way')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const verify = useMutation({
    mutationFn: (c: string) => api.post('join/verify', { email: d.email, code: c }),
    onSuccess: () => {
      try {
        sessionStorage.removeItem(STORE)
      } catch {
        /* ignore */
      }
      setStep(5)
    },
    onError: (e) => {
      setErrors({ code: errorMessage(e) })
      setCode('')
    },
  })

  const next = (e: FormEvent) => {
    e.preventDefault()
    if (!validate(step)) return
    if (step < 3 && !adminInvite) setStep(step + 1)
    else start.mutate()
  }

  if (step === 5) {
    return (
      <AuthLayout title="Application received">
        <div className="flex flex-col items-center py-4 text-center">
          <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }} className="flex h-20 w-20 items-center justify-center rounded-full bg-gold-500 shadow-gold">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="#0B0B0B" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }} />
            </svg>
          </motion.span>
          <p className="mt-6 text-[16px] leading-relaxed text-ink-800">Thank you, {d.full_name.split(' ')[0]}. The BBA team will review your application and email you once it's approved.</p>
          <a href={appHref('/')} className="mt-6 text-[14px] font-semibold text-ink-950 underline decoration-gold-500 decoration-2 underline-offset-4">
            Back to home
          </a>
        </div>
      </AuthLayout>
    )
  }

  const titles = ['About you', 'Your business', 'Networking', 'Verify your email']
  const steps = adminInvite ? [1] : invite ? [1, 2, 3] : [1, 2, 3, 4]
  return (
    <AuthLayout
      title={invite ? `Welcome, ${invite.full_name.split(' ')[0]}` : 'Join BBA'}
      sub={invite ? `${invite.inviter ?? 'BBA'} invited you${adminInvite ? ' as an administrator. Set up your admin account to get started.' : '. Set up your profile to get started.'}` : titles[step - 1]}
      back={{ to: '/login', label: 'Login' }}
      wide
    >
      {/* Progress */}
      <div className="mb-6">
        <div className="flex gap-1.5">
          {steps.map((s) => (
            <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-200">
              <motion.div className="h-full bg-gold-500" initial={false} animate={{ width: s <= step ? '100%' : '0%' }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] font-medium text-ink-600">
          {adminInvite ? 'Your admin account' : `Step ${step} of ${steps.length} · ${titles[step - 1]}`}
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
          {step === 4 ? (
            <div className="space-y-5">
              <p className="text-[15px] leading-relaxed text-ink-700">
                We sent a 6-digit code to <span className="font-semibold">{d.email}</span>. Enter it below to submit your application.
              </p>
              <OtpInput value={code} onChange={(v) => { setCode(v); setErrors({}) }} onComplete={(v) => verify.mutate(v)} error={errors.code} disabled={verify.isPending} />
              <Button block size="lg" loading={verify.isPending} disabled={code.length !== 6} onClick={() => verify.mutate(code)}>
                Verify and submit
              </Button>
              <div className="flex items-center justify-between text-[14px]">
                <button type="button" className="inline-flex items-center gap-1 text-ink-600" onClick={() => setStep(3)}>
                  <ArrowLeft className="h-4 w-4" /> Edit details
                </button>
                {cooldown > 0 ? (
                  <span className="text-ink-400">Resend in {cooldown}s</span>
                ) : (
                  <button type="button" className="font-semibold text-gold-700" disabled={resend.isPending} onClick={() => resend.mutate()}>
                    Resend code
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={next} className="space-y-4" noValidate>
              {step === 1 && (
                <>
                  <Input label="Full name" autoComplete="name" value={d.full_name} onChange={(e) => set('full_name', e.target.value)} error={errors.full_name} />
                  {!adminInvite && <div>
                    <span className="label">Profile photo</span>
                    <PhotoPicker value={photo} onChange={(b) => { setPhoto(b); setErrors((e) => ({ ...e, photo: '' })) }} error={errors.photo} />
                  </div>}
                  <Input label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel-national" prefix="+91" maxLength={14} value={d.mobile} onChange={(e) => set('mobile', e.target.value)} error={errors.mobile} />
                  <Input
                    label="Email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    value={d.email}
                    onChange={(e) => set('email', e.target.value)}
                    error={errors.email}
                    disabled={!!invite}
                    hint={invite ? 'Your invitation was sent to this address. You will log in with it.' : undefined}
                  />
                  {!adminInvite && <Input label="ITS number" inputMode="numeric" maxLength={8} value={d.its_number} onChange={(e) => set('its_number', e.target.value.replace(/\D/g, ''))} error={errors.its_number} hint="8 digits. Only BBA admins can see this." />}
                  <div>
                    <PasswordInput label="Password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
                    <StrengthMeter password={password} />
                  </div>
                  <PasswordInput label="Confirm password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
                </>
              )}
              {step === 2 && (
                <>
                  <Input label="Business name" autoComplete="organization" value={d.business_name} onChange={(e) => set('business_name', e.target.value)} error={errors.business_name} />
                  <Select label="Business category" value={d.category_id} onChange={(e) => set('category_id', e.target.value)} error={errors.category_id}>
                    <option value="">Choose a category</option>
                    {cats.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  {isOther && <Input label="Your category" value={d.category_other} onChange={(e) => set('category_other', e.target.value)} error={errors.category_other} />}
                  <Input label="Designation" placeholder="e.g. Proprietor, Director" value={d.designation} onChange={(e) => set('designation', e.target.value)} error={errors.designation} />
                  <Textarea label="Business description" counter={500} value={d.business_description} onChange={(e) => set('business_description', e.target.value)} error={errors.business_description} />
                  <Textarea label="Business address" rows={2} className="min-h-[72px]" value={d.address} onChange={(e) => set('address', e.target.value)} error={errors.address} />
                  <Input label="City" list="join-cities" value={d.city} onChange={(e) => set('city', e.target.value)} error={errors.city} />
                  <datalist id="join-cities">
                    {CITIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <Input label="Website" optional inputMode="url" autoCapitalize="none" value={d.website} onChange={(e) => set('website', e.target.value)} error={errors.website} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Input label="Instagram" optional autoCapitalize="none" placeholder="Link" value={d.instagram} onChange={(e) => set('instagram', e.target.value)} error={errors.instagram} />
                    <Input label="LinkedIn" optional autoCapitalize="none" placeholder="Link" value={d.linkedin} onChange={(e) => set('linkedin', e.target.value)} error={errors.linkedin} />
                    <Input label="Facebook" optional autoCapitalize="none" placeholder="Link" value={d.facebook} onChange={(e) => set('facebook', e.target.value)} error={errors.facebook} />
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <TagInput label="Products & services you offer" value={d.offers} onChange={(v) => set('offers', v)} error={errors.offers} placeholder="e.g. Modular kitchens" />
                  <TagInput label="Products & services you're looking for" optional value={d.looking_for} onChange={(v) => set('looking_for', v)} placeholder="e.g. Builders" />
                  <Input label="Referred by a BBA member?" optional placeholder="Member's name" value={d.referred_by_text} onChange={(e) => set('referred_by_text', e.target.value)} />
                  <Checkbox checked={d.consent} onChange={(v) => set('consent', v)} error={errors.consent}>
                    I agree that my details will be shared with BBA members.
                  </Checkbox>
                </>
              )}
              <div className={cx('flex gap-3 pt-2', step === 1 && 'flex-col')}>
                {step > 1 && (
                  <Button variant="outline" size="lg" className="w-28" onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                )}
                <Button type="submit" size="lg" className={step === 1 ? 'w-full' : 'flex-1'} loading={start.isPending} icon={step === 3 || adminInvite ? <Check className="h-4 w-4" /> : undefined}>
                  {step === 3 || adminInvite ? (invite ? 'Create my account' : 'Submit & verify email') : 'Continue'}
                </Button>
              </div>
            </form>
          )}
        </motion.div>
      </AnimatePresence>

      <p className="mt-6 text-center text-[14px] text-ink-600">
        Already a member?{' '}
        <Link to="/login" className="font-semibold text-ink-950 underline decoration-gold-500 decoration-2 underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
