import { motion } from 'framer-motion'
import {
  Bell,
  CalendarDays,
  ClipboardList,
  FileBarChart,
  Handshake,
  Home,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ScrollText,
  Send,
  Settings,
  User,
  UserPlus,
  Users,
} from 'lucide-react'
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useQuickAdd } from '@/features/quickadd/QuickAdd'
import { api } from '@/lib/api'
import { useMe, useUnread } from '@/lib/session'
import { Wordmark } from './Brand'
import { Avatar, IconButton, Skeleton, cx } from './ui'

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean; badge?: number }

const memberNav: NavItem[] = [
  { to: '/app', label: 'Home', icon: <Home className="h-5 w-5" />, end: true },
  { to: '/app/referrals', label: 'Referrals', icon: <Send className="h-5 w-5" /> },
  { to: '/app/121s', label: '121s', icon: <Handshake className="h-5 w-5" /> },
  { to: '/app/directory', label: 'Directory', icon: <Users className="h-5 w-5" /> },
  { to: '/app/visitors', label: 'Visitors', icon: <UserPlus className="h-5 w-5" /> },
  { to: '/app/meetings', label: 'Meetings', icon: <CalendarDays className="h-5 w-5" /> },
  { to: '/app/profile', label: 'My Profile', icon: <User className="h-5 w-5" /> },
]

function adminNav(pending: number): NavItem[] {
  return [
    { to: '/admin', label: 'Overview', icon: <LayoutDashboard className="h-5 w-5" />, end: true },
    { to: '/admin/applications', label: 'Applications', icon: <Inbox className="h-5 w-5" />, badge: pending },
    { to: '/admin/members', label: 'Members', icon: <Users className="h-5 w-5" /> },
    { to: '/admin/records', label: 'Records', icon: <ClipboardList className="h-5 w-5" /> },
    { to: '/admin/meetings', label: 'Meetings', icon: <CalendarDays className="h-5 w-5" /> },
    { to: '/admin/reports', label: 'Reports', icon: <FileBarChart className="h-5 w-5" /> },
    { to: '/admin/settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
    { to: '/admin/audit', label: 'Audit Log', icon: <ScrollText className="h-5 w-5" /> },
    { to: '/admin/account', label: 'Account', icon: <KeyRound className="h-5 w-5" /> },
  ]
}

export function PageFallback() {
  return (
    <div className="page space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-card" />
    </div>
  )
}

export function useLogout() {
  const qc = useQueryClient()
  const nav = useNavigate()
  return async (all = false) => {
    try {
      await api.post(all ? 'auth/logout-all' : 'auth/logout')
    } catch {
      /* already logged out */
    }
    qc.clear()
    nav('/login', { replace: true })
    if (all) toast.success('Logged out of all devices')
  }
}

function SideNavLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx('group relative flex h-11 items-center gap-3 rounded-[12px] px-3 text-[14.5px] font-medium transition-colors', isActive ? 'text-ink-950' : 'text-white/70 hover:bg-white/[.06] hover:text-white')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="side-active" className="absolute inset-0 rounded-[12px] bg-gold-500" transition={{ type: 'spring', bounce: 0, duration: 0.35 }} />}
          <span className="relative">{item.icon}</span>
          <span className="relative flex-1">{item.label}</span>
          {!!item.badge && <span className={cx('relative rounded-full px-2 text-[11px] font-bold leading-5', isActive ? 'bg-ink-950 text-gold-300' : 'bg-gold-500 text-ink-950')}>{item.badge}</span>}
        </>
      )}
    </NavLink>
  )
}

function AvatarMenu() {
  const me = useMe().data?.member
  const isAdmin = me?.role === 'admin'
  const logout = useLogout()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])
  if (!me) return null
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full p-1 pr-3 hover:bg-ink-950/5" aria-label="Account menu">
        <Avatar src={me.photo_url} name={me.full_name} size={34} />
        <span className="hidden text-[14px] font-semibold xl:block">{me.full_name.split(' ')[0]}</span>
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} style={{ originX: 1, originY: 0 }} className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-[14px] border border-line bg-white py-1 shadow-lift">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-[14px] font-semibold">{me.full_name}</p>
            <p className="truncate text-[12px] text-ink-600">{me.email}</p>
          </div>
          <Link to={isAdmin ? '/admin/account' : '/app/profile'} onClick={() => setOpen(false)} className="flex h-11 items-center gap-2.5 px-4 text-[14px] hover:bg-cream-100">
            {isAdmin ? <KeyRound className="h-4 w-4" /> : <User className="h-4 w-4" />} {isAdmin ? 'Account' : 'My profile'}
          </Link>
          <button type="button" onClick={() => logout()} className="flex h-11 w-full items-center gap-2.5 px-4 text-[14px] text-danger hover:bg-cream-100">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </motion.div>
      )}
    </div>
  )
}

