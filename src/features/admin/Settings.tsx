import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Mail, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, ErrorState, Input, Skeleton, Textarea } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { AdminTitle } from './shared'

interface Data {
  settings: Record<string, string | number>
  categories: { id: number; name: string; is_archived: number; members_count: number }[]
  mail: { driver: string; from: string }
}

const KEYS = ['target_121s', 'target_referrals', 'hero_sub', 'about', 'contact_email', 'contact_phone', 'contact_address', 'instagram_handle', 'instagram_feed_url'] as const

export default function Settings() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.get<Data>('admin/settings') })
  const [v, setV] = useState<Record<string, string>>({})
  const [newCat, setNewCat] = useState('')
  const [renaming, setRenaming] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!q.data) return
    const init: Record<string, string> = {}
    KEYS.forEach((k) => (init[k] = q.data.settings[k] == null ? '' : String(q.data.settings[k])))
    setV(init)
  }, [q.data])

  const save = useMutation({
    mutationFn: () => api.post('admin/settings/save', v),
    onSuccess: () => {
      toast.success('Settings saved')
      qc.invalidateQueries({ queryKey: ['admin'] })
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['public-content'] })
      qc.invalidateQueries({ queryKey: ['public-instagram'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const cat = useMutation({
    mutationFn: (b: { id?: number; name: string; is_archived?: number }) => api.post('admin/categories/save', b),
    onSuccess: () => {
      toast.success('Category saved')
      setNewCat('')
      setRenaming({})
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const test = useMutation({
    mutationFn: () => api.post<{ to: string }>('admin/email/test'),
    onSuccess: (d) => toast.success(`Test email sent to ${d.to}`),
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (q.isLoading)
    return (
      <div className="page space-y-4">
        <Skeleton className="h-48 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    )
  if (q.isError || !q.data)
    return (
      <div className="page">
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </div>
    )
  const e = fieldErrors(save.error)
  const set = (k: string, val: string) => setV({ ...v, [k]: val })

  return (
    <div className="page max-w-3xl space-y-4">
      <AdminTitle title="Settings" />
      <form
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault()
          save.mutate()
        }}
      >
        <section className="card p-5">
          <h2 className="text-[17px] font-bold">Monthly targets</h2>
          <p className="mt-0.5 text-[13px] text-ink-600">Apply to every member.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Input label="121s per month" type="number" inputMode="numeric" min={0} value={v.target_121s ?? ''} onChange={(x) => set('target_121s', x.target.value)} error={e.target_121s} />
            <Input label="Referrals per month" type="number" inputMode="numeric" min={0} value={v.target_referrals ?? ''} onChange={(x) => set('target_referrals', x.target.value)} error={e.target_referrals} />
          </div>
        </section>
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="text-[17px] font-bold">Landing page content</h2>
            <p className="mt-0.5 text-[13px] text-ink-600">Shown on bbanetworking.com.</p>
          </div>
          <Textarea label="Hero sub-line" rows={2} counter={300} value={v.hero_sub ?? ''} onChange={(x) => set('hero_sub', x.target.value)} error={e.hero_sub} />
          <Textarea label="About paragraph" rows={5} counter={2000} value={v.about ?? ''} onChange={(x) => set('about', x.target.value)} error={e.about} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Contact email" type="email" value={v.contact_email ?? ''} onChange={(x) => set('contact_email', x.target.value)} error={e.contact_email} />
            <Input label="Contact phone" type="tel" value={v.contact_phone ?? ''} onChange={(x) => set('contact_phone', x.target.value)} />
          </div>
          <Input label="Address" value={v.contact_address ?? ''} onChange={(x) => set('contact_address', x.target.value)} />
        </section>
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="text-[17px] font-bold">Instagram on the landing page</h2>
            <p className="mt-0.5 text-[13px] text-ink-600">
              Shows your latest posts and a Follow button. New posts appear on their own within a day, through a free{' '}
              <a href="https://behold.so" target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-gold-500 decoration-2 underline-offset-2">
                Behold.so
              </a>{' '}
              feed: sign up there, connect the BBA Instagram account, create a JSON feed and paste its URL here. Leave the feed empty to show only the Follow button.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Instagram username" optional prefix="@" autoCapitalize="none" placeholder="bba.official" value={v.instagram_handle ?? ''} onChange={(x) => set('instagram_handle', x.target.value)} error={e.instagram_handle} />
            <Input label="Behold JSON feed URL" optional autoCapitalize="none" inputMode="url" placeholder="https://feeds.behold.so/…" value={v.instagram_feed_url ?? ''} onChange={(x) => set('instagram_feed_url', x.target.value)} error={e.instagram_feed_url} />
          </div>
        </section>
        <Button type="submit" size="lg" loading={save.isPending} className="w-full sm:w-auto">
          Save settings
        </Button>
      </form>

      <section className="card p-5">
        <h2 className="text-[17px] font-bold">Business categories</h2>
        <p className="mt-0.5 text-[13px] text-ink-600">Archived categories disappear from forms but stay on existing members.</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(ev) => {
            ev.preventDefault()
            if (newCat.trim()) cat.mutate({ name: newCat.trim() })
          }}
        >
          <input className="field h-11 flex-1" placeholder="New category name" value={newCat} onChange={(x) => setNewCat(x.target.value)} />
          <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} className="h-11">
            Add
          </Button>
        </form>
        <div className="mt-3 divide-y divide-line rounded-[12px] border border-line">
          {q.data.categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2">
              {renaming[c.id] !== undefined ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(ev) => {
                    ev.preventDefault()
                    cat.mutate({ id: c.id, name: renaming[c.id], is_archived: c.is_archived })
                  }}
                >
                  <input autoFocus className="field h-10 flex-1" value={renaming[c.id]} onChange={(x) => setRenaming({ ...renaming, [c.id]: x.target.value })} />
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </form>
              ) : (
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setRenaming({ [c.id]: c.name })} title="Rename">
                  <span className={`text-[14px] font-medium ${c.is_archived ? 'text-ink-400 line-through' : ''}`}>{c.name}</span>
                  <span className="ml-2 text-[12px] text-ink-400">{c.members_count} members</span>
                </button>
              )}
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-600 hover:bg-ink-950/5"
                aria-label={c.is_archived ? 'Restore' : 'Archive'}
                title={c.is_archived ? 'Restore' : 'Archive'}
                onClick={() => cat.mutate({ id: c.id, name: c.name, is_archived: c.is_archived ? 0 : 1 })}
              >
                {c.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-[17px] font-bold">Email</h2>
        <p className="mt-1 text-[14px] text-ink-700">
          Sending via <span className="font-semibold">{({ resend: 'Resend', smtp: 'SMTP (Gmail)', mail: 'server mail()', log: 'log file (dev)' } as Record<string, string>)[q.data.mail.driver] ?? q.data.mail.driver}</span>
          {q.data.mail.from ? ` from ${q.data.mail.from}` : ''}. Change it in <code className="rounded bg-cream-100 px-1">config.secrets.php</code>.
        </p>
        <Button variant="outline" className="mt-4" icon={<Mail className="h-4 w-4" />} loading={test.isPending} onClick={() => test.mutate()}>
          Send test email to me
        </Button>
      </section>
    </div>
  )
}
