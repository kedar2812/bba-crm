// The landing page lives on bbanetworking.com; the app + API on dashboard.bbanetworking.com.
// Same protocol as the current page, so everything keeps working before and after SSL is enabled.
export const DASHBOARD_ORIGIN = `${typeof window !== 'undefined' && window.location.protocol === 'http:' ? 'http:' : 'https:'}//dashboard.bbanetworking.com`

const host = typeof window !== 'undefined' ? window.location.hostname : ''
export const IS_LOCAL = host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host)
export const IS_DASHBOARD = host.startsWith('dashboard.') || IS_LOCAL
/** The public main domain (landing page and visitor form). */
export const IS_MAIN_SITE = !IS_DASHBOARD

export const API_BASE = IS_DASHBOARD ? '/api' : `${DASHBOARD_ORIGIN}/api`

/** The public website (landing page, visitor form). */
export const SITE_ORIGIN = DASHBOARD_ORIGIN.replace('//dashboard.', '//')

/** Link to an app route — absolute when we're on the main domain. */
export function appHref(path: string) {
  return IS_MAIN_SITE ? DASHBOARD_ORIGIN + path : path
}

/** Link to a public page — absolute when we're on the dashboard subdomain (local dev serves both). */
export function siteHref(path: string) {
  return IS_DASHBOARD && !IS_LOCAL ? SITE_ORIGIN + path : path
}
