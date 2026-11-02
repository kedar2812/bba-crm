import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, ApiError, setCsrf } from './api'
import type { Category, MeResponse, MemberMini } from './types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
})

export async function fetchMe() {
  const data = await api.get<MeResponse>('auth/me')
  setCsrf(data.csrf)
  return data
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 5 * 60_000 })
}

/** Unread count, polled every 60s only while the tab is visible (TanStack pauses in background). */
export function useUnread(enabled: boolean) {
  return useQuery({
    queryKey: ['unread'],
    queryFn: () => api.get<{ unread: number; pending_applications?: number }>('notifications/unread-count'),
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  })
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('public/categories'), staleTime: 10 * 60_000 })
}

export function useMemberPicker() {
  // Admin accounts can't use member routes, so they read the same list from the admin API.
  const admin = useMe().data?.member?.role === 'admin'
  return useQuery({ queryKey: ['picker', admin], queryFn: () => api.get<MemberMini[]>(admin ? 'admin/members/picker' : 'members/picker'), staleTime: 5 * 60_000 })
}

/** Invalidate everything that depends on activity data after a mutation. */
export function useRefreshAll() {
  const qc = useQueryClient()
  return () => {
    ;['dashboard', 'referrals', 'referral', '121s', 'visitors', 'unread', 'notifications', 'member', 'admin'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    )
  }
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const fn = () => setM(mq.matches)
    fn()
    mq.addEventListener?.('change', fn)
    return () => mq.removeEventListener?.('change', fn)
  }, [q])
  return m
}
