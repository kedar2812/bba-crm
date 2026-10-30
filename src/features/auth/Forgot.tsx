import { useMutation } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { OtpInput, PasswordInput, StrengthMeter } from '@/components/inputs'
import { Button, Input } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { AuthLayout } from './AuthLayout'

export default function Forgot() {
  const [params] = useSearchParams()
  const [step, setStep] = useState<'email' | 'code'>(params.get('step') === 'code' ? 'code' : 'email')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [cooldown, setCooldown] = useState(0)
  const nav = useNavigate()

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const send = useMutation({
    mutationFn: () => api.post<{ message: string }>('auth/forgot', { email }),
    onSuccess: (d) => {
      toast.success(d.message)
      setStep('code')
      setCooldown(60)
    },
    onError: (e) => setErrors(fieldErrors(e).email ? fieldErrors(e) : { email: errorMessage(e) }),
  })

  const reset = useMutation({
    mutationFn: () => api.post('auth/reset', { email, code, password }),
    onSuccess: () => {
      toast.success('Password updated. Log in with your new password.')
      nav('/login', { replace: true })
    },
    onError: (e) => {
      const f = fieldErrors(e)
      setErrors(Object.keys(f).length ? f : { code: errorMessage(e) })
    },
  })

  const submitEmail = (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErrors({ email: 'Enter a valid email address.' })
    send.mutate()
  }

  const submitReset = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (code.length !== 6) errs.code = 'Enter the 6-digit code from your email.'
    if (password.length < 8) errs.password = 'Use at least 8 characters.'
    if (password !== confirm) errs.confirm = "Passwords don't match."
    setErrors(errs)
    if (Object.keys(errs).length) return
    reset.mutate()
  }

  return (
    <AuthLayout title="Reset your password" sub={step === 'email' ? "We'll email you a 6-digit code." : `Enter the code we sent to ${email}.`} back={{ to: '/login', label: 'Login' }}>
      {step === 'email' ? (
        <form onSubmit={submitEmail} className="space-y-4" noValidate>
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoCapitalize="none" />
          <Button type="submit" block size="lg" loading={send.isPending}>
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={submitReset} className="space-y-5" noValidate>
          <div>
            <span className="label">6-digit code</span>
            <OtpInput value={code} onChange={setCode} error={errors.code} />
            <div className="mt-2 text-[13px] text-ink-600">
              {cooldown > 0 ? (
                `Resend code in ${cooldown}s`
              ) : (
                <button type="button" className="font-semibold text-gold-700" onClick={() => send.mutate()}>
                  Resend code
                </button>
              )}
            </div>
          </div>
          <div>
            <PasswordInput label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
            <StrengthMeter password={password} />
          </div>
          <PasswordInput label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
          <Button type="submit" block size="lg" loading={reset.isPending}>
            Set new password
          </Button>
          <button type="button" onClick={() => setStep('email')} className="block w-full text-center text-[14px] text-ink-600">
            Use a different email
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-[14px] text-ink-600">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold text-ink-950 underline decoration-gold-500 decoration-2 underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
