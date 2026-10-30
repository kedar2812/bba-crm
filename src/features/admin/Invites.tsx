import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, MailPlus, RotateCw, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Sheet } from '@/components/Sheet'
import { Button, Input, Segmented, StatusPill } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { relTime } from '@/lib/format'

interface Invite {
  id: number
  email: string
  full_name: string
  mobile: string | null
  role: 'member' | 'admin'
  state: 'pending' | 'expired' | 'accepted' | 'revoked'
  expires_at: string
  last_sent_at: string | null
  inviter: string | null
}

interface Issued {
  link: string
  sent: boolean
  email: string
}

/** "Invite member" button + the sheet that sends the invite. */
export function InviteButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={<MailPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
        Invite member
      </Button>
      {open && <InviteSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function InviteSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState({ full_name: '', email: '', mobile: '', role: 'member' as 'member' | 'admin' })
  const [issued, setIssued] = useState<Issued | null>(null)
  const create = useMutation({
    mutationFn: () => api.post<Issued>('admin/invites/create', v),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
      setIssued(r)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const e = fieldErrors(create.error)
  return (
    <Sheet open onClose={onClose} title={issued ? 'Invitation ready' : 'Invite a member'}>
      {issued ? (
        <IssuedLink issued={issued} name={v.full_name} onDone={onClose} />
      ) : (
        <form
          className="space-y-4 pt-1"
          onSubmit={(ev) => {
            ev.preventDefault()
            create.mutate()
          }}
        >
          <p className="text-[14px] leading-relaxed text-ink-600">They get an email with a link to set up their profile and password. They join as an active member straight away, with no application review.</p>
          <Input label="Full name" value={v.full_name} onChange={(x) => setV({ ...v, full_name: x.target.value })} error={e.full_name} />
          <Input label="Email" type="email" autoCapitalize="none" value={v.email} onChange={(x) => setV({ ...v, email: x.target.value })} error={e.email} />
          <Input label="Mobile number" optional type="tel" inputMode="numeric" prefix="+91" maxLength={14} value={v.mobile} onChange={(x) => setV({ ...v, mobile: x.target.value })} error={e.mobile} hint="Pre-fills their form. They can correct it." />
          <div>
            <span className="label">Role</span>
            <Segmented
              value={v.role}
              onChange={(role) => setV({ ...v, role })}
              options={[
                { value: 'member', label: 'Member' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
            {v.role === 'admin' && <p className="mt-2 text-[13px] text-ink-600">Admins can approve members, edit records and change settings. An admin account is for running BBA only — it has no member profile and can't give referrals or log 121s.</p>}
          </div>
          <Button type="submit" block size="lg" loading={create.isPending}>
            Send invitation
          </Button>
        </form>
      )}
    </Sheet>
  )
}

/** After sending: confirm the email went out, and offer the link for WhatsApp or copying. */
function IssuedLink({ issued, name, onDone }: { issued: Issued; name: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed. Select the link and copy it manually.')
    }
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(`Hi ${name.split(' ')[0] || ''}, you're invited to join BBA (Burhani Business Association). Set up your profile here: ${issued.link}`)}`
  return (
    <div className="space-y-4 pt-1">
      <p className="text-[15px] leading-relaxed text-ink-800">
        {issued.sent ? (
          <>
            We emailed the invitation to <span className="font-semibold">{issued.email}</span>. You can also send them the link yourself.
          </>
        ) : (
          <>
            <span className="font-semibold text-danger">The email could not be sent</span> (check Settings → Email). Send this link to {issued.email} yourself instead.
          </>
        )}
      </p>
      <div className="rounded-field border border-line bg-cream-50 p-3 font-mono text-[12.5px] break-all text-ink-700 select-all">{issued.link}</div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center rounded-field border border-line bg-white px-5 text-[15px] font-semibold text-ink-950 hover:border-ink-300">
          WhatsApp
        </a>
      </div>
      <p className="text-[12.5px] text-ink-400">The link works once and expires in 7 days.</p>
      <Button block variant="secondary" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}

/** Open invitations (sent but not yet accepted), shown above the members list. */
export function PendingInvites() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['admin', 'invites'], queryFn: () => api.get<Invite[]>('admin/invites') })
  const [issued, setIssued] = useState<(Issued & { name: string }) | null>(null)
  const resend = useMutation({
    mutationFn: (inv: Invite) => api.post<Issued>('admin/invites/resend', { id: inv.id }).then((r) => ({ ...r, name: inv.full_name })),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
      setIssued(r)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const revoke = useMutation({
    mutationFn: (id: number) => api.post('admin/invites/revoke', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
      toast.success('Invitation withdrawn')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const open = (list.data ?? []).filter((i) => i.state === 'pending' || i.state === 'expired')
  if (!open.length) return null
  return (
    <div className="mb-4">
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-400">Invitations not yet accepted</h2>
      <div className="card divide-y divide-line overflow-hidden">
        {open.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">
                {i.full_name} {i.role === 'admin' && <StatusPill status="admin" className="ml-1 align-middle" />}
              </p>
              <p className="truncate text-[12.5px] text-ink-600">
                {i.email} · sent {i.last_sent_at ? relTime(i.last_sent_at) : ''}
                {i.inviter ? ` by ${i.inviter}` : ''}
              </p>
            </div>
            <StatusPill status={i.state === 'pending' ? 'pending' : 'cancelled'} label={i.state === 'pending' ? 'Waiting' : 'Expired'} />
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" icon={<RotateCw className="h-3.5 w-3.5" />} loading={resend.isPending && resend.variables?.id === i.id} onClick={() => resend.mutate(i)}>
                Resend
              </Button>
              <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} loading={revoke.isPending && revoke.variables === i.id} onClick={() => revoke.mutate(i.id)}>
                Withdraw
              </Button>
            </div>
          </div>
        ))}
      </div>
      {issued && (
        <Sheet open onClose={() => setIssued(null)} title="Invitation re-sent">
          <IssuedLink issued={issued} name={issued.name} onDone={() => setIssued(null)} />
        </Sheet>
      )}
    </div>
  )
}
