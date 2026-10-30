import { useMutation } from '@tanstack/react-query'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Lightbox } from '@/components/Lightbox'
import { cx } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { API_BASE } from '@/lib/config'
import { blobName, fitImage } from '@/lib/image'
import { useRefreshAll } from '@/lib/session'
import type { OnePhoto } from '@/lib/types'

export const MAX_PHOTOS = 10

const photoUrl = (id: number) => `${API_BASE}/files/121-photo?id=${id}`

/** Shrink each photo in the browser and upload it to a 121. Returns how many failed. */
export async function uploadOnePhotos(oneId: number, files: File[]) {
  let failed = 0
  for (const file of files) {
    try {
      const blob = await fitImage(file)
      const fd = new FormData()
      fd.append('id', String(oneId))
      fd.append('file', blob, blobName(blob))
      await api.post('121s/photos', fd)
    } catch (e) {
      failed++
      if (failed === 1) toast.error(`A photo didn't upload: ${errorMessage(e)}`)
    }
  }
  return failed
}

function AddTile({ onFiles, busy, max }: { onFiles: (f: File[]) => void; busy?: boolean; max: number }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => input.current?.click()}
      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-ink-300 bg-white text-[12px] font-semibold text-ink-600 transition-colors hover:border-gold-500 hover:text-gold-700 disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
      {busy ? 'Uploading' : 'Add photos'}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
          e.target.value = ''
          if (files.length > max) toast.error(`You can add ${max} more photo${max === 1 ? '' : 's'}.`)
          if (files.length) onFiles(files.slice(0, max))
        }}
      />
    </button>
  )
}

/** Photos chosen in the "Log a 121" form, held locally until the 121 is saved. */
export function PhotoPicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return (
    <div>
      <span className="label">
        Photos <span className="font-normal text-ink-400">(optional · only you, them and admins can see them)</span>
      </span>
      <div className="grid grid-cols-4 gap-2">
        {urls.map((u, i) => (
          <div key={u} className="relative aspect-square overflow-hidden rounded-[12px] bg-cream-100">
            <img src={u} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink-950/70 text-white" aria-label="Remove photo">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && <AddTile max={MAX_PHOTOS - files.length} onFiles={(f) => onChange([...files, ...f])} />}
      </div>
    </div>
  )
}

/** Photos on a saved 121: thumbnails that open the zoomable viewer. */
export function OnePhotoGallery({ oneId, photos, canAdd }: { oneId: number; photos: OnePhoto[]; canAdd: boolean }) {
  const refresh = useRefreshAll()
  const [view, setView] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const del = useMutation({
    mutationFn: (id: number) => api.post('121s/photos/delete', { id }),
    onSuccess: () => {
      toast.success('Photo removed')
      setView((v) => (v === null || photos.length <= 1 ? null : Math.min(v, photos.length - 2)))
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const add = async (files: File[]) => {
    setUploading(true)
    const failed = await uploadOnePhotos(oneId, files)
    setUploading(false)
    if (failed < files.length) toast.success(files.length - failed === 1 ? 'Photo added' : `${files.length - failed} photos added`)
    refresh()
  }
  if (!photos.length && !canAdd) return null
  const images = photos.map((p) => ({ src: photoUrl(p.id), download: `${photoUrl(p.id)}&download=1`, canDelete: p.mine }))

  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold text-ink-600">Photos{photos.length ? ` · ${photos.length}` : ''}</p>
      <div className="grid grid-cols-4 gap-2">
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setView(i)} className={cx('aspect-square overflow-hidden rounded-[12px] bg-cream-100 ring-gold-500 transition hover:ring-2', del.isPending && del.variables === p.id && 'opacity-40')} aria-label={`Open photo ${i + 1}`}>
            <img src={photoUrl(p.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
        {canAdd && photos.length < MAX_PHOTOS && <AddTile busy={uploading} max={MAX_PHOTOS - photos.length} onFiles={add} />}
      </div>
      <Lightbox images={images} index={view} onIndex={setView} onClose={() => setView(null)} onDelete={(i) => del.mutate(photos[i].id)} />
    </div>
  )
}
