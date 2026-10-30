import { LogOut, MonitorSmartphone } from 'lucide-react'
import { useLogout } from '@/components/Shell'
import { Button } from '@/components/ui'
import { PasswordForm, Section } from '@/features/profile/Profile'
import { useMe } from '@/lib/session'
import { AdminTitle } from './shared'

/** An admin's own account: sign-in details only — admins have no member profile. */
export default function AdminAccount() {
  const me = useMe().data?.member
  const logout = useLogout()
  if (!me) return null
  return (
    <div className="page max-w-3xl space-y-4">
      <AdminTitle title="Account" sub="Your admin sign-in. Admin accounts don't have a member profile." />
      <Section title="Signed in as">
        <dl className="grid gap-3 text-[14px] sm:grid-cols-3">
          <div>
            <dt className="text-[12px] font-semibold text-ink-600">Name</dt>
            <dd className="mt-0.5 font-semibold">{me.full_name}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] font-semibold text-ink-600">Email</dt>
            <dd className="mt-0.5 truncate font-semibold">{me.email}</dd>
          </div>
          <div>
            <dt className="text-[12px] font-semibold text-ink-600">Mobile</dt>
            <dd className="mt-0.5 font-semibold">{me.mobile}</dd>
          </div>
        </dl>
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
