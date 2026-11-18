import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArchiveRestore, Check, Download, FileArchive, HardDriveDownload, Loader2, ShieldCheck, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, ErrorState, Input, ProgressBar, Skeleton } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { API_BASE } from '@/lib/config'
import { fmtDate, fmtTime, relTime } from '@/lib/format'
import { AdminTitle } from './shared'

interface Status {
  members: number
  rows_total: number
  file_count: number
  file_bytes: number
  last_export: { created_at: string; by_name: string | null } | null
  last_restore: { created_at: string; by_name: string | null } | null
  safety: { name: string; size: number; made_at: string }[]
  chunk_size: number
  max_upload: number
}

interface Summary {
  created_at: string
  site: string
  schema_version: number
  tables: Record<string, number>
  rows_total: number
  members: number
  admins: number
  file_count: number
  file_bytes: number
  skipped_entries: number
  size: number
}

type Source = { id: string } | { safety: string }
type Step =
  | { kind: 'idle' }
  | { kind: 'uploading'; name: string; sent: number; total: number }
  | { kind: 'checking'; name: string }
  | { kind: 'ready'; name: string; source: Source; summary: Summary }
  | { kind: 'restoring'; name: string; source: Source; summary: Summary }

function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

const when = (s: string) => `${fmtDate(s)}, ${fmtTime(s)}`

/** Download a file from the API (with the session cookie) and save it under the server's file name. */
async function saveDownload(url: string, fallback: string) {
  let res: Response
  try {
    res = await fetch(url, { credentials: 'include' })
  } catch {
    throw new Error('No connection. Check your internet and try again.')
  }
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || type.includes('json')) {
    const j = await res.json().catch(() => null)
    throw new Error(j?.error?.message ?? `Download failed (${res.status}).`)
  }
  const blob = await res.blob()
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallback
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 30_000)
  return { name, size: blob.size }
}

const TABLE_LABELS: [string, string][] = [
  ['members', 'Member and admin accounts'],
  ['referrals', 'Referrals and business'],
  ['one_to_ones', '121 meetings'],
  ['meetings', 'Chapter meetings'],
  ['attendance', 'Attendance marks'],
  ['visitors', 'Visitors invited by members'],
  ['visit_requests', 'Visitor-form responses'],
  ['testimonials', 'Testimonials'],
  ['notifications', 'Notifications'],
  ['audit_logs', 'Audit log entries'],
]

