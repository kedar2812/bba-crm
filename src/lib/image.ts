/**
 * Center-crop an image to a square, resize to max 600px and encode as WebP
 * (JPEG fallback for browsers that cannot encode WebP). Runs in the browser so
 * the server needs no image library.
 */
export async function squareImage(file: File, size = 600): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('That image could not be read. Try another photo.'))
      i.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const out = Math.min(size, side)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser cannot process images.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out)
    const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q))
    let blob = await toBlob('image/webp', 0.8)
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85)
    if (!blob) throw new Error('That image could not be processed.')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Shrink a photo to fit within `max` px on its longest side (aspect kept) and
 * encode as WebP/JPEG. Phone photos drop from several MB to a few hundred KB.
 */
export async function fitImage(file: File, max = 1600): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('That image could not be read. Try another photo.'))
      i.src = url
    })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * k)
    canvas.height = Math.round(img.naturalHeight * k)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Your browser cannot process images.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q))
    let blob = await toBlob('image/webp', 0.82)
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85)
    if (!blob) throw new Error('That image could not be processed.')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function blobName(blob: Blob) {
  return blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg'
}
