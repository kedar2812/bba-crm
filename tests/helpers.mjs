// Shared helpers for the end-to-end API tests.
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

export const BASE = process.env.API ?? 'http://127.0.0.1:8080/api'
const OTP_LOG = new URL('../server/api/_private/logs/otp.log', import.meta.url)
let passed = 0
let failed = 0

export function check(name, cond, extra) {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : '')
  }
}

export class Client {
  constructor() {
    this.cookies = {}
    this.csrf = ''
  }
  cookieHeader() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  }
  store(res) {
    const set = res.headers.getSetCookie?.() ?? []
    set.forEach((c) => {
      const [pair] = c.split(';')
      const [k, v] = pair.split('=')
      if (v === 'deleted' || v === '') delete this.cookies[k]
      else this.cookies[k] = v
    })
  }
  async get(path, params = {}) {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`${BASE}/${path}${qs ? `?${qs}` : ''}`, { headers: { cookie: this.cookieHeader() } })
    this.store(res)
    const j = await res.json()
    if (path === 'auth/me' && j.data?.csrf) this.csrf = j.data.csrf
    return { status: res.status, ...j }
  }
  async post(path, body = {}) {
    const isForm = body instanceof FormData
    const res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { cookie: this.cookieHeader(), 'X-CSRF-Token': this.csrf, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
      body: isForm ? body : JSON.stringify(body),
    })
    this.store(res)
    const j = await res.json()
    if (j.data?.csrf) this.csrf = j.data.csrf
    return { status: res.status, ...j }
  }
  async login(identifier, password) {
    await this.get('auth/me')
    return this.post('auth/login', { identifier, password, remember: true })
  }
}

export function lastOtp(email, purpose) {
  const lines = readFileSync(OTP_LOG, 'utf8').trim().split('\n').reverse()
  const line = lines.find((l) => l.includes(` ${email} ${purpose} `))
  return line?.trim().split(' ').pop()
}

/** A valid 4x4 PNG so finfo sees image/png. */
export function tinyPng() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(4, 0)
  ihdr.writeUInt32BE(4, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.alloc(4 * (1 + 4 * 3), 0xe0)
  for (let r = 0; r < 4; r++) raw[r * 13] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

export function finish() {
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
