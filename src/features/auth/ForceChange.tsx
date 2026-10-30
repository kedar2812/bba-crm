import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { PasswordInput, StrengthMeter } from '@/components/inputs'
import { Button } from '@/components/ui'
import { api, errorMessage, fieldErrors } from '@/lib/api'
import { AuthLayout } from './AuthLayout'

/** Shown when an account was created with a temporary password (first admin). */
export default function ForceChange() {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const qc = useQueryClient()
  const m = useMutation({
    mutationFn: () => api.post('auth/change-password', { current_password: current, password }),
    onSuccess: () => {
      toast.success('Password updated')
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast.error(errorMessage(e))
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!current) errs.current_password = 'Enter your temporary password.'
    if (password.length < 8) errs.password = 'Use at least 8 characters.'
    if (password !== confirm) errs.confirm = "Passwords don't match."
    setErrors(errs)
    if (!Object.keys(errs).length) m.mutate()
  }
  return (
    <AuthLayout title="Choose a new password" sub="You signed in with a temporary password. Set your own to continue.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <PasswordInput label="Temporary password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current_password} />
        <div>
          <PasswordInput label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
          <StrengthMeter password={password} />
        </div>
        <PasswordInput label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <Button type="submit" block size="lg" loading={m.isPending}>
          Save and continue
        </Button>
      </form>
    </AuthLayout>
  )
}
