// End-to-end API test against the local dev server (needs DEV_SHOW_OTP + MAIL_DRIVER=log and a seeded DB).
//   npm run api   (or PHP 7.3: php -S 127.0.0.1:8080 server/dev-router.php)
//   node tests/api.e2e.mjs
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BASE = process.env.API ?? 'http://127.0.0.1:8080/api'
const OTP_LOG = new URL('../server/api/_private/logs/otp.log', import.meta.url)
let passed = 0
let failed = 0

function check(name, cond, extra) {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : '')
  }
}

class Client {
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

function lastOtp(email, purpose) {
  const lines = readFileSync(OTP_LOG, 'utf8').trim().split('\n').reverse()
  const line = lines.find((l) => l.includes(` ${email} ${purpose} `))
  return line?.trim().split(' ').pop()
}

/** A valid 4x4 PNG so finfo sees image/png. */
function tinyPng() {
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

const stamp = Date.now().toString().slice(-6)

async function main() {
  console.log(`API: ${BASE}\n`)

  // ---------------------------------------------------------------- admin first login
  console.log('Admin bootstrap')
  const admin = new Client()
  let r = await admin.login('admin@bba.test', 'admin12345')
  if (!r.ok) r = await admin.login('admin@bba.test', 'admin-new-12345')
  check('admin can log in', r.ok, r)
  if (r.data?.member?.must_change_password) {
    r = await admin.post('auth/change-password', { current_password: 'admin12345', password: 'admin-new-12345' })
    check('forced password change works', r.ok, r)
  }
  r = await admin.get('auth/me')
  check('admin no longer forced to change password', r.data.member && !r.data.member.must_change_password, r.data)

  // ---------------------------------------------------------------- join flow
  console.log('\nJoin flow')
  const email = `new${stamp}@bba.test`
  const mobile = `7${stamp}123`.slice(0, 10)
  const its = `5${stamp}9`.slice(0, 8).padEnd(8, '1')
  const inviter = new Client()
  await inviter.login('ali@bba.test', 'member12345')
  r = await inviter.post('visitors/create', { name: 'New Applicant', mobile, business: 'Test Co' })
  check('member invites a visitor', r.ok, r)

  const joinPayload = {
    full_name: 'Test Applicant', mobile, email, its_number: its, password: 'applicant123',
    business_name: 'Applicant Traders', category_id: 4, designation: 'Owner', business_description: 'We trade things.',
    address: '1 MG Road', city: 'Pune', offers: ['Spices', 'Dry fruits'], looking_for: ['Retail space'], consent: 1,
  }
  const form = (payload, withPhoto = true, photo = tinyPng(), name = 'photo.png', type = 'image/png') => {
    const fd = new FormData()
    fd.append('data', JSON.stringify(payload))
    if (withPhoto) fd.append('photo', new Blob([photo], { type }), name)
    return fd
  }
  const applicant = new Client()
  await applicant.get('auth/me')
  r = await applicant.post('join/start', form({ ...joinPayload, email: 'ali@bba.test' }))
  check('duplicate email blocked with clear message', !r.ok && r.error.fields?.email?.includes('already registered'), r)
  r = await applicant.post('join/start', form({ ...joinPayload, its_number: '20000001' }))
  check('duplicate ITS blocked', !r.ok && !!r.error.fields?.its_number, r)
  r = await applicant.post('join/start', form(joinPayload, false))
  check('photo is required', !r.ok && !!r.error.fields?.photo, r)
  r = await applicant.post('join/start', form(joinPayload, true, Buffer.from('<?php echo 1; ?>'), 'evil.php', 'image/png'))
  check('.php disguised as image is rejected', !r.ok && r.error.code === 'upload', r)
  r = await applicant.post('join/start', form(joinPayload))
  check('join/start sends OTP', r.ok, r)
  r = await applicant.post('join/resend', { email })
  check('resend blocked by 60s cooldown', !r.ok && r.error.code === 'cooldown', r)
  for (let i = 0; i < 4; i++) r = await applicant.post('join/verify', { email, code: '000000' })
  check('wrong OTP reports attempts left', !r.ok && /1 attempt left/.test(r.error.message), r)
  r = await applicant.post('join/verify', { email, code: '000000' })
  check('5th wrong OTP kills the code', !r.ok && r.error.code === 'otp_dead', r)
  r = await applicant.post('join/verify', { email, code: lastOtp(email, 'join') })
  check('correct code no longer works after being killed', !r.ok, r)

  // Fresh code (bypass cooldown by waiting is slow — restart the application instead)
  await new Promise((res) => setTimeout(res, 61_000))
  r = await applicant.post('join/resend', { email })
  check('resend works after cooldown', r.ok, r)
  r = await applicant.post('join/verify', { email, code: lastOtp(email, 'join') })
  check('join/verify creates pending application', r.ok, r)
  r = await applicant.login(email, 'applicant123')
  check('pending applicant sees review message', !r.ok && r.error.code === 'pending_review', r)

  r = await admin.get('admin/applications')
  const app = r.data.pending.find((a) => a.email === email)
  check('application appears in admin queue', !!app, r.data.pending.map((a) => a.email))
  check('visitor link shows on application', app?.visitor_link?.inviter === 'Ali Lokhandwala', app?.visitor_link)
  r = await admin.post('admin/applications/decide', { id: app.id, action: 'approve', note: 'Welcome!' })
  check('admin approves application', r.ok, r)
  r = await applicant.login(email, 'applicant123')
  check('approved member can log in (by email)', r.ok, r)
  const a2 = new Client()
  r = await a2.login(mobile, 'applicant123')
  check('approved member can log in (by mobile)', r.ok, r)
  r = await inviter.get('visitors')
  check('visitor who joined is credited to inviter', r.data.items.some((v) => v.mobile === mobile && v.status === 'joined'), r.data.items.filter((v) => v.mobile === mobile))

  // ---------------------------------------------------------------- referrals
  console.log('\nReferrals & business (one row per deal)')
  const A = inviter // Ali
  const B = new Client()
  await B.login('fatema@bba.test', 'member12345')
  const C = new Client()
  await C.login('hussain@bba.test', 'member12345')
  const meB = (await B.get('auth/me')).data.member
  const meA = (await A.get('auth/me')).data.member
  const before = (await admin.get('admin/overview', { period: 'all', from: '2000-01-01', to: '2999-12-31' })).data.stats
  const dashABefore = (await A.get('dashboard', { period: 'all' })).data.cards
  const dashBBefore = (await B.get('dashboard', { period: 'all' })).data.cards

  r = await A.post('referrals/create', { receiver_id: meA.id, client_name: 'X', requirement: 'Y', estimated_value: 1000 })
  check('self-referral blocked', !r.ok, r)
  r = await A.post('referrals/create', { receiver_id: meB.id, client_name: 'E2E Client', requirement: 'Office fit-out', estimated_value: '5,00,000' })
  check('A gives B a referral', r.ok, r)
  const code = r.data.code
  let notes = (await B.get('notifications')).data
  check('B is notified', notes.some((n) => n.link === `/app/referrals/${code}`), notes.slice(0, 2))
  r = await A.post('referrals/status', { code, status: 'won', final_value: 100 })
  check('giver cannot change status (403)', r.status === 403, r)
  r = await C.get('referrals/view', { code })
  check('unrelated member cannot view (403)', r.status === 403, r)
  r = await C.post('referrals/note', { code, body: 'hi' })
  check('unrelated member cannot add notes', r.status === 403, r)
  r = await B.post('referrals/status', { code, status: 'contacted' })
  check('receiver moves to Contacted', r.ok, r)
  r = await B.post('referrals/status', { code, status: 'won' })
  check('Won requires final value', !r.ok && !!r.error.fields?.final_value, r)
  r = await B.post('referrals/status', { code, status: 'won', final_value: 450000, thank_you_note: 'Thanks Ali!' })
  check('receiver marks Won with value', r.ok, r)
  const after = (await admin.get('admin/overview', { from: '2000-01-01', to: '2999-12-31' })).data.stats
  check('association business increases ONCE (+4,50,000)', Math.round(after.business_closed - before.business_closed) === 450000, [before.business_closed, after.business_closed])
  const dashA = (await A.get('dashboard', { period: 'all' })).data.cards
  const dashB = (await B.get('dashboard', { period: 'all' })).data.cards
  check("A's business given +4,50,000", Math.round(dashA.business_given - dashABefore.business_given) === 450000, [dashABefore.business_given, dashA.business_given])
  check("B's business received +4,50,000", Math.round(dashB.business_received - dashBBefore.business_received) === 450000, [dashBBefore.business_received, dashB.business_received])

  r = await B.post('referrals/direct', { giver_id: meA.id, value: 25000, requirement: 'Catering' })
  check('thank-you note (direct business) saved', r.ok, r)
  const after2 = (await admin.get('admin/overview', { from: '2000-01-01', to: '2999-12-31' })).data.stats
  check('direct business counts once (+25,000)', Math.round(after2.business_closed - after.business_closed) === 25000, [after.business_closed, after2.business_closed])
  notes = (await A.get('notifications')).data
  check('giver notified of thank-you', notes.some((n) => n.title.includes('thanked you for ₹25,000')), notes.slice(0, 3).map((n) => n.title))

  r = await A.post('referrals/dispute', { code: r.data.code, reason: 'Never happened' })
  check('counterparty can dispute', r.ok, r)
  const after3 = (await admin.get('admin/overview', { from: '2000-01-01', to: '2999-12-31' })).data.stats
  check('disputed record leaves totals', Math.round(after2.business_closed - after3.business_closed) === 25000, [after2.business_closed, after3.business_closed])
  const disputed = (await admin.get('admin/records', { type: 'referrals', disputed: 1 })).data.items
  const drow = disputed.find((x) => x.requirement === 'Catering' && x.giver.id === meA.id)
  check('admin sees dispute', !!drow, disputed.length)
  r = await admin.post('admin/records/resolve-dispute', { id: drow.id, action: 'keep' })
  check('admin resolves (keep)', r.ok, r)
  const after4 = (await admin.get('admin/overview', { from: '2000-01-01', to: '2999-12-31' })).data.stats
  check('kept record counts again', Math.round(after4.business_closed - after3.business_closed) === 25000, [after3.business_closed, after4.business_closed])

  // follow-up — one notification only
  r = await A.post('referrals/followup', { code, due_date: new Date().toISOString().slice(0, 10) })
  check('follow-up set', r.ok, r)
  // Reset the daily flag by asking twice; it should still be created at most once per day.
  await A.get('notifications/unread-count')
  await A.get('notifications/unread-count')
  notes = (await A.get('notifications')).data.filter((n) => n.type === 'followup' && n.link === `/app/referrals/${code}`)
  check('follow-up reminder created at most once', notes.length <= 1, notes.length)

  // ---------------------------------------------------------------- 121s
  console.log('\n121s (count only after confirmation)')
  const o0 = (await admin.get('admin/overview', { from: '2000-01-01', to: '2999-12-31' })).data.stats.ones_done
  const aOnes0 = (await A.get('dashboard', { period: 'all' })).data.cards.ones_done
  const bOnes0 = (await B.get('dashboard', { period: 'all' })).data.cards.ones_done
  const past = new Date(Date.now() - 3 * 3600_000)
  const pad = (n) => String(n).padStart(2, '0')
  const at = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:00`
  r = await A.post('121s/log', { partner_id: meB.id, meeting_at: at, mode: 'in_person', business_discussed: 'Leads' })
  check('A logs a 121', r.ok, r)
  const oneId = r.data.id
  const o1 = (await admin.get('admin/overview', { from: '2000-01-01', to: '2999-12-31' })).data.stats.ones_done
  check('unconfirmed 121 does not count', o1 === o0, [o0, o1])
  r = await A.post('121s/confirm', { id: oneId, action: 'confirm' })
  check('logger cannot confirm own 121', r.status === 403, r)
  r = await B.post('121s/confirm', { id: oneId, action: 'confirm', notes: 'Great chat' })
  check('B confirms', r.ok, r)
  const o2 = (await admin.get('admin/overview', { from: '2000-01-01', to: '2999-12-31' })).data.stats.ones_done
  check('association 121s +1 (not +2)', o2 - o0 === 1, [o0, o2])
  check('counts for A', (await A.get('dashboard', { period: 'all' })).data.cards.ones_done - aOnes0 === 1)
  check('counts for B', (await B.get('dashboard', { period: 'all' })).data.cards.ones_done - bOnes0 === 1)
  const fut = new Date(Date.now() + 2 * 86400_000)
  r = await A.post('121s/request', { partner_id: meB.id, meeting_at: `${fut.getFullYear()}-${pad(fut.getMonth() + 1)}-${pad(fut.getDate())}T11:00`, mode: 'online' })
  check('A requests a future 121', r.ok, r)
  const reqId = r.data.id
  r = await A.post('121s/respond', { id: reqId, action: 'accept' })
  check('requester cannot accept own request', r.status === 403, r)
  r = await B.post('121s/respond', { id: reqId, action: 'accept' })
  check('B accepts', r.ok, r)

  // ---------------------------------------------------------------- 121 photos
  console.log('\n121 photos (private to the two members + admins)')
  const photoForm = (id, blob = new Blob([tinyPng()], { type: 'image/png' }), name = 'p.png') => {
    const fd = new FormData()
    fd.append('id', String(id))
    fd.append('file', blob, name)
    return fd
  }
  const fileGet = (c, params) => fetch(`${BASE}/files/121-photo?${new URLSearchParams(params)}`, { headers: { cookie: c.cookieHeader() } })
  r = await A.post('121s/photos', photoForm(oneId))
  check('A adds a photo to the 121', r.ok && r.data.id > 0, r)
  const photoId = r.data.id
  r = await C.post('121s/photos', photoForm(oneId))
  check('unrelated member cannot add a photo (403)', r.status === 403, r)
  r = await A.post('121s/photos', photoForm(oneId, new Blob(['not an image'], { type: 'image/png' }), 'x.png'))
  check('non-image upload rejected (422)', r.status === 422, r)
  const onesA = (await A.get('121s')).data.items.find((o) => o.id === oneId)
  const onesB = (await B.get('121s')).data.items.find((o) => o.id === oneId)
  check('uploader sees the photo as theirs', onesA.photos.length === 1 && onesA.photos[0].mine === true, onesA.photos)
  check('other member sees the photo (not theirs)', onesB.photos.length === 1 && onesB.photos[0].mine === false, onesB.photos)
  let fr = await fileGet(B, { id: photoId })
  check('other member can view the photo', fr.status === 200 && fr.headers.get('content-type') === 'image/png' && fr.headers.get('content-disposition').startsWith('inline'), fr.status)
  fr = await fileGet(B, { id: photoId, download: 1 })
  check('download=1 serves it as an attachment', fr.status === 200 && fr.headers.get('content-disposition').startsWith('attachment'), fr.headers.get('content-disposition'))
  check('unrelated member cannot view (403)', (await fileGet(C, { id: photoId })).status === 403)
  check('anonymous cannot view (401)', (await fileGet(new Client(), { id: photoId })).status === 401)
  check('admin can view', (await fileGet(admin, { id: photoId })).status === 200)
  r = await B.post('121s/photos/delete', { id: photoId })
  check("member cannot delete someone else's photo (403)", r.status === 403, r)
  r = await A.post('121s/photos/delete', { id: photoId })
  check('uploader deletes the photo', r.ok, r)
  check('deleted photo is gone', (await fileGet(A, { id: photoId })).status === 404 && (await A.get('121s')).data.items.find((o) => o.id === oneId).photos.length === 0)

  // ---------------------------------------------------------------- ranges
  console.log('\nDashboard ranges')
  const now = new Date()
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = iso(now)
  r = await A.post('referrals/create', { receiver_id: meB.id, client_name: 'No Value Co', requirement: 'Flooring' })
  check('referral without an estimated value is accepted', r.ok, r)
  check('…and stored without a value', (await A.get('referrals/view', { code: r.data.code })).data.estimated_value === null)
  r = await A.get('dashboard', { period: 'custom', from: today, to: today })
  check('custom single day: daily chart, one bar', r.ok && r.data.chart_grain === 'day' && r.data.chart.length === 1 && r.data.from === today, r.data && [r.data.chart_grain, r.data.chart.length, r.data.from])
  check('custom range counts today’s referrals', r.data.cards.referrals_given >= 1 && r.data.chart[0].given === r.data.cards.referrals_given, [r.data.cards.referrals_given, r.data.chart])
  check('custom range is compared with the day before', r.data.prev !== null)
  check('dashboard carries next_meeting', 'next_meeting' in r.data)
  const monthAgo = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29))
  r = await A.get('dashboard', { period: 'custom', from: today, to: monthAgo })
  check('reversed custom range is swapped', r.data.from === monthAgo && r.data.to === today, [r.data.from, r.data.to])
  check('30-day range charts by week', r.data.chart_grain === 'week', r.data.chart_grain)
  check('weekly chart adds up to the card', r.data.chart.reduce((s, x) => s + x.given, 0) === r.data.cards.referrals_given, [r.data.chart, r.data.cards.referrals_given])
  r = await A.get('dashboard', { period: 'custom', from: 'nonsense', to: today })
  check('bad custom range falls back to this month', r.ok && r.data.from === iso(new Date(now.getFullYear(), now.getMonth(), 1)), r.data?.from)
  r = await A.get('dashboard', { period: 'this_year' })
  check('this year charts by month up to now', r.data.chart_grain === 'month' && r.data.chart.length === now.getMonth() + 1, [r.data.chart_grain, r.data.chart.length])
  check('monthly chart adds up to the cards', r.data.chart.reduce((s, x) => s + x.received, 0) === r.data.cards.referrals_received && Math.round(r.data.chart.reduce((s, x) => s + x.biz_given, 0)) === Math.round(r.data.cards.business_given), [r.data.cards])
  r = await A.get('dashboard', { period: 'all' })
  check('all time starts the chart at the first record', r.ok && r.data.chart.length > 0 && r.data.chart.length <= 40, r.data?.chart.length)
  // Business Closed: received and generated-for-others never mix, and follow the period
  const closedR = (await B.get('referrals', { box: 'closed', side: 'received', period: 'all' })).data
  const closedG = (await B.get('referrals', { box: 'closed', side: 'given', period: 'all' })).data
  check('"You received" lists only business B received', closedR.items.length > 0 && closedR.items.every((x) => x.receiver.id === meB.id), closedR.items.map((x) => x.receiver.id))
  check('"Generated for others" lists only business B generated', closedG.items.every((x) => x.giver.id === meB.id), closedG.items.map((x) => x.giver.id))
  const dashAll = (await B.get('dashboard', { period: 'all' })).data.cards
  check('Business Closed totals match the dashboard cards', Math.round(closedR.totals.received) === Math.round(dashAll.business_received) && Math.round(closedR.totals.given) === Math.round(dashAll.business_given), [closedR.totals, dashAll])
  const closedDay = (await B.get('referrals', { box: 'closed', side: 'received', period: 'custom', from: today, to: today })).data
  const dashDay = (await B.get('dashboard', { period: 'custom', from: today, to: today })).data.cards
  check('Business Closed follows a custom range', closedDay.label && closedDay.items.every((x) => x.won_date === today) && Math.round(closedDay.totals.received) === Math.round(dashDay.business_received), [closedDay.label, closedDay.totals, dashDay.business_received])
  // Admin → member page: received and generated are separate lists, and follow the admin's period
  const av = (await admin.get('admin/members/view', { id: meB.id, from: '2000-01-01', to: '2999-12-31' })).data
  check('admin member page: "received" lists only business they received', av.business_received.length > 0 && av.business_received.every((x) => x.receiver.id === meB.id && x.status === 'won'), av.business_received.length)
  check('admin member page: "generated" lists only business they generated', av.business_generated.every((x) => x.giver.id === meB.id && x.status === 'won'), av.business_generated.length)
  check('admin member page: totals match the member dashboard', Math.round(av.stats.business_received) === Math.round(dashAll.business_received) && Math.round(av.stats.business_given) === Math.round(dashAll.business_given), [av.stats, dashAll])
  const avDay = (await admin.get('admin/members/view', { id: meB.id, from: today, to: today })).data
  check('admin member page follows a custom range', avDay.from === today && avDay.business_received.every((x) => x.won_date === today) && Math.round(avDay.stats.business_received) === Math.round(dashDay.business_received), [avDay.from, avDay.stats.business_received, dashDay.business_received])
  const legacy = (await B.get('referrals', { box: 'closed' })).data
  check('Business Closed without a side still lists both (older app)', legacy.items.length >= closedR.items.length, legacy.total)

  r = await admin.get('admin/overview', { from: monthAgo, to: today })
  check('admin trend follows the range', r.data.trend_grain === 'week' && r.data.trend.reduce((s, x) => s + x.referrals, 0) === r.data.stats.referrals_given, [r.data.trend_grain, r.data.stats.referrals_given])

  // ---------------------------------------------------------------- other screens
  console.log('\nOther endpoints')
  for (const [c, p, params] of [
    [A, 'members', {}], [A, 'members', { match: 1 }], [A, 'members/picker', {}], [A, 'members/view', { id: meB.id }], [A, 'meetings', {}],
    [A, 'referrals', { box: 'closed' }], [A, '121s', {}], [A, 'dashboard', { period: 'last_month' }], [A, 'dashboard', { period: 'this_quarter' }],
    [admin, 'admin/members', {}], [admin, 'admin/members/view', { id: meA.id }], [admin, 'admin/records', { type: '121s' }], [admin, 'admin/records', { type: 'visitors' }],
    [admin, 'admin/records', { type: 'testimonials' }], [admin, 'admin/meetings', {}], [admin, 'admin/reports', { kind: 'members' }], [admin, 'admin/reports', { kind: 'categories' }],
    [admin, 'admin/reports', { kind: 'summary' }], [admin, 'admin/reports', { kind: 'raw', from: '2000-01-01', to: '2999-12-31' }], [admin, 'admin/settings', {}], [admin, 'admin/audit', {}],
    [new Client(), 'public/stats', {}], [new Client(), 'public/content', {}],
  ]) {
    r = await c.get(p, params)
    check(`GET ${p} ${new URLSearchParams(params)}`, r.ok, r.error)
  }
  r = await A.get('admin/overview')
  check('member blocked from admin API (403)', r.status === 403, r)
  r = await new Client().get('dashboard')
  check('anonymous blocked (401)', r.status === 401, r)
  r = await fetch(`${BASE}/referrals/create`, { method: 'POST', headers: { cookie: A.cookieHeader(), 'Content-Type': 'application/json' }, body: '{}' })
  check('POST without CSRF token rejected (419)', r.status === 419)

  // Attendance
  const meetings = (await admin.get('admin/meetings')).data
  const m0 = meetings[meetings.length - 1]
  r = await admin.post('admin/attendance/save', { meeting_id: m0.id, members: { [meA.id]: 'present', [meB.id]: 'absent' }, visitors: {} })
  check('admin saves attendance', r.ok, r)
  const att = (await A.get('meetings')).data
  check('attendance % is a number', typeof att.attendance_all === 'number', att.attendance_all)
  // S = sent a substitute: counts as attended. An old client sending "excused" is stored as substitute.
  const meetingB = (await B.get('meetings')).data
  const allB = meetingB.attendance_all
  r = await admin.post('admin/attendance/save', { meeting_id: m0.id, members: { [meA.id]: 'substitute', [meB.id]: 'excused' }, visitors: {} })
  check('admin marks S (substitute)', r.ok, r)
  const mA = [...(await A.get('meetings')).data.past, ...(await A.get('meetings')).data.upcoming].find((x) => x.id === m0.id)
  const mB = [...(await B.get('meetings')).data.past, ...(await B.get('meetings')).data.upcoming].find((x) => x.id === m0.id)
  check('member sees S as "substitute"', mA?.my_status === 'substitute', mA)
  check('legacy "excused" is saved as substitute', mB?.my_status === 'substitute', mB)
  check('a substitute counts as attended (not absent)', (await B.get('meetings')).data.attendance_all >= allB, [allB, (await B.get('meetings')).data.attendance_all])
  r = await admin.post('admin/attendance/save', { meeting_id: m0.id, members: { [meA.id]: 'late' }, visitors: {} })
  check('unknown attendance marks are ignored', r.ok && [...(await A.get('meetings')).data.past, ...(await A.get('meetings')).data.upcoming].find((x) => x.id === m0.id)?.my_status === 'substitute')
  const sheet = (await admin.get('admin/attendance', { meeting_id: m0.id })).data.members
  check('admin accounts are not on the attendance sheet', !sheet.some((x) => x.full_name === 'Kedar Admin'), sheet.length)

  // Testimonial + settings
  r = await A.post('testimonials/save', { subject_id: meB.id, body: 'Wonderful to work with, very reliable.' })
  check('testimonial saved', r.ok, r)
  r = await A.post('testimonials/save', { subject_id: meA.id, body: 'Self praise is no praise.' })
  check('self-testimonial blocked', !r.ok, r)

  // ---------------------------------------------------------------- password reset + sessions
  console.log('\nPassword reset & sessions')
  const other = new Client()
  await other.login('hussain@bba.test', 'member12345')
  const fp = new Client()
  await fp.get('auth/me')
  r = await fp.post('auth/forgot', { email: 'nobody@nowhere.test' })
  check('forgot does not reveal unknown emails', r.ok, r)
  r = await fp.post('auth/forgot', { email: 'hussain@bba.test' })
  const rc = lastOtp('hussain@bba.test', 'reset')
  r = await fp.post('auth/reset', { email: 'hussain@bba.test', code: rc, password: 'hussain-new-123' })
  check('reset with OTP works', r.ok, r)
  r = await other.get('dashboard')
  check('other sessions are logged out after reset', r.status === 401, r.status)
  r = await new Client().login('hussain@bba.test', 'hussain-new-123')
  check('login with new password', r.ok, r)

  // Lockout
  const lock = new Client()
  await lock.get('auth/me')
  for (let i = 0; i < 5; i++) r = await lock.post('auth/login', { identifier: 'zainab@bba.test', password: 'wrong' })
  check('5 failed logins → lockout', r.status === 429, r)
  r = await lock.post('auth/login', { identifier: 'zainab@bba.test', password: 'member12345' })
  check('locked even with right password', r.status === 429, r)

  // Deactivation
  r = await admin.post('admin/members/status', { id: meB.id, status: 'deactivated' })
  check('admin deactivates B', r.ok, r)
  r = await B.get('dashboard')
  check('deactivated member session ends', r.status === 401)
  r = await new Client().login('fatema@bba.test', 'member12345')
  check('deactivated login shows inactive message', r.error?.code === 'deactivated', r)
  r = await A.get('members/picker')
  check('deactivated member hidden from pickers', !r.data.some((m) => m.id === meB.id))
  r = await admin.post('admin/members/status', { id: meB.id, status: 'approved' })
  check('admin reactivates B', r.ok, r)

  // ---------------------------------------------------------------- invite links
  console.log('\nInvite links')
  const invEmail = `invitee${stamp}@bba.test`
  r = await A.post('admin/invites/create', { full_name: 'Invited Person', email: invEmail, role: 'member' })
  check('members cannot send invites', r.status === 403, r)
  r = await admin.post('admin/invites/create', { full_name: 'Dup', email: 'ali@bba.test' })
  check('cannot invite an existing member', !r.ok && !!r.error.fields?.email, r)
  r = await admin.post('admin/invites/create', { full_name: 'Invited Person', email: invEmail, mobile: '', role: 'admin' })
  check('admin creates an invite and gets a link', r.ok && /\/invite\/[a-f0-9]{48}$/.test(r.data.link) && r.data.sent === true, r)
  const firstToken = r.data?.link.split('/').pop()
  const inviteId = r.data?.id
  r = await admin.get('admin/invites')
  check('invite listed as pending', r.ok && r.data.some((i) => i.id === inviteId && i.state === 'pending'), r)
  r = await admin.post('admin/invites/resend', { id: inviteId })
  check('resend issues a new link', r.ok && !r.data.link.endsWith(firstToken), r)
  const token = r.data?.link.split('/').pop()
  const invitee = new Client()
  await invitee.get('auth/me')
  r = await invitee.get('invite/view', { token: firstToken })
  check('old link stops working after resend', r.status === 404, r)
  r = await invitee.get('invite/view', { token })
  check('invite/view returns the invite', r.ok && r.data.email === invEmail && r.data.role === 'admin', r)
  r = await invitee.post('invite/accept', form({ token, full_name: 'Invited Person', mobile: `6${stamp}321`.slice(0, 10), password: 'short' }, false))
  check('admin invite still checks the password', !r.ok && !!r.error.fields?.password, r)
  // An admin account needs sign-in details only: no photo, ITS number or business profile.
  r = await invitee.post('invite/accept', form({ token, full_name: 'Invited Person', email: 'someone-else@bba.test', mobile: `6${stamp}321`.slice(0, 10), password: 'admin-pass-123' }, false))
  check('admin invite needs no photo or business profile', r.ok && r.data.member.email === invEmail && r.data.member.role === 'admin' && r.data.member.business_name === '', r)
  const newAdminId = r.data?.member.id
  r = await invitee.get('admin/overview')
  check('invited admin can open the admin area', r.ok, r)
  r = await new Client().get('invite/view', { token })
  check('an invite works only once', r.status === 409, r)

  console.log('\nAdmin accounts administer only')
  for (const [m, path, body] of [['get', 'dashboard'], ['get', 'members'], ['get', 'members/picker'], ['get', 'referrals'], ['get', '121s'], ['get', 'meetings'], ['post', 'referrals/create', { receiver_id: meB.id, client_name: 'X', requirement: 'Y' }], ['post', '121s/log', { partner_id: meB.id, meeting_at: at }], ['post', 'profile/update', {}]]) {
    r = await invitee[m](path, body)
    check(`admin is kept out of member ${m.toUpperCase()} ${path}`, r.status === 403 && r.error.code === 'admin_only', r)
  }
  check('admin still gets notifications', (await invitee.get('notifications')).ok)
  check('admin still opens the auth/me session', (await invitee.get('auth/me')).data.member?.role === 'admin')
  r = await A.get('members/view', { id: newAdminId })
  check('members cannot open an admin as a profile (404)', r.status === 404, r)
  check('admins are left out of the directory', !(await A.get('members', { q: 'Invited Person' })).data.items?.some((x) => x.id === newAdminId))
  check('admins are left out of the member picker', !(await A.get('members/picker')).data.some((x) => x.id === newAdminId))
  r = await A.post('referrals/create', { receiver_id: newAdminId, client_name: 'X', requirement: 'Y' })
  check('a referral cannot be given to an admin', !r.ok && !!r.error.fields?.receiver_id, r)
  r = await admin.post('admin/members/role', { id: newAdminId, role: 'member' })
  check('an admin without a member profile cannot be turned into a member', r.status === 403, r)

  const memEmail = `invmem${stamp}@bba.test`
  r = await admin.post('admin/invites/create', { full_name: 'Invited Member', email: memEmail, role: 'member' })
  const memToken = r.data?.link.split('/').pop()
  const memInvitee = new Client()
  await memInvitee.get('auth/me')
  const memPayload = { ...joinPayload, token: memToken, full_name: 'Invited Member', mobile: `7${stamp}321`.slice(0, 10), its_number: `7${stamp}7`.slice(0, 8).padEnd(8, '2') }
  r = await memInvitee.post('invite/accept', form(memPayload, false))
  check('member invite requires a photo', !r.ok && !!r.error.fields?.photo, r)
  r = await memInvitee.post('invite/accept', form(memPayload))
  check('member invite creates an approved member and logs in', r.ok && r.data.member.email === memEmail && r.data.member.role === 'member', r)
  check('invited member can use the member app', (await memInvitee.get('dashboard')).ok)
  r = await admin.post('admin/invites/create', { full_name: 'Withdrawn', email: `w${stamp}@bba.test` })
  const wToken = r.data?.link.split('/').pop()
  r = await admin.post('admin/invites/revoke', { id: r.data?.id })
  check('admin can withdraw an invite', r.ok, r)
  r = await new Client().get('invite/view', { token: wToken })
  check('withdrawn invite is refused', r.status === 410 && r.error.code === 'invite_revoked', r)
  r = await new Client().get('invite/view', { token: 'nope' })
  check('malformed token is refused', r.status === 404, r)

  // ---------------------------------------------------------------- instagram
  console.log('\nInstagram')
  r = await admin.post('admin/settings/save', { ...(await admin.get('admin/settings')).data.settings, instagram_feed_url: 'https://evil.example/feed' })
  check('only Behold feed URLs are accepted', !r.ok && !!r.error.fields?.instagram_feed_url, r)
  r = await admin.post('admin/settings/save', { ...(await admin.get('admin/settings')).data.settings, instagram_handle: '@bba.test_account', instagram_feed_url: '' })
  check('instagram handle saves (@ stripped)', r.ok, r)
  r = await new Client().get('public/content')
  check('public content exposes the handle', r.data?.instagram_handle === 'bba.test_account', r.data)
  r = await new Client().get('public/instagram')
  check('public/instagram works without a feed', r.ok && r.data.username === 'bba.test_account' && Array.isArray(r.data.posts), r)

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
