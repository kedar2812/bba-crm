import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, LogOut, MonitorSmartphone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { PasswordInput, PhotoPicker, StrengthMeter, TagInput } from '@/components/inputs'
import { useLogout } from '@/components/Shell'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { blobName } from '@/lib/image'
import { useCategories, useMe } from '@/lib/session'
import type { Me } from '@/lib/types'

export function Section({ title, children, sub }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-[17px] font-bold">{title}</h2>
      {sub && <p className="mt-0.5 text-[13px] text-ink-600">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function PhotoSection({ me }: { me: Me }) {
  const qc = useQueryClient()
  const [blob, setBlob] = useState<Blob | null>(null)
  const m = useMutation({
    mutationFn: (b: Blob) => {
      const fd = new FormData()
      fd.append('photo', b, blobName(b))
      return api.post('profile/photo', fd)
    },
    onSuccess: () => {
      toast.success('Photo updated')
      setBlob(null)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <PhotoPicker
      value={blob}
      currentUrl={me.photo_url}
      name={me.full_name}
      size={72}
      onChange={(b) => {
        setBlob(b)
        if (b) m.mutate(b)
      }}
    />
  )
}

function DetailsForm({ me }: { me: Me }) {
  const qc = useQueryClient()
  const cats = useCategories()
  const [v, setV] = useState({
    full_name: me.full_name,
    mobile: me.mobile,
    business_name: me.business_name,
    category_id: me.category_id ? String(me.category_id) : '',
    category_other: me.category_other ?? '',
    designation: me.designation,
    business_description: me.business_description ?? '',
    address: me.address ?? '',
    city: me.city,
    website: me.website ?? '',
    instagram: me.instagram ?? '',
    linkedin: me.linkedin ?? '',
    facebook: me.facebook ?? '',
  })
  const [offers, setOffers] = useState(me.offers)
  const [looking, setLooking] = useState(me.looking_for)
  const m = useMutation({
    mutationFn: () => api.post('profile/update', { ...v, offers, looking_for: looking }),
    onSuccess: () => {
      toast.success('Profile saved')
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const e = fieldErrors(m.error)
  const set = (k: keyof typeof v, val: string) => setV({ ...v, [k]: val })
  const isOther = cats.data?.find((c) => String(c.id) === v.category_id)?.name.toLowerCase() === 'other'
  return (
    <form
      className="space-y-4"
      onSubmit={(ev: FormEvent) => {
        ev.preventDefault()
        m.mutate()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name" value={v.full_name} onChange={(x) => set('full_name', x.target.value)} error={e.full_name} />
        <Input label="Mobile number" type="tel" prefix="+91" value={v.mobile} onChange={(x) => set('mobile', x.target.value)} error={e.mobile} />
        <Input label="Email" value={me.email} disabled hint="Contact an admin to change your email." />
        <Input label="Designation" value={v.designation} onChange={(x) => set('designation', x.target.value)} error={e.designation} />
        <Input label="Business name" value={v.business_name} onChange={(x) => set('business_name', x.target.value)} error={e.business_name} />
        <Select label="Category" value={v.category_id} onChange={(x) => set('category_id', x.target.value)} error={e.category_id}>
          <option value="">Choose a category</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {me.category_id && !cats.data?.some((c) => c.id === me.category_id) && <option value={me.category_id}>{me.category}</option>}
        </Select>
        {isOther && <Input label="Your category" value={v.category_other} onChange={(x) => set('category_other', x.target.value)} />}
      </div>
      <Textarea label="Business description" counter={500} value={v.business_description} onChange={(x) => set('business_description', x.target.value)} error={e.business_description} />
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Input label="Address" value={v.address} onChange={(x) => set('address', x.target.value)} error={e.address} />
        <Input label="City" value={v.city} onChange={(x) => set('city', x.target.value)} error={e.city} />
      </div>
      <TagInput label="What you offer" value={offers} onChange={setOffers} error={e.offers} />
      <TagInput label="What you're looking for" optional value={looking} onChange={setLooking} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Website" optional value={v.website} onChange={(x) => set('website', x.target.value)} error={e.website} autoCapitalize="none" />
        <Input label="Instagram" optional value={v.instagram} onChange={(x) => set('instagram', x.target.value)} error={e.instagram} autoCapitalize="none" />
        <Input label="LinkedIn" optional value={v.linkedin} onChange={(x) => set('linkedin', x.target.value)} error={e.linkedin} autoCapitalize="none" />
        <Input label="Facebook" optional value={v.facebook} onChange={(x) => set('facebook', x.target.value)} error={e.facebook} autoCapitalize="none" />
      </div>
      <Button type="submit" size="lg" loading={m.isPending} className="w-full sm:w-auto">
        Save changes
      </Button>
    </form>
  )
}

export function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<Record<string, string>>({})
  const m = useMutation({
    mutationFn: () => api.post('auth/change-password', { current_password: current, password: pw }),
    onSuccess: () => {
      toast.success('Password changed. Other devices have been logged out.')
      setCurrent('')
      setPw('')
      setConfirm('')
    },
    onError: (e) => {
      setErr(fieldErrors(e))
      toast.error(errorMessage(e))
    },
  })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const x: Record<string, string> = {}
        if (!current) x.current_password = 'Enter your current password.'
        if (pw.length < 8) x.password = 'Use at least 8 characters.'
        if (pw !== confirm) x.confirm = "Passwords don't match."
        setErr(x)
        if (!Object.keys(x).length) m.mutate()
      }}
    >
      <PasswordInput label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={err.current_password} />
      <div>
        <PasswordInput label="New password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={err.password} />
        <StrengthMeter password={pw} />
      </div>
      <PasswordInput label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={err.confirm} />
      <Button type="submit" variant="secondary" loading={m.isPending} className="w-full sm:w-auto">
        Change password
      </Button>
    </form>
  )
}

function TestimonialsSection({ meId }: { meId: number }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['member', String(meId)], queryFn: () => api.get<{ testimonials: { id: number; body: string; author_name: string; is_visible: number }[] }>('members/view', { id: meId }) })
  const m = useMutation({
    mutationFn: (v: { id: number; visible: boolean }) => api.post('testimonials/visibility', v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member', String(meId)] }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  const list = q.data?.testimonials ?? []
  if (!list.length) return <p className="text-[14px] text-ink-600">No testimonials yet.</p>
  return (
    <div className="divide-y divide-line">
      {list.map((t) => (
        <div key={t.id} className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className={`text-[14px] leading-relaxed ${t.is_visible ? '' : 'text-ink-400'}`}>“{t.body}”</p>
            <p className="mt-1 text-[12.5px] font-semibold text-ink-600">— {t.author_name}</p>
          </div>
          <Button size="sm" variant="outline" icon={t.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} onClick={() => m.mutate({ id: t.id, visible: !t.is_visible })}>
            {t.is_visible ? 'Shown' : 'Hidden'}
          </Button>
        </div>
      ))}
    </div>
  )
}

export default function Profile() {
  const me = useMe().data?.member
  const logout = useLogout()
  if (!me) return null
  return (
    <div className="page max-w-3xl space-y-4">
      <h1 className="page-title">My Profile</h1>
      <Section title="Photo">
        <PhotoSection me={me} />
      </Section>
      <Section title="Your details" sub="Shown to BBA members in the directory.">
        <DetailsForm me={me} />
      </Section>
      <Section title="Testimonials received" sub="Choose which ones appear on your public profile.">
        <TestimonialsSection meId={me.id} />
      </Section>
      <Section title="Change password">
        <PasswordForm />
      </Section>
      <Section title="Sessions">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" icon={<LogOut className="h-4 w-4" />} onClick={() => logout()}>
            Log out
          </Button>
          <Button variant="ghost" className="text-danger" icon={<MonitorSmartphone className="h-4 w-4" />} onClick={() => logout(true)}>
            Log out of all devices
          </Button>
        </div>
      </Section>
    </div>
  )
}
