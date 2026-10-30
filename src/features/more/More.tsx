import { motion } from 'framer-motion'
import { Bell, CalendarDays, ChevronRight, LogOut, User, UserPlus, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLogout } from '@/components/Shell'
import { Avatar, itemVariants, listVariants } from '@/components/ui'
import { useMe, useUnread } from '@/lib/session'

function Item({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <motion.div variants={itemVariants}>
      <Link to={to} className="flex h-14 items-center gap-3.5 px-4 hover:bg-cream-50 active:bg-cream-100">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-ink-950 text-gold-300">{icon}</span>
        <span className="flex-1 text-[15px] font-semibold">{label}</span>
        {!!badge && <span className="rounded-full bg-gold-500 px-2 text-[12px] font-bold leading-5">{badge}</span>}
        <ChevronRight className="h-4 w-4 text-ink-400" />
      </Link>
    </motion.div>
  )
}

export default function More() {
  const me = useMe().data?.member
  const unread = useUnread(!!me).data
  const logout = useLogout()
  return (
    <div className="page max-w-xl">
      {me && (
        <Link to={`/app/members/${me.id}`} className="card flex items-center gap-3.5 p-4">
          <Avatar src={me.photo_url} name={me.full_name} size={54} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold">{me.full_name}</p>
            <p className="truncate text-[13.5px] text-ink-600">{me.business_name}</p>
            <p className="mt-0.5 text-[12.5px] font-semibold text-gold-700">View my public profile</p>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-400" />
        </Link>
      )}
      <motion.div variants={listVariants} initial="hidden" animate="show" className="card mt-4 divide-y divide-line overflow-hidden">
        <Item to="/app/directory" icon={<Users className="h-[18px] w-[18px]" />} label="Directory" />
        <Item to="/app/visitors" icon={<UserPlus className="h-[18px] w-[18px]" />} label="Visitors" />
        <Item to="/app/meetings" icon={<CalendarDays className="h-[18px] w-[18px]" />} label="Meetings & Attendance" />
        <Item to="/app/notifications" icon={<Bell className="h-[18px] w-[18px]" />} label="Notifications" badge={unread?.unread} />
        <Item to="/app/profile" icon={<User className="h-[18px] w-[18px]" />} label="My Profile & Settings" />
      </motion.div>
      <button type="button" onClick={() => logout()} className="card mt-4 flex h-14 w-full items-center justify-center gap-2 text-[15px] font-semibold text-danger">
        <LogOut className="h-4 w-4" /> Log out
      </button>
    </div>
  )
}