export function Shell({ mode }: { mode: 'member' | 'admin' }) {
  const me = useMe().data?.member
  const unread = useUnread(!!me)
  const pending = unread.data?.pending_applications ?? 0
  const qa = useQuickAdd()
  const nav = useNavigate()
  const loc = useLocation()
  const items = mode === 'admin' ? adminNav(pending) : memberNav

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])

  return (
    <div className="min-h-[100dvh] lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-ink-950 px-4 pb-4 pt-6 lg:flex">
        <Link to={mode === 'admin' ? '/admin' : '/app'} className="mb-8 px-3">
          <Wordmark />
          <p className="mt-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-300/80">Network • Trust • Business</p>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {items.map((it) => (
            <SideNavLink key={it.to} item={it} />
          ))}
        </nav>
        {mode === 'admin' && <p className="mt-4 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Admin panel</p>}
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-ink-950 pt-safe lg:border-b lg:border-line lg:bg-cream-50/80 lg:backdrop-blur-xl lg:backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 sm:px-6 lg:h-16">
          <Link to={mode === 'admin' ? '/admin' : '/app'} className="lg:hidden" aria-label="Home">
            <Wordmark size="sm" />
          </Link>
          <div className="flex-1" />
          <IconButton label="Notifications" badge={unread.data?.unread} onClick={() => nav(mode === 'admin' ? '/admin/notifications' : '/app/notifications')} className="text-white hover:bg-white/10 lg:text-ink-800 lg:hover:bg-ink-950/5">
            <Bell className="h-5 w-5" />
          </IconButton>
          <div className="hidden items-center gap-3 lg:flex">
            {mode === 'member' && (
              <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={() => qa.open()} className="flex h-10 items-center gap-1.5 rounded-full bg-gold-500 pl-3 pr-4 text-[14px] font-semibold text-ink-950 shadow-gold hover:bg-gold-600">
                <Plus className="h-4 w-4" strokeWidth={2.5} /> Quick Add
              </motion.button>
            )}
            <AvatarMenu />
          </div>
        </div>
        {/* Admin section menu on phones */}
        {mode === 'admin' && (
          <div className="border-t border-white/10 lg:hidden">
            <div className="scroll-x mx-0 px-4 py-2">
              {items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cx('chip h-8 border-transparent', isActive ? 'bg-gold-500 text-ink-950' : 'bg-white/[.08] text-white/80')}>
                  {it.label}
                  {!!it.badge && <span className="rounded-full bg-ink-950 px-1.5 text-[10px] font-bold leading-4 text-gold-300">{it.badge}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className={mode === 'member' ? 'pb-tabbar' : 'pb-12'}>
        <Suspense fallback={<PageFallback />}>
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
            <Outlet />
          </motion.div>
        </Suspense>
      </main>

      {/* Bottom tab bar (phones) */}
      {mode === 'member' && <TabBar onQuickAdd={() => qa.open()} />}
    </div>
  )
}

function TabBar({ onQuickAdd }: { onQuickAdd: () => void }) {
  const tabs: NavItem[] = [
    { to: '/app', label: 'Home', icon: <Home className="h-[22px] w-[22px]" />, end: true },
    { to: '/app/referrals', label: 'Referrals', icon: <Send className="h-[22px] w-[22px]" /> },
    { to: '/app/121s', label: '121s', icon: <Handshake className="h-[22px] w-[22px]" /> },
    { to: '/app/more', label: 'More', icon: <Menu className="h-[22px] w-[22px]" /> },
  ]
  const tab = (t: NavItem) => (
    <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[10.5px] font-semibold transition-colors', isActive ? 'text-ink-950' : 'text-ink-400')}>
      {({ isActive }) => (
        <>
          <span className="relative">
            {t.icon}
            {isActive && <motion.span layoutId="tab-dot" className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gold-500" transition={{ type: 'spring', bounce: 0, duration: 0.3 }} />}
          </span>
          <span className="mt-1">{t.label}</span>
        </>
      )}
    </NavLink>
  )
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line/80 pb-safe lg:hidden" aria-label="Main">
      <div className="mx-auto flex h-16 max-w-md items-stretch px-2">
        {tab(tabs[0])}
        {tab(tabs[1])}
        <div className="flex flex-1 items-start justify-center">
          <motion.button
            type="button"
            onClick={onQuickAdd}
            whileTap={{ scale: 0.92 }}
            aria-label="Quick Add"
            className="-mt-5 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-gold-500 text-ink-950 shadow-gold ring-[5px] ring-cream-100"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </motion.button>
        </div>
        {tab(tabs[2])}
        {tab(tabs[3])}
      </div>
    </nav>
  )
}
