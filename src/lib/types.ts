export type Role = 'member' | 'admin'

export interface Me {
  id: number
  role: Role
  full_name: string
  email: string
  mobile: string
  photo_url: string | null
  business_name: string
  category_id: number | null
  category: string | null
  category_other: string | null
  designation: string
  business_description: string | null
  address: string | null
  city: string
  website: string | null
  instagram: string | null
  linkedin: string | null
  facebook: string | null
  offers: string[]
  looking_for: string[]
  must_change_password: boolean
  created_at: string
}

export interface MeResponse {
  member: Me | null
  csrf: string
  unread?: number
  pending_applications?: number
  targets?: { ones: number; referrals: number }
}

export interface MemberMini {
  id: number
  full_name: string
  business_name: string
  photo_url: string | null
  category?: string | null
}

export type RefStatus = 'new' | 'contacted' | 'in_progress' | 'won' | 'lost'

export interface Referral {
  id: number
  code: string
  type: 'referral' | 'direct'
  status: RefStatus
  client_name: string
  client_phone: string | null
  client_email: string | null
  requirement: string
  description: string | null
  estimated_value: number | null
  final_value: number | null
  referral_date: string
  won_date: string | null
  thank_you_note: string | null
  lost_reason: string | null
  has_proof: boolean
  is_disputed: boolean
  dispute_reason: string | null
  is_void: boolean
  created_by: number
  created_at: string
  updated_at: string
  giver: MemberMini
  receiver: MemberMini
  direction?: 'given' | 'received'
}

export interface ReferralEvent {
  id: number
  kind: 'created' | 'status' | 'note' | 'edit' | 'dispute' | 'resolve'
  from_status: RefStatus | null
  to_status: RefStatus | null
  body: string | null
  member_name: string
  member_id: number
  created_at: string
}

export interface ReferralDetail extends Referral {
  events: ReferralEvent[]
  my_followup: string | null
  can: { status: boolean; edit: boolean; dispute: boolean; note: boolean; proof: boolean }
}

export type OneStatus = 'requested' | 'scheduled' | 'awaiting_confirmation' | 'completed' | 'declined' | 'cancelled'

export interface OneToOne {
  id: number
  code: string
  meeting_at: string
  mode: 'in_person' | 'online'
  status: OneStatus
  effective_status: OneStatus
  other: MemberMini
  requester: { id: number; full_name: string }
  partner: { id: number; full_name: string }
  i_am_requester: boolean
  request_message: string | null
  business_discussed: string | null
  products_introduced: string | null
  referrals_exchanged: string | null
  follow_up_actions: string | null
  my_notes: string | null
  their_notes: string | null
  logged_by: number | null
  confirmed_at: string | null
  force_confirmed: boolean
  can: { respond: boolean; cancel: boolean; mark_done: boolean; confirm: boolean }
  waiting_on_other: boolean
  photos: OnePhoto[]
}

export interface OnePhoto {
  id: number
  mine: boolean
  created_at: string
}

export interface Visitor {
  id: number
  code: string
  name: string
  mobile: string
  business: string | null
  category: string | null
  meeting_id: number | null
  meeting_title?: string | null
  meeting_date?: string | null
  invited_date: string
  status: 'invited' | 'attended' | 'joined' | 'not_interested'
  notes: string | null
  inviter_name?: string
}

export interface Meeting {
  id: number
  title: string
  meeting_date: string
  start_time: string
  venue: string | null
  online_link: string | null
  notes: string | null
  my_status?: 'present' | 'absent' | 'substitute' | null
}

export interface Notification {
  id: number
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface Category {
  id: number
  name: string
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}
