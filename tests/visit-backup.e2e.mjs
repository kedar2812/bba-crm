// End-to-end tests for the visitor form (public page + Admin → Visitor form) and for
// Admin → Backup (export, chunked upload, inspect, restore, safety copies).
// Run after tests/api.e2e.mjs against the same freshly seeded local server: npm run test:e2e
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'
import { BASE, Client, check, finish, tinyPng } from './helpers.mjs'

const MAIL_LOG = new URL('../server/api/_private/logs/mail.log', import.meta.url)
const UPLOADS = new URL('../server/uploads/', import.meta.url)
const PRIV_UPLOADS = new URL('../server/api/_private/uploads/', import.meta.url)

/* ------------------------------ helpers ----------------------------- */

async function download(c, path, params = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}/${path}${qs ? `?${qs}` : ''}`, { headers: { cookie: c.cookieHeader() } })
  return { status: res.status, type: res.headers.get('content-type') ?? '', disposition: res.headers.get('content-disposition') ?? '', buf: Buffer.from(await res.arrayBuffer()) }
}

/** Read a ZIP into Map<name, Buffer> (central directory, store + deflate). */
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const n = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map()
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nlen = buf.readUInt16LE(p + 28)
    const skip = nlen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
    const lho = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8')
    p += 46 + skip
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28)
    const data = buf.subarray(start, start + csize)
    out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data))
  }
  return out
}

/** Build a ZIP from [name, Buffer] pairs, all deflated (like a zip tool re-packing a folder). */
function zip(entries) {
  const parts = []
  const central = []
  let off = 0
  for (const [name, data] of entries) {
    const nb = Buffer.from(name)
    const body = deflateRawSync(data)
    const c = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6)
    lh.writeUInt16LE(8, 8)
    lh.writeUInt32LE(c, 14)
    lh.writeUInt32LE(body.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nb.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(8, 10)
    ch.writeUInt32LE(c, 16)
    ch.writeUInt32LE(body.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nb.length, 28)
    ch.writeUInt32LE(off, 42)
    parts.push(lh, nb, body)
    central.push(ch, nb)
    off += 30 + nb.length + body.length
  }
  const cd = Buffer.concat(central)
  const e = Buffer.alloc(22)
  e.writeUInt32LE(0x06054b50, 0)
  e.writeUInt16LE(entries.length, 8)
  e.writeUInt16LE(entries.length, 10)
  e.writeUInt32LE(cd.length, 12)
  e.writeUInt32LE(off, 16)
  return Buffer.concat([...parts, cd, e])
}

/** Re-pack a backup after editing it: fn gets Map<name, Buffer> and may change it. */
function repack(buf, fn, prefix = '') {
  const m = unzip(buf)
  fn(m)
  return zip([...m].map(([k, v]) => [prefix + k, v]))
}
const json = (b) => JSON.parse(b.toString('utf8'))
const buf = (o) => Buffer.from(JSON.stringify(o))

async function upload(c, data, chunk = 65536) {
  let id = ''
  let off = 0
  while (off < data.length) {
    const fd = new FormData()
    if (id) fd.append('id', id)
    fd.append('offset', String(off))
    fd.append('chunk', new Blob([data.subarray(off, off + chunk)]), 'chunk.bin')
    const r = await c.post('admin/backup/upload', fd)
    if (!r.ok) return r
    id = r.data.id
    off = r.data.size
  }
  return { ok: true, data: { id, size: off } }
}

async function inspectBuf(c, data) {
  const u = await upload(c, data)
  if (!u.ok) return u
  return c.post('admin/backup/inspect', { id: u.data.id })
}

function visitForm(payload, files = {}) {
  const fd = new FormData()
  fd.append('data', JSON.stringify(payload))
  Object.entries(files).forEach(([k, [bytes, name, type]]) => fd.append(`file_${k}`, new Blob([bytes], { type }), name))
  return fd
}

async function publicPost(path, body) {
  const res = await fetch(`${BASE}/${path}`, { method: 'POST', body, headers: { Origin: 'http://localhost:4173' } })
  return { status: res.status, cors: res.headers.get('access-control-allow-origin'), cookie: res.headers.get('set-cookie'), ...(await res.json()) }
}

const stamp = Date.now().toString().slice(-6)

async function main() {
  console.log(`API: ${BASE}\n`)
  const admin = new Client()
  let r = await admin.login('admin@bba.test', 'admin-new-12345')
  if (!r.ok) r = await admin.login('admin@bba.test', 'admin12345')
  check('admin logs in', r.ok, r)
  const member = new Client()
  check('member logs in', (await member.login('ali@bba.test', 'member12345')).ok)
  const anon = new Client()

  // ------------------------------------------------------------ visitor form: public
  console.log('\nVisitor form: public page')
  r = await anon.get('public/visit-form')
  check('form is public and open by default', r.ok && r.data.enabled === true, r)
  check('default form asks for name and mobile', r.data.fields.some((f) => f.id === 'name' && f.required) && r.data.fields.some((f) => f.id === 'mobile' && f.type === 'phone'), r.data.fields)
  check('alert emails are not exposed publicly', !('notify_emails' in r.data) && !JSON.stringify(r.data).includes('notify'), Object.keys(r.data))
  r = await anon.get('public/content')
  check('landing page knows the form is open', r.data.visit_open === true, r.data)

  // A meeting to register for
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  r = await admin.post('admin/meetings/save', { title: `Visitor test meeting ${stamp}`, meeting_date: nextWeek, start_time: '08:00', venue: 'Test Hall' })
  check('admin schedules a meeting', r.ok, r)
  const meetingId = r.data.id
  r = await anon.get('public/visit-form')
  check('upcoming meetings are offered', r.data.meetings.some((m) => m.id === meetingId), r.data.meetings)

  const mobile = `9${stamp}111`.slice(0, 10)
  const good = { name: 'Visiting Person', mobile: `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`, email: 'Visitor@Example.com', business: 'Visitor Traders', category: 'Spices', city: 'Pune', meeting_id: meetingId }
  r = await publicPost('public/visit', visitForm({ ...good, name: '' }))
  check('name is required', r.status === 422 && !!r.error.fields?.name, r)
  r = await publicPost('public/visit', visitForm({ ...good, mobile: '12345' }))
  check('invalid mobile is refused', r.status === 422 && !!r.error.fields?.mobile, r)
  r = await publicPost('public/visit', visitForm({ ...good, email: 'not-an-email' }))
  check('invalid email is refused', r.status === 422 && !!r.error.fields?.email, r)
  r = await publicPost('public/visit', visitForm({ ...good, meeting_id: 999999 }))
  check('a meeting that is not upcoming is refused', r.status === 422 && !!r.error.fields?.meeting_id, r)
  r = await publicPost('public/visit', visitForm(good, { payment_proof: [Buffer.from('<?php echo 1; ?>'), 'pay.png', 'image/png'] }))
  check('a disguised script is refused as the payment screenshot', r.status === 422 && r.error.code === 'upload', r)
  r = await publicPost('public/visit', visitForm({ ...good, website: 'http://spam.example' }))
  check('honeypot submissions are swallowed', r.ok && r.data.code === null, r)
  r = await publicPost('public/visit', visitForm(good, { payment_proof: [tinyPng(), 'pay.png', 'image/png'] }))
  check('a complete registration is accepted', r.ok && /^VIS-\d{4}$/.test(r.data.code), r)
  check('registration works cross-origin from the main site (CORS)', r.cors === 'http://localhost:4173', r.cors)
  check('a public registration does not start a session', !r.cookie, r.cookie)
  const code = r.data.code
  r = await publicPost('public/visit', visitForm(good, { payment_proof: [tinyPng(), 'pay.png', 'image/png'] }))
  check('a double tap does not create a second response', r.ok && r.data.code === code, r)
  check('admins get an email about the visitor', readFileSync(MAIL_LOG, 'utf8').split('\n').some((l) => l.includes('New visitor: Visiting Person') && l.includes('admin@bba.test')))

  // ------------------------------------------------------------ visitor form: admin
  console.log('\nVisitor form: admin')
  r = await member.get('admin/visit-requests')
  check('members cannot read responses', r.status === 403, r)
  r = await anon.get('admin/visit-form')
  check('visitors cannot open the form editor', r.status === 401, r)
  r = await admin.get('admin/visit-requests')
  const resp = r.data.items.find((x) => x.code === code)
  check('response appears for admins', !!resp && r.data.counts.new >= 1, r.data)
  check('mobile is stored as 10 digits', resp?.mobile === mobile, resp)
  check('email is stored lower-case', resp?.email === 'visitor@example.com', resp)
  check('meeting is linked', resp?.meeting_id === meetingId && !!resp?.meeting_title, resp)
  check('phone answers stay text (no number casting)', resp?.answers.find((a) => a.id === 'mobile')?.answer === mobile, resp?.answers)
  check('answers keep each question label', resp?.answers.find((a) => a.id === 'business')?.label === 'Business name', resp?.answers)
  check('IP address is not sent to the browser', resp && !('ip' in resp), resp)
  r = await admin.get('notifications/unread-count')
  check('sidebar badge counts new responses', r.data.visit_new >= 1, r.data)
  r = await admin.get('notifications')
  check('admins get an in-app notification', r.data.some((n) => n.type === 'visit_request' && n.link === `/admin/visitor-form?r=${resp?.id}`), r.data.slice(0, 2))

  let f = await download(anon, 'files/visit-upload', { id: resp?.id, field: 'payment_proof' })
  check('attachments are private (no login → 401)', f.status === 401, f.status)
  f = await download(member, 'files/visit-upload', { id: resp?.id, field: 'payment_proof' })
  check('attachments are private (member → 403)', f.status === 403, f.status)
  f = await download(admin, 'files/visit-upload', { id: resp?.id, field: 'payment_proof' })
  check('admin can open the payment screenshot', f.status === 200 && f.type.startsWith('image/png') && f.buf.equals(tinyPng()), [f.status, f.type])
  f = await download(admin, 'files/visit-upload', { id: resp?.id, field: '../../config' })
  check('attachment lookup ignores made-up field names', f.status === 404, f.status)

  r = await admin.post('admin/visit-requests/update', { id: resp?.id, status: 'paid' })
  check('unknown status is refused', r.status === 422, r)
  r = await admin.post('admin/visit-requests/update', { id: resp?.id, status: 'confirmed', admin_note: 'Paid by UPI' })
  check('admin confirms and adds a note', r.ok, r)
  r = await admin.get('admin/visit-requests')
  check('status and note saved', r.data.items.find((x) => x.code === code)?.status === 'confirmed' && r.data.items.find((x) => x.code === code)?.admin_note === 'Paid by UPI', r.data.items[0])

  r = await admin.get('admin/visit-form')
  check('editor loads the form, defaults and public link', r.ok && r.data.form.fields.length > 0 && r.data.defaults.fields.length > 0 && r.data.public_url.endsWith('/visit'), r.data?.public_url)
  const form = r.data.form
  const save = (patch) => admin.post('admin/visit-form/save', { ...form, ...patch })
  r = await save({ fields: form.fields.filter((x) => x.id !== 'name') })
  check('name question cannot be removed', r.status === 422 && /cannot be removed/.test(r.error.message), r)
  r = await save({ fields: [...form.fields, { id: 'diet', label: 'Food preference', type: 'select', required: true, options: [] }] })
  check('a choice question needs choices', r.status === 422, r)
  r = await save({ fields: [...form.fields, { id: 'name', label: 'Again', type: 'text', required: false }] })
  check('question ids must be unique', r.status === 422, r)
  r = await save({ fields: [...form.fields, { id: 'x1', label: 'Weird', type: 'script', required: false }] })
  check('unknown answer types are refused', r.status === 422, r)
  r = await save({ upi_id: 'not a upi' })
  check('UPI ID is checked', r.status === 422 && !!r.error.fields?.upi_id, r)
  r = await save({ notify_emails: ['ok@bba.test', 'nope'] })
  check('alert emails are checked', r.status === 422 && !!r.error.fields?.notify_emails, r)
  r = await save({ whatsapp_number: '123' })
  check('WhatsApp number is checked', r.status === 422 && !!r.error.fields?.whatsapp_number, r)

  const fields = [
    ...form.fields.map((x) => (x.id === 'name' ? { ...x, label: 'Your full name', required: false, type: 'textarea' } : x)),
    { id: 'diet', label: 'Food preference', type: 'select', required: true, options: ['Veg', 'Non-veg', 'Veg'], help: '' },
    { id: 'consent', label: 'I agree to be contacted', type: 'checkbox', required: true, help: '', options: [] },
  ]
  r = await save({ title: 'Visit BBA', fee_amount: '₹500', upi_id: 'bba@okhdfcbank', whatsapp_number: '+91 98765 43210', notify_emails: 'alerts@bba.test, ALERTS@bba.test', fields })
  check('admin saves an edited form', r.ok, r)
  check('fee is stored as a plain number', r.data?.fee_amount === '500', r.data?.fee_amount)
  check('duplicate alert emails collapse', JSON.stringify(r.data?.notify_emails) === '["alerts@bba.test"]', r.data?.notify_emails)
  check('locked fields keep their type and stay required', r.data?.fields.find((x) => x.id === 'name')?.type === 'text' && r.data?.fields.find((x) => x.id === 'name')?.required === true, r.data?.fields?.[0])
  check('duplicate choices collapse', JSON.stringify(r.data?.fields.find((x) => x.id === 'diet')?.options) === '["Veg","Non-veg"]', r.data?.fields)
  r = await anon.get('public/visit-form')
  check('public page shows the new title, label and fee', r.data.title === 'Visit BBA' && r.data.fields[0].label === 'Your full name' && r.data.payment.amount === '500' && r.data.whatsapp_number === '9876543210', r.data)

  const m2 = `8${stamp}222`.slice(0, 10)
  const good2 = { ...good, mobile: m2, diet: 'Veg', consent: true }
  r = await publicPost('public/visit', visitForm({ ...good2, consent: false }))
  check('a required tick box must be ticked', r.status === 422 && !!r.error.fields?.consent, r)
  r = await publicPost('public/visit', visitForm({ ...good2, diet: 'Vegan' }))
  check('only listed choices are accepted', r.status === 422 && !!r.error.fields?.diet, r)
  r = await publicPost('public/visit', visitForm(good2))
  check('registration with the new questions works', r.ok, r)
  check('alerts go to the configured address', readFileSync(MAIL_LOG, 'utf8').split('\n').filter((l) => l.includes('] TO ')).pop()?.includes('TO alerts@bba.test | New visitor'))
  const code2 = r.data.code
  r = await admin.get('admin/visit-requests')
  const resp2 = r.data.items.find((x) => x.code === code2)
  check('new answers are recorded', resp2?.answers.find((a) => a.id === 'diet')?.answer === 'Veg' && resp2?.answers.find((a) => a.id === 'consent')?.answer === 'Yes', resp2?.answers)

  // QR code
  let fd = new FormData()
  fd.append('file', new Blob([Buffer.from('not an image')], { type: 'image/png' }), 'qr.png')
  r = await admin.post('admin/visit-form/qr', fd)
  check('QR must be a real image', r.status === 422, r)
  fd = new FormData()
  fd.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'qr.png')
  r = await admin.post('admin/visit-form/qr', fd)
  check('admin uploads the payment QR', r.ok && /\/uploads\/site\/[a-f0-9]{32}\.png$/.test(r.data.qr_url), r)
  const qr1 = r.data.qr_url.split('/').pop()
  check('QR folder gets the no-execute guard', existsSync(new URL('site/.htaccess', UPLOADS)))
  fd = new FormData()
  fd.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'qr2.png')
  r = await admin.post('admin/visit-form/qr', fd)
  const qr2 = r.data.qr_url.split('/').pop()
  check('replacing the QR deletes the old image', r.ok && !existsSync(new URL(`site/${qr1}`, UPLOADS)) && existsSync(new URL(`site/${qr2}`, UPLOADS)))
  r = await anon.get('public/visit-form')
  check('public page shows the QR', r.data.payment.qr_url?.endsWith(qr2), r.data.payment)
  r = await admin.post('admin/visit-form/save', { ...(await admin.get('admin/visit-form')).data.form })
  check('saving the form keeps the QR', (await anon.get('public/visit-form')).data.payment.qr_url?.endsWith(qr2))

  // Closing the form
  r = await admin.post('admin/visit-form/save', { ...(await admin.get('admin/visit-form')).data.form, enabled: false, closed_message: 'Back in January.' })
  check('admin closes the form', r.ok, r)
  r = await anon.get('public/visit-form')
  check('closed form hides its questions and shows the message', r.data.enabled === false && r.data.fields.length === 0 && r.data.closed_message === 'Back in January.', r.data)
  check('landing page hides the visitor button', (await anon.get('public/content')).data.visit_open === false)
  r = await publicPost('public/visit', visitForm({ ...good2, mobile: '7000000001' }))
  check('a closed form refuses registrations', r.status === 409 && r.error.message === 'Back in January.', r)
  r = await admin.post('admin/visit-form/save', { ...(await admin.get('admin/visit-form')).data.form, enabled: true })
  check('admin reopens the form', r.ok && (await anon.get('public/visit-form')).data.enabled === true)

  // ------------------------------------------------------------ backup: export
  console.log('\nBackup: export')
  r = await member.get('admin/backup/status')
  check('members cannot see backups', r.status === 403, r)
  f = await download(member, 'admin/backup/export')
  check('members cannot download a backup', f.status === 403, f.status)
  r = await admin.get('admin/backup/status')
  check('backup status loads', r.ok && r.data.rows_total > 0 && r.data.file_count > 0, r.data)
  const statusBefore = r.data

  const exp1 = await download(admin, 'admin/backup/export')
  check('admin downloads a ZIP', exp1.status === 200 && exp1.type === 'application/zip' && exp1.buf.subarray(0, 2).toString() === 'PK', [exp1.status, exp1.type])
  check('download is named by date', /filename="bba-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip"/.test(exp1.disposition), exp1.disposition)
  const z1 = unzip(exp1.buf)
  const manifest = json(z1.get('manifest.json'))
  check('manifest describes the backup', manifest.format === 'bba-backup' && manifest.schema_version === 8 && manifest.migrations.includes('m008_visit_form'), manifest)
  check('every table is in the backup', ['members', 'referrals', 'one_to_ones', 'meetings', 'attendance', 'visitors', 'visit_requests', 'settings', 'audit_logs', 'notifications', 'categories', 'invites', 'one_photos'].every((t) => z1.has(`database/${t}.json`)), [...z1.keys()].filter((k) => k.startsWith('database/')))
  check('row counts match the manifest', Object.entries(manifest.tables).every(([t, n]) => json(z1.get(`database/${t}.json`)).rows.length === n))
  check('uploaded files are in the backup', manifest.file_count === statusBefore.file_count && [...z1.keys()].filter((k) => k.startsWith('files/')).length === manifest.file_count, [manifest.file_count, statusBefore.file_count])
  check('QR, avatars and visitor attachments included', z1.has(`files/uploads/site/${qr2}`) && [...z1.keys()].some((k) => k.startsWith('files/uploads/avatars/')) && [...z1.keys()].some((k) => k.startsWith('files/private/visit/')))
  check('no .htaccess or config in the backup', ![...z1.keys()].some((k) => k.includes('.htaccess') || k.includes('config.secrets')))
  check('visitor form settings are in the backup', json(z1.get('database/settings.json')).rows.some((row) => row[0] === 'visit_form' && row[1].includes('Visit BBA')))
  r = await admin.get('admin/backup/status')
  check('last export is recorded', !!r.data.last_export?.created_at, r.data.last_export)

  // ------------------------------------------------------------ backup: upload edge cases
  console.log('\nBackup: upload and checks')
  fd = new FormData()
  fd.append('offset', '5')
  fd.append('chunk', new Blob([Buffer.from('x')]), 'c')
  r = await admin.post('admin/backup/upload', fd)
  check('an upload must start at the beginning', r.status === 422, r)
  const half = Math.floor(exp1.buf.length / 2)
  const q1 = Math.floor(half / 2)
  let u = await upload(admin, exp1.buf.subarray(0, half), q1)
  fd = new FormData()
  fd.append('id', u.data.id)
  fd.append('offset', String(q1))
  fd.append('chunk', new Blob([exp1.buf.subarray(q1, half)]), 'c')
  r = await admin.post('admin/backup/upload', fd)
  check('a retried chunk is accepted once', r.ok && r.data.size === half, r)
  fd = new FormData()
  fd.append('id', u.data.id)
  fd.append('offset', String(10))
  fd.append('chunk', new Blob([Buffer.from('zz')]), 'c')
  r = await admin.post('admin/backup/upload', fd)
  check('an out-of-step chunk is refused', r.status === 409, r)
  r = await admin.post('admin/backup/inspect', { id: u.data.id })
  check('a half-uploaded backup is refused', r.status === 422 && r.error.code === 'bad_backup', r)
  await admin.post('admin/backup/discard', { id: u.data.id })
  r = await admin.post('admin/backup/inspect', { id: u.data.id })
  check('a discarded upload is gone', r.status === 404, r)
  r = await admin.post('admin/backup/inspect', { id: '../../data/bba' })
  check('upload ids cannot point elsewhere', r.status === 404, r)
  r = await admin.post('admin/backup/inspect', { safety: '../data/bba.sqlite' })
  check('safety names cannot point elsewhere', r.status === 404, r)

  r = await inspectBuf(admin, Buffer.from('hello, this is not a zip file at all'))
  check('a non-ZIP file is refused', r.status === 422 && /not a ZIP/.test(r.error.message), r)
  r = await inspectBuf(admin, zip([['notes.txt', Buffer.from('hi')]]))
  check('a ZIP that is not a backup is refused', r.status === 422 && /not a BBA backup/.test(r.error.message), r)
  const flipped = Buffer.from(exp1.buf)
  const avatarName = [...z1.keys()].find((k) => k.startsWith('files/uploads/avatars/'))
  const at = flipped.indexOf(z1.get(avatarName).subarray(0, 64))
  flipped[at + 40] ^= 0xff
  r = await inspectBuf(admin, flipped)
  check('a corrupted file inside the ZIP is detected', r.status === 422 && /checksum|damaged/.test(r.error.message), r)
  r = await inspectBuf(admin, repack(exp1.buf, (m) => m.set('manifest.json', buf({ ...manifest, schema_version: 99 }))))
  check('a backup from a newer app version is refused', r.status === 422 && /newer version/.test(r.error.message), r)
  r = await inspectBuf(admin, repack(exp1.buf, (m) => m.delete('database/members.json')))
  check('a backup missing a table is refused', r.status === 422 && /members table is missing/.test(r.error.message), r)
  r = await inspectBuf(admin, repack(exp1.buf, (m) => {
    const t = json(m.get('database/referrals.json'))
    t.rows.pop()
    m.set('database/referrals.json', buf(t))
  }))
  check('a table with missing rows is refused', r.status === 422 && /referrals should have/.test(r.error.message), r)
  r = await inspectBuf(admin, repack(exp1.buf, (m) => m.delete(avatarName)))
  check('a backup missing a file is refused', r.status === 422 && /should hold/.test(r.error.message), r)
  r = await inspectBuf(admin, repack(exp1.buf, (m) => m.set('database/members.json', Buffer.from('{"columns":["id"],"rows":[[1,2]]}'))))
  check('a malformed table is refused', r.status === 422 && /malformed|members should have/.test(r.error.message), r)

  // Re-zipped by hand, inside a folder, with Mac junk and hostile paths: still restorable, junk ignored.
  const rezipped = repack(exp1.buf, (m) => {
    m.set('files/uploads/avatars/.DS_Store', Buffer.from('junk'))
    m.set('files/uploads/avatars/../../../evil.php', Buffer.from('<?php echo 1;'))
    m.set('files/uploads/avatars/evil.php', Buffer.from('<?php echo 1;'))
    m.set('files/somewhere/else.png', tinyPng())
  }, 'bba-backup-folder/')
  r = await inspectBuf(admin, Buffer.concat([rezipped]))
  check('a backup re-zipped inside a folder is accepted', r.ok && r.data.file_count === manifest.file_count, r)
  check('junk and unsafe paths are skipped, not restored', r.ok && r.data.skipped_entries === 4, r.data)
  check('inspect summarises the backup', r.ok && r.data.members > 0 && r.data.admins >= 1 && r.data.tables.visit_requests === manifest.tables.visit_requests, r.data)

  // ------------------------------------------------------------ backup: restore
  console.log('\nBackup: restore')
  // Change things after the backup: these must all be undone by the restore.
  const settings = (await admin.get('admin/settings')).data.settings
  r = await admin.post('admin/settings/save', { ...settings, hero_sub: `Changed after backup ${stamp}` })
  check('change a landing-page setting after the backup', r.ok, r)
  r = await admin.post('admin/visit-requests/delete', { id: resp?.id })
  check('delete a response (and its screenshot) after the backup', r.ok, r)
  const proofName = resp.answers.find((a) => a.id === 'payment_proof').answer
  check('deleted response removes its attachment', !existsSync(new URL(`visit/${proofName}`, PRIV_UPLOADS)))
  r = await admin.post('admin/visit-form/qr/remove')
  check('remove the QR after the backup', r.ok && !existsSync(new URL(`site/${qr2}`, UPLOADS)))
  const stray = new FormData()
  stray.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'qr3.png')
  const qr3 = (await admin.post('admin/visit-form/qr', stray)).data.qr_url.split('/').pop()

  u = await upload(admin, rezipped, 40000)
  check('backup uploads in chunks', u.ok, u)
  r = await admin.post('admin/backup/restore', { id: u.data.id })
  check('restore needs the typed confirmation', r.status === 422 && !!r.error.fields?.confirm, r)
  r = await member.post('admin/backup/restore', { id: u.data.id, confirm: 'RESTORE' })
  check('members cannot restore', r.status === 403, r)
  r = await admin.post('admin/backup/restore', { id: u.data.id, confirm: 'RESTORE' })
  check('restore succeeds', r.ok && r.data.file_problems === 0, r)
  check('admin stays signed in after restoring their own backup', r.data?.signed_in === true, r.data)
  const safety1 = r.data?.safety
  check('a safety copy was saved first', /^before-restore-\d{8}-\d{6}-[a-f0-9]{4}\.zip$/.test(safety1 ?? ''), safety1)
  r = await admin.post('admin/backup/inspect', { id: u.data.id })
  check('the uploaded file is removed after restoring', r.status === 404, r)

  check('landing-page text is back', (await anon.get('public/content')).data.hero_sub === settings.hero_sub)
  r = await admin.get('admin/visit-requests')
  check('the deleted response is back', r.data.items.some((x) => x.code === code && x.status === 'confirmed' && x.admin_note === 'Paid by UPI'), r.data.items.map((x) => x.code))
  check('its attachment is back', existsSync(new URL(`visit/${proofName}`, PRIV_UPLOADS)))
  f = await download(admin, 'files/visit-upload', { id: resp?.id, field: 'payment_proof' })
  check('the restored attachment opens', f.status === 200 && f.buf.equals(tinyPng()), f.status)
  check('the QR is back', existsSync(new URL(`site/${qr2}`, UPLOADS)) && (await anon.get('public/visit-form')).data.payment.qr_url?.endsWith(qr2))
  check('files added after the backup are gone', !existsSync(new URL(`site/${qr3}`, UPLOADS)))
  check('the QR folder keeps its guard file', existsSync(new URL('site/.htaccess', UPLOADS)) && existsSync(new URL('avatars/.htaccess', UPLOADS)))
  check('nothing unsafe was written', !existsSync(new URL('avatars/evil.php', UPLOADS)) && !existsSync(new URL('../evil.php', UPLOADS)) && !existsSync(new URL('../../evil.php', UPLOADS)))

  // Exactness: export again — every table must match the first export row for row
  // (the audit log only gains the export + restore entries).
  const exp2 = await download(admin, 'admin/backup/export')
  const z2 = unzip(exp2.buf)
  const diffs = []
  for (const [name, data] of z1) {
    if (!name.startsWith('database/')) continue
    const a = json(data)
    const b = json(z2.get(name))
    if (name === 'database/audit_logs.json') {
      if (JSON.stringify(b.rows.slice(0, a.rows.length)) !== JSON.stringify(a.rows)) diffs.push(name)
    } else if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(name)
  }
  check('restored data is identical to the backup, table by table', diffs.length === 0, diffs)
  const files1 = [...z1].filter(([k]) => k.startsWith('files/'))
  check('other sessions survive a restore (member still signed in)', (await member.get('dashboard')).ok)
  check('restored files are byte-for-byte identical', files1.length > 0 && files1.every(([k, v]) => z2.get(k)?.equals(v)) && [...z2.keys()].filter((k) => k.startsWith('files/')).length === files1.length)

  // Safety copy: listed, downloadable, and restoring it undoes the restore.
  r = await admin.get('admin/backup/status')
  check('safety copy is listed', r.data.safety.some((s) => s.name === safety1) && !!r.data.last_restore, r.data.safety)
  f = await download(admin, 'admin/backup/safety/download', { name: safety1 })
  check('safety copy downloads as a ZIP', f.status === 200 && f.buf.subarray(0, 2).toString() === 'PK', f.status)
  r = await admin.post('admin/backup/inspect', { safety: safety1 })
  check('safety copy can be inspected', r.ok && r.data.tables.visit_requests === manifest.tables.visit_requests - 1, r.data?.tables)
  r = await admin.post('admin/backup/restore', { safety: safety1, confirm: 'RESTORE' })
  check('restoring the safety copy undoes the restore', r.ok && (await anon.get('public/content')).data.hero_sub === `Changed after backup ${stamp}`, r)
  check('…including files', existsSync(new URL(`site/${qr3}`, UPLOADS)) && !existsSync(new URL(`site/${qr2}`, UPLOADS)))

  // Older backup (made before the visitor form existed): restores, and the app upgrades it.
  const older = repack(exp1.buf, (m) => {
    const mf = json(m.get('manifest.json'))
    mf.schema_version = 7
    mf.migrations = mf.migrations.filter((x) => x !== 'm008_visit_form')
    delete mf.tables.visit_requests
    mf.file_count -= [...m.keys()].filter((k) => k.startsWith('files/private/visit/') || k.startsWith('files/uploads/site/')).length
    for (const k of [...m.keys()]) if (k.startsWith('files/private/visit/') || k.startsWith('files/uploads/site/')) m.delete(k)
    m.delete('database/visit_requests.json')
    const s = json(m.get('database/settings.json'))
    s.rows = s.rows.filter((row) => row[0] !== 'visit_form').map((row) => (row[0] === 'migrations' ? [row[0], mf.migrations.join(',')] : row))
    m.set('database/settings.json', buf(s))
    mf.tables.settings = s.rows.length
    m.set('manifest.json', buf(mf))
  })
  u = await upload(admin, older)
  r = await admin.post('admin/backup/restore', { id: u.data.id, confirm: 'RESTORE' })
  check('an older-version backup restores', r.ok, r)
  r = await admin.get('admin/visit-requests')
  check('…and is upgraded (visitor responses table exists, empty)', r.ok && r.data.total === 0, r)
  r = await anon.get('public/visit-form')
  check('…and the visitor form falls back to its defaults', r.ok && r.data.title === 'Attend as a visitor' && r.data.payment.qr_url === null, r.data?.title)

  // A backup in which this admin's account changed: the restore signs them out.
  const signedOut = repack(exp1.buf, (m) => {
    const t = json(m.get('database/members.json'))
    const idI = t.columns.indexOf('email')
    const svI = t.columns.indexOf('session_version')
    t.rows = t.rows.map((row) => (row[idI] === 'admin@bba.test' ? row.map((v, i) => (i === svI ? String(Number(v) + 1) : v)) : row))
    m.set('database/members.json', buf(t))
  })
  u = await upload(admin, signedOut)
  r = await admin.post('admin/backup/restore', { id: u.data.id, confirm: 'RESTORE' })
  check('restore reports when the admin must sign in again', r.ok && r.data.signed_in === false, r.data)
  r = await admin.get('admin/backup/status')
  check('…and the old session really is closed', r.status === 401, r.status)
  r = await admin.login('admin@bba.test', 'admin-new-12345')
  check('admin signs in again with the password from the backup', r.ok, r)

  // Put the first backup back so the dev database ends where it started.
  u = await upload(admin, exp1.buf, 2097152)
  r = await admin.post('admin/backup/restore', { id: u.data.id, confirm: 'RESTORE' })
  // The backup holds the admin's earlier session version, so this restore signs them out again.
  check('restore the original backup (2 MB chunks, as the dashboard sends)', r.ok && r.data.signed_in === false, r)
  check('admin signs in again', (await admin.login('admin@bba.test', 'admin-new-12345')).ok)
  r = await admin.get('admin/backup/status')
  check('at most 5 safety copies are kept', r.data.safety.length <= 5, r.data.safety.length)
  check('no restore staging folders are left behind', !readdirSync(new URL('../server/api/_private/backups/', import.meta.url)).some((n) => n.startsWith('restore-')))

  // ------------------------------------------------------------ rate limit (last: it blocks this IP for an hour)
  console.log('\nVisitor form: abuse')
  let limited = false
  for (let i = 0; i < 25 && !limited; i++) {
    r = await publicPost('public/visit', visitForm({ ...good2, mobile: `7${stamp}${String(i).padStart(2, '0')}5` }))
    limited = r.status === 429
  }
  check('one connection cannot flood the form', limited, r)

  finish()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
