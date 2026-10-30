import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { MapPin, Search, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, EmptyState, ErrorState, Segmented, Select, Skeleton, Tags, itemVariants, listVariants } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { useCategories, useDebounced } from '@/lib/session'

interface DirMember {
  id: number
  full_name: string
  business_name: string
  designation: string
  photo_url: string | null
  city: string
  category: string | null
  offers: string[]
  looking_for?: string[]
  match_score?: number
}

export default function Directory() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')
  const [mode, setMode] = useState<'all' | 'match'>('all')
  const q = useDebounced(search, 250)
  const cats = useCategories()
  const list = useQuery({
    queryKey: ['directory', q, category, city, mode],
    queryFn: () => api.get<{ items: DirMember[]; cities: string[]; my_offers: string[] }>('members', { q, category, city, match: mode === 'match' ? 1 : '' }),
    placeholderData: keepPreviousData,
  })
  const data = list.data

  return (
    <div className="page">
      <h1 className="page-title">Directory</h1>
      <Segmented
        className="mt-4"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'all', label: 'All members' },
          {
            value: 'match',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Needs what I offer
              </span>
            ),
          },
        ]}
      />
      <div className="mt-3 space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="field pl-10" placeholder="Search name, business, product or city" value={search} onChange={(e) => setSearch(e.target.value)} enterKeyHint="search" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 text-[14px]">
            <option value="">All categories</option>
            {cats.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} className="h-11 text-[14px]">
            <option value="">All cities</option>
            {data?.cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {mode === 'match' && data && (
        <p className="mt-3 text-[13px] text-ink-600">
          {data.my_offers.length ? (
            <>
              Members whose “looking for” matches what you offer: <span className="font-semibold text-ink-800">{data.my_offers.join(', ')}</span>
            </>
          ) : (
            <>
              Add what you offer in{' '}
              <Link to="/app/profile" className="font-semibold text-gold-700 underline">
                your profile
              </Link>{' '}
              to see matches.
            </>
          )}
        </p>
      )}

      <div className="mt-4">
        {list.isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[132px] rounded-card" />
            ))}
          </div>
        )}
        {list.isError && <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />}
        {data && data.items.length === 0 && (
          <EmptyState icon={<Users className="h-6 w-6" />} title={mode === 'match' ? 'No matches yet' : 'No members found'} sub={mode === 'match' ? 'Try adding more specific products or services to your profile.' : 'Try a different search or filter.'} />
        )}
        {data && data.items.length > 0 && (
          <>
            <p className="mb-2 text-[12.5px] text-ink-400">{data.items.length} member{data.items.length === 1 ? '' : 's'}</p>
            <motion.div key={mode} variants={listVariants} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((m) => (
                <motion.div key={m.id} variants={itemVariants}>
                  <Link to={`/app/members/${m.id}`} className="card flex h-full gap-3.5 p-4 transition-shadow hover:shadow-lift active:bg-cream-50">
                    <Avatar src={m.photo_url} name={m.full_name} size={52} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-semibold leading-tight">{m.full_name}</p>
                      <p className="truncate text-[13.5px] text-ink-700">{m.business_name}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-ink-400">
                        {m.category}
                        {m.city && (
                          <>
                            <span>·</span>
                            <MapPin className="h-3 w-3" />
                            {m.city}
                          </>
                        )}
                      </p>
                      <div className="mt-2.5">
                        <Tags items={mode === 'match' && m.looking_for ? m.looking_for : m.offers} max={3} />
                      </div>
                      {mode === 'match' && <p className="mt-2 text-[11.5px] font-semibold text-gold-700">Looking for what you offer</p>}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </>
        )}
      </div>
    </div>
  )
}