export default function Backup() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const q = useQuery({ queryKey: ['admin', 'backup'], queryFn: () => api.get<Status>('admin/backup/status') })
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [confirm, setConfirm] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const restoreCard = useRef<HTMLElement>(null)
  const cancelled = useRef(false)

  const download = async (url: string, fallback: string, key: string) => {
    setDownloading(key)
    try {
      const { name, size } = await saveDownload(url, fallback)
      toast.success(`Saved ${name} (${bytes(size)}). Keep it somewhere safe, like Google Drive or your email.`, { duration: 7000 })
      qc.invalidateQueries({ queryKey: ['admin', 'backup'] })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setDownloading(null)
    }
  }

  const inspect = async (name: string, source: Source) => {
    setStep({ kind: 'checking', name })
    restoreCard.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    try {
      const summary = await api.post<Summary>('admin/backup/inspect', source)
      setConfirm('')
      setStep({ kind: 'ready', name, source, summary })
    } catch (e) {
      if ('id' in source) api.post('admin/backup/discard', source).catch(() => undefined)
      setStep({ kind: 'idle' })
      toast.error(errorMessage(e), { duration: 8000 })
    }
  }

  const uploadFile = async (file: File) => {
    const status = q.data
    if (!status) return
    if (!/\.zip$/i.test(file.name)) return toast.error('Choose the .zip file you downloaded from this page.')
    if (file.size > status.max_upload) return toast.error(`That file is ${bytes(file.size)}, larger than any BBA backup should be.`)
    cancelled.current = false
    let id = ''
    let sent = 0
    setStep({ kind: 'uploading', name: file.name, sent: 0, total: file.size })
    try {
      while (sent < file.size) {
        if (cancelled.current) throw new Error('cancelled')
        const fd = new FormData()
        if (id) fd.append('id', id)
        fd.append('offset', String(sent))
        fd.append('chunk', file.slice(sent, sent + status.chunk_size), 'chunk.bin')
        // Retry a chunk a few times: phones on patchy connections drop requests.
        let res: { id: string; size: number } | null = null
        for (let attempt = 1; !res; attempt++) {
          try {
            res = await api.post<{ id: string; size: number }>('admin/backup/upload', fd)
          } catch (e) {
            if (attempt >= 3) throw e
            await new Promise((r) => setTimeout(r, 1000 * attempt))
          }
        }
        id = res.id
        sent = res.size
        setStep({ kind: 'uploading', name: file.name, sent, total: file.size })
      }
    } catch (e) {
      if (id) api.post('admin/backup/discard', { id }).catch(() => undefined)
      setStep({ kind: 'idle' })
      if (!cancelled.current) toast.error(errorMessage(e))
      return
    }
    inspect(file.name, { id })
  }

  const cancel = () => {
    cancelled.current = true
    if ((step.kind === 'ready' || step.kind === 'checking') && 'source' in step && 'id' in step.source) api.post('admin/backup/discard', step.source).catch(() => undefined)
    setStep({ kind: 'idle' })
  }

  const restore = useMutation({
    mutationFn: (source: Source) => api.post<{ signed_in: boolean; safety: string; file_problems: number }>('admin/backup/restore', { ...source, confirm }),
    onMutate: () => step.kind === 'ready' && setStep({ ...step, kind: 'restoring' }),
    onSuccess: (r) => {
      setStep({ kind: 'idle' })
      if (r.file_problems) toast.warning(`${r.file_problems} file(s) could not be put back. Check the server's disk space.`)
      if (!r.signed_in) {
        toast.success('Restore complete. Sign in with an admin account from the backup.', { duration: 8000 })
        qc.clear()
        nav('/login', { replace: true })
        return
      }
      toast.success('Restore complete. The dashboard and website now show the backup’s data.', { duration: 7000 })
      qc.invalidateQueries()
    },
    onError: (e) => {
      if (step.kind === 'restoring') setStep({ ...step, kind: 'ready' })
      toast.error(errorMessage(e), { duration: 8000 })
    },
  })

  if (q.isLoading)
    return (
      <div className="page max-w-3xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    )
  if (q.isError || !q.data)
    return (
      <div className="page">
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </div>
    )
  const s = q.data
  const busy = step.kind !== 'idle'

  return (
    <div className="page max-w-3xl space-y-4">
      <AdminTitle title="Backup" sub="Keep a full copy of BBA's data off the server, and put it back if the server is ever lost." />

      <section className="card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-100 text-gold-700">
            <HardDriveDownload className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold">Download a backup</h2>
            <p className="mt-0.5 text-[14px] text-ink-600">
              One .zip file with everything on the dashboard and the website: {s.members} members, all referrals, 121s, meetings, attendance, visitors and visitor-form responses, notifications, settings, the
              landing-page text, the audit log, and all {s.file_count} uploaded photos, proofs and QR codes.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            [s.rows_total.toLocaleString('en-IN'), 'records'],
            [s.file_count.toLocaleString('en-IN'), 'files'],
            [bytes(s.file_bytes), 'of uploads'],
          ].map(([v, l]) => (
            <div key={l} className="rounded-field bg-cream-100 px-2 py-3">
              <p className="font-display text-[18px] font-bold tabular">{v}</p>
              <p className="text-[12px] text-ink-600">{l}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button size="lg" className="shrink-0 whitespace-nowrap" icon={<Download className="h-5 w-5" />} loading={downloading === 'export'} disabled={!!downloading} onClick={() => download(`${API_BASE}/admin/backup/export`, 'bba-backup.zip', 'export')}>
            Download backup (.zip)
          </Button>
          <p className="text-[13px] text-ink-600">
            {s.last_export ? (
              <>
                Last downloaded {relTime(s.last_export.created_at)}
                {s.last_export.by_name ? ` by ${s.last_export.by_name}` : ''}.
              </>
            ) : (
              'No backup downloaded yet.'
            )}{' '}
            Download one every month, and before any big change.
          </p>
        </div>
        <p className="mt-3 flex items-start gap-2 text-[13px] text-ink-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
          It holds members' personal details. Store it privately. The server's own settings (the email API key) are not in it.
        </p>
      </section>

      <section ref={restoreCard} className="card scroll-mt-24 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink-950 text-gold-300">
            <ArchiveRestore className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold">Restore from a backup</h2>
            <p className="mt-0.5 text-[14px] text-ink-600">
              Choose a backup .zip downloaded from this page. It is checked completely first and nothing changes until you confirm. Then everything here is replaced by the backup’s contents, exactly as they
              were when it was made.
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step.kind === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f) uploadFile(f)
                }}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-field border-2 border-dashed border-ink-300 bg-cream-50 px-4 py-8 text-center transition-colors hover:border-gold-500"
              >
                <Upload className="h-6 w-6 text-ink-600" />
                <span className="text-[15px] font-semibold">Choose a backup file</span>
                <span className="text-[13px] text-ink-600">or drop the .zip here</span>
              </button>
              <input
                ref={input}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) uploadFile(f)
                }}
              />
            </motion.div>
          )}

          {(step.kind === 'uploading' || step.kind === 'checking') && (
            <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 rounded-field border border-line bg-cream-50 p-4">
              <div className="flex items-center gap-3">
                <FileArchive className="h-5 w-5 shrink-0 text-ink-600" />
                <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{step.name}</p>
                <Button size="sm" variant="ghost" onClick={cancel} icon={<X className="h-4 w-4" />}>
                  Cancel
                </Button>
              </div>
              {step.kind === 'uploading' ? (
                <div className="mt-3">
                  <ProgressBar value={step.sent} max={step.total} />
                  <p className="mt-1.5 text-[13px] text-ink-600">
                    Uploading… {bytes(step.sent)} of {bytes(step.total)}
                  </p>
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-600">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking every table and file in the backup…
                </p>
              )}
            </motion.div>
          )}

          {(step.kind === 'ready' || step.kind === 'restoring') && (
            <motion.div key="ready" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-4">
              <div className="rounded-field border border-success/30 bg-success/[.06] p-4">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-success">
                  <Check className="h-4 w-4" /> This backup is complete and undamaged
                </p>
                <p className="mt-1 text-[14px] text-ink-700">
                  <span className="font-semibold">{step.name}</span> · made {step.summary.created_at ? when(step.summary.created_at) : 'at an unknown time'}
                  {step.summary.site ? ` on ${step.summary.site.replace(/^https?:\/\//, '')}` : ''} · {bytes(step.summary.size)}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13.5px] sm:grid-cols-3">
                  <div>
                    <dt className="inline text-ink-600">Members: </dt>
                    <dd className="inline font-semibold tabular">{step.summary.members}</dd>
                  </div>
                  <div>
                    <dt className="inline text-ink-600">Admins: </dt>
                    <dd className="inline font-semibold tabular">{step.summary.admins}</dd>
                  </div>
                  <div>
                    <dt className="inline text-ink-600">Files: </dt>
                    <dd className="inline font-semibold tabular">{step.summary.file_count}</dd>
                  </div>
                  {TABLE_LABELS.filter(([t]) => t !== 'members' && step.summary.tables[t] !== undefined).map(([t, l]) => (
                    <div key={t}>
                      <dt className="inline text-ink-600">{l}: </dt>
                      <dd className="inline font-semibold tabular">{step.summary.tables[t].toLocaleString('en-IN')}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex gap-3 rounded-field border border-danger/30 bg-danger/[.05] p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div className="text-[14px] text-ink-800">
                  <p className="font-semibold">Everything currently on the dashboard and website will be replaced.</p>
                  <p className="mt-1 text-ink-700">
                    Anything added since this backup was made is removed. A safety copy of the current data is saved first, so you can undo this below. Everyone who signs in afterwards uses the
                    passwords from the backup.
                  </p>
                </div>
              </div>

              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (confirm === 'RESTORE' && step.kind === 'ready') restore.mutate(step.source)
                }}
              >
                <div className="flex-1">
                  <Input label="Type RESTORE to confirm" autoCapitalize="characters" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} disabled={step.kind === 'restoring'} />
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={cancel} disabled={step.kind === 'restoring'}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="danger" disabled={confirm !== 'RESTORE'} loading={step.kind === 'restoring'}>
                    {step.kind === 'restoring' ? 'Restoring…' : 'Restore this backup'}
                  </Button>
                </div>
              </form>
              {step.kind === 'restoring' && <p className="text-[13px] text-ink-600">Please keep this page open. It usually takes under a minute.</p>}
            </motion.div>
          )}
        </AnimatePresence>
        {s.last_restore && (
          <p className="mt-4 text-[13px] text-ink-600">
            Last restore: {when(s.last_restore.created_at)}
            {s.last_restore.by_name ? ` by ${s.last_restore.by_name}` : ''}.
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="text-[17px] font-bold">Safety copies</h2>
        <p className="mt-0.5 text-[14px] text-ink-600">Saved automatically just before each restore, so a restore can be undone. The last 5 are kept on the server.</p>
        {s.safety.length === 0 ? (
          <p className="mt-3 rounded-field bg-cream-100 px-4 py-3 text-[14px] text-ink-600">None yet. One appears here the first time you restore a backup.</p>
        ) : (
          <div className="mt-3 divide-y divide-line rounded-field border border-line">
            {s.safety.map((c) => (
              <div key={c.name} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">Data as it was before the restore on {when(c.made_at)}</p>
                  <p className="text-[12.5px] text-ink-600">{bytes(c.size)}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Download className="h-4 w-4" />}
                    loading={downloading === c.name}
                    disabled={!!downloading}
                    onClick={() => download(`${API_BASE}/admin/backup/safety/download?name=${encodeURIComponent(c.name)}`, `bba-${c.name}`, c.name)}
                  >
                    Download
                  </Button>
                  <Button size="sm" variant="secondary" icon={<ArchiveRestore className="h-4 w-4" />} disabled={busy} onClick={() => inspect('Safety copy', { safety: c.name })}>
                    Restore
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
