import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App'
import { DASHBOARD_ORIGIN, IS_MAIN_SITE } from './lib/config'
import { queryClient } from './lib/session'
import './styles/index.css'

// The main domain serves the landing page and the visitor form; every app route lives on the dashboard subdomain.
const SITE_PAGES = ['/', '/index.html', '/visit', '/visit/']
const onAppRoute = IS_MAIN_SITE && !SITE_PAGES.includes(window.location.pathname)
if (onAppRoute) {
  window.location.replace(DASHBOARD_ORIGIN + window.location.pathname + window.location.search)
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <App />
          <Toaster
            position="top-center"
            offset="calc(env(safe-area-inset-top) + 12px)"
            toastOptions={{
              style: { borderRadius: 14, border: '1px solid #E8E1D3', fontFamily: 'inherit', fontSize: 14 },
              duration: 3500,
            }}
          />
        </MotionConfig>
      </QueryClientProvider>
    </StrictMode>,
  )
}
