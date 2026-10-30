import { QuickAddProvider } from '@/features/quickadd/QuickAdd'
import { Shell } from './Shell'

/** Everything behind login. Lazy-loaded so the public landing page stays light. */
export default function AppLayout({ mode }: { mode: 'member' | 'admin' }) {
  return (
    <QuickAddProvider>
      <Shell mode={mode} />
    </QuickAddProvider>
  )
}
