import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, ShieldAlert } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PasswordInput } from '@/components/inputs'
import { Button, Checkbox, Input } from '@/components/ui'
import { ApiError, api, errorMessage, setCsrf } from '@/lib/api'
import { useMe } from '@/lib/session'
import type { MeResponse } from '@/lib/types'
import { AuthLayout } from './AuthLayout'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<{ code: string; message: string } | null>(null)
  const nav = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const me = useMe()

  const go = (role: string) => {
    const next = params.get('next')
    nav(next && next.startsWith('/') && !next.startsWith('//') ? next : role === 'admin' ? '/admin' : '/app', { replace: true })
  }

  useEffect(() => {
    if (me.data?.member) go(me.data.member.role)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data?.member])

  const m = useMutation({
    mutationFn: () => api.post<MeResponse>('auth/login', { identifier, password, remember }),
    onSuccess: (d) => {
      setCsrf(d.csrf)
      qc.setQueryData(['me'], (old: MeResponse | undefined) => ({ ...(old ?? {}), ...d }))
      qc.invalidateQueries({ queryKey: ['me'] })
      if (d.member) go(d.member.role)
    },
    onError: (e) => {
      if (e instanceof ApiError && ['pending_review', 'rejected', 'deactivated'].includes(e.code)) setStatus({ code: e.code, message: e.message })
      else setError(errorMessage(e))
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!identifier.trim() || !password) return setError('Enter your email or mobile and your password.')
    m.mutate()
  }

  if (status) {
    return (
      <AuthLayout title={status.code === 'pending_review' ? 'Almost there' : 'Account unavailable'}>
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-100 text-gold-700">{status.code === 'pending_review' ? <Clock className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}</span>
          <p className="text-[16px] leading-relaxed text-ink-800">{status.message}</p>
          <Button variant="outline" className="mt-6" onClick={() => setStatus(null)}>
            Back to login
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Welcome back" sub="Log in to your BBA account.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Email or mobile number" autoComplete="username" inputMode="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoCapitalize="none" autoCorrect="off" />
        <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex items-center justify-between gap-3">
          <Checkbox checked={remember} onChange={setRemember}>
            Keep me signed in
          </Checkbox>
          <Link to="/forgot-password" className="shrink-0 text-[14px] font-semibold text-gold-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="rounded-field bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger" role="alert">
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <Button type="submit" block size="lg" loading={m.isPending}>
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-[14px] text-ink-600">
        Not a member?{' '}
        <Link to="/join" className="font-semibold text-ink-950 underline decoration-gold-500 decoration-2 underline-offset-4">
          Apply to join
        </Link>
      </p>
    </AuthLayout>
  )
}
