import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Wordmark } from './components/Brand'
import { Button, Spinner } from './components/ui'
import { IS_DASHBOARD } from './lib/config'
import { useMe } from './lib/session'

const AppLayout = lazy(() => import('./components/AppLayout'))
const Landing = lazy(() => import('./features/landing/Landing'))
const Login = lazy(() => import('./features/auth/Login'))
const Join = lazy(() => import('./features/auth/Join'))
const Forgot = lazy(() => import('./features/auth/Forgot'))
const ForceChange = lazy(() => import('./features/auth/ForceChange'))
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'))
const Referrals = lazy(() => import('./features/referrals/Referrals'))
const ReferralDetail = lazy(() => import('./features/referrals/ReferralDetail'))
const Ones = lazy(() => import('./features/ones/Ones'))
const Directory = lazy(() => import('./features/directory/Directory'))
const MemberProfile = lazy(() => import('./features/directory/MemberProfile'))
const Visitors = lazy(() => import('./features/visitors/Visitors'))
const Meetings = lazy(() => import('./features/meetings/Meetings'))
const Notifications = lazy(() => import('./features/notifications/Notifications'))
const Profile = lazy(() => import('./features/profile/Profile'))
const More = lazy(() => import('./features/more/More'))
const AdminOverview = lazy(() => import('./features/admin/Overview'))
const AdminApplications = lazy(() => import('./features/admin/Applications'))
const AdminMembers = lazy(() => import('./features/admin/Members'))
const AdminMemberDetail = lazy(() => import('./features/admin/MemberDetail'))
const AdminRecords = lazy(() => import('./features/admin/Records'))
const AdminMeetings = lazy(() => import('./features/admin/AdminMeetings'))
const AdminReports = lazy(() => import('./features/admin/Reports'))
const AdminSettings = lazy(() => import('./features/admin/Settings'))
const AdminAudit = lazy(() => import('./features/admin/Audit'))
const AdminAccount = lazy(() => import('./features/admin/Account'))

function Splash() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-ink-950">
      <Wordmark size="lg" animate />
      <Spinner className="text-gold-500" />
    </div>
  )
}

function RequireMember({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { data, isLoading, isError, refetch } = useMe()
  const loc = useLocation()
  if (isLoading) return <Splash />
  if (isError)
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-[20px] font-bold">Can't reach BBA right now</p>
        <p className="text-ink-600">Check your connection and try again.</p>
        <Button onClick={() => refetch()}>Try again</Button>
      </div>
    )
  const me = data?.member
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (me.must_change_password)
    return (
      <Suspense fallback={<Splash />}>
        <ForceChange />
      </Suspense>
    )
  if (admin && me.role !== 'admin') return <Navigate to="/app" replace />
  // Admin accounts administer only — they have no member dashboard or profile.
  if (!admin && me.role === 'admin') return <Navigate to="/admin" replace />
  return <>{children}</>
}

function NotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-display text-[56px] font-extrabold leading-none text-gold-500">404</p>
      <p className="font-display text-[20px] font-bold">This page doesn't exist</p>
      <Link to="/app" className="font-semibold underline decoration-gold-500 decoration-2 underline-offset-4">
        Go to your dashboard
      </Link>
    </div>
  )
}

function AuthEvents() {
  const qc = useQueryClient()
  useEffect(() => {
    const fn = () => qc.invalidateQueries({ queryKey: ['me'] })
    window.addEventListener('bba:unauthenticated', fn)
    return () => window.removeEventListener('bba:unauthenticated', fn)
  }, [qc])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthEvents />
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route path="/" element={IS_DASHBOARD && !import.meta.env.DEV ? <Navigate to="/app" replace /> : <Landing />} />
            <Route path="/join" element={<Join />} />
            <Route path="/invite/:token" element={<Join />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<Forgot />} />
            <Route
              path="/app"
              element={
                <RequireMember>
                  <AppLayout mode="member" />
                </RequireMember>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="referrals" element={<Referrals />} />
              <Route path="referrals/:code" element={<ReferralDetail />} />
              <Route path="121s" element={<Ones />} />
              <Route path="directory" element={<Directory />} />
              <Route path="members/:id" element={<MemberProfile />} />
              <Route path="visitors" element={<Visitors />} />
              <Route path="meetings" element={<Meetings />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
              <Route path="more" element={<More />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route
              path="/admin"
              element={
                <RequireMember admin>
                  <AppLayout mode="admin" />
                </RequireMember>
              }
            >
              <Route index element={<AdminOverview />} />
              <Route path="applications" element={<AdminApplications />} />
              <Route path="members" element={<AdminMembers />} />
              <Route path="members/:id" element={<AdminMemberDetail />} />
              <Route path="records" element={<AdminRecords />} />
              <Route path="meetings" element={<AdminMeetings />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="audit" element={<AdminAudit />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="account" element={<AdminAccount />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route
              path="*"
element={<NotFound />}
            />
          </Routes>
        </Suspense>
    </BrowserRouter>
  )
}
