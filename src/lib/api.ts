import { API_BASE } from './config'

export class ApiError extends Error {
  code: string
  status: number
  fields?: Record<string, string>
  constructor(code: string, message: string, status: number, fields?: Record<string, string>) {
    super(message)
    this.code = code
    this.status = status
    this.fields = fields
  }
}

let csrf = ''
export function setCsrf(token: string) {
  csrf = token
}

type Params = Record<string, string | number | boolean | null | undefined>

function buildUrl(path: string, params?: Params) {
  const url = `${API_BASE}/${path}`
  if (!params) return url
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  })
  const s = qs.toString()
  return s ? `${url}?${s}` : url
}

async function refreshCsrf() {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
  const json = await res.json()
  if (json?.data?.csrf) csrf = json.data.csrf
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, params?: Params, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let payload: BodyInit | undefined
  if (method === 'POST') {
    headers['X-CSRF-Token'] = csrf
    if (body instanceof FormData) payload = body
    else {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body ?? {})
    }
  }
  let res: Response
  try {
    res = await fetch(buildUrl(path, params), { method, headers, body: payload, credentials: 'include' })
  } catch {
    throw new ApiError('network', 'No connection. Check your internet and try again.', 0)
  }
  let json: { ok: boolean; data?: T; error?: { code: string; message: string; fields?: Record<string, string> } }
  try {
    json = await res.json()
  } catch {
    throw new ApiError('bad_response', 'The server sent an unexpected response. Please try again.', res.status)
  }
  if (!json.ok) {
    const e = json.error ?? { code: 'unknown', message: 'Something went wrong.' }
    if (e.code === 'csrf' && !retried) {
      await refreshCsrf()
      return request<T>(method, path, body, params, true)
    }
    if (res.status === 401 && !path.startsWith('auth/')) {
      window.dispatchEvent(new CustomEvent('bba:unauthenticated'))
    }
    throw new ApiError(e.code, e.message, res.status, e.fields)
  }
  return json.data as T
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path, undefined, params),
  post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Something went wrong.'
}

export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError && e.fields ? e.fields : {}
}
