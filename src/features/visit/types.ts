/** The "Attend as a visitor" form, as stored by the API (server/api/routes/visit.php). */

export type VisitFieldType = 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'checkbox' | 'file'

export interface VisitField {
  id: string
  label: string
  type: VisitFieldType
  required: boolean
  help: string
  options: string[]
}

export interface VisitMeeting {
  id: number
  title: string
  meeting_date: string
  start_time: string
  venue: string | null
}

/** GET public/visit-form */
export interface PublicVisitForm {
  enabled: boolean
  title: string
  intro: string
  closed_message: string
  submit_label: string
  success_title: string
  success_message: string
  whatsapp_number: string
  payment: { title: string; note: string; amount: string; qr_url: string | null; upi_id: string; link: string }
  fields: VisitField[]
  meetings: VisitMeeting[]
  contact_phone: string
  contact_email: string
}

/** The full form, as admins edit it. */
export interface VisitFormConfig {
  enabled: boolean
  title: string
  intro: string
  show_meeting: boolean
  fee_amount: string
  payment_title: string
  payment_note: string
  qr_path: string
  qr_url?: string | null
  upi_id: string
  payment_link: string
  submit_label: string
  success_title: string
  success_message: string
  closed_message: string
  notify_emails: string[]
  whatsapp_number: string
  fields: VisitField[]
}

export interface VisitAnswer {
  id: string
  label: string
  type: VisitFieldType
  answer: string | null
}

export type VisitStatus = 'new' | 'contacted' | 'confirmed' | 'attended' | 'cancelled'

export interface VisitRequest {
  id: number
  code: string
  name: string
  mobile: string
  email: string | null
  status: VisitStatus
  admin_note: string | null
  meeting_id: number | null
  meeting_title: string | null
  meeting_date: string | null
  start_time: string | null
  answers: VisitAnswer[]
  created_at: string
}

export const FIELD_TYPES: { value: VisitFieldType; label: string }[] = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Long answer' },
  { value: 'phone', label: 'Phone number' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Choice list' },
  { value: 'checkbox', label: 'Tick box' },
  { value: 'file', label: 'Photo or PDF upload' },
]

/** Questions every response must answer, so BBA always knows who to call. */
export const LOCKED_FIELDS = ['name', 'mobile']

/** wa.me link: Indian 10-digit numbers get the 91 country code. */
export function waLink(phone: string, text?: string) {
  let d = phone.replace(/\D/g, '')
  if (d.length === 10) d = `91${d}`
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/** "+91 98765 43210" for display. */
export function fmtPhone(p: string) {
  p = String(p)
  return /^\d{10}$/.test(p) ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : p
}
