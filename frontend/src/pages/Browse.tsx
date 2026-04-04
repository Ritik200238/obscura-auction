import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { staggerContainer, fadeInUp } from '@/lib/animations'
import {
  Search, Filter, PackageOpen, RefreshCw, Plus, Shield,
  Radio, CalendarClock, Clock
} from 'lucide-react'
import { useAuctionStore } from '@/stores/auctionStore'
import { useBlockHeight } from '@/contexts/BlockHeightContext'
import { fetchMapping, parseAuctionData, blockHeightToTime } from '@/lib/aleo'
import { config } from '@/lib/config'
import { AuctionCard } from '@/components/auction/AuctionCard'
import { ShimmerCard } from '@/components/shared/Shimmer'
import FaucetBanner from '@/components/shared/FaucetBanner'
import ActivityFeedSidebar from '@/components/shared/ActivityFeed'
import PlatformTabs from '@/components/shared/PlatformTabs'
import { STATUS, TOKEN_TYPE, AUCTION_MODE } from '@/types'
import type { AuctionData } from '@/types'

const statusFilters = [
  { label: 'All', value: null },
  { label: 'Active', value: STATUS.ACTIVE },
  { label: 'Revealing', value: STATUS.REVEALING },
  { label: 'Settled', value: STATUS.SETTLED },
]

const tokenFilters = [
  { label: 'All Tokens', value: null },
  { label: 'ALEO', value: TOKEN_TYPE.ALEO },
  { label: 'USDCx', value: TOKEN_TYPE.USDCX },
  { label: 'USAD', value: TOKEN_TYPE.USAD },
]

const modeFilters = [
  { label: 'All Modes', value: null },
  { label: 'Sealed', value: AUCTION_MODE.FIRST_PRICE },
  { label: 'Vickrey', value: AUCTION_MODE.VICKREY },
  { label: 'Dutch', value: AUCTION_MODE.DUTCH },
  { label: 'English', value: AUCTION_MODE.ENGLISH },
]

const categoryFilters = [
  { label: 'All', value: null },
  { label: 'NFT', value: 1 },
  { label: 'Collectible', value: 2 },
  { label: 'Service', value: 3 },
  { label: 'Other', value: 4 },
]

const CACHE_KEY = 'obscura_auction_ids'

export default function Browse() {
  const navigate = useNavigate()
  const { auctions, loading, filters, setFilters, filteredAuctions, setAuctions, setLoading } = useAuctionStore()
  const { blockHeight } = useBlockHeight()
  const [searchId, setSearchId] = useState('')
  const [lookupId, setLookupId] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [backendDown, setBackendDown] = useState(false)
  const [viewTab, setViewTab] = useState<'all' | 'upcoming'>('all')
  const [scheduledMap, setScheduledMap] = useState<Record<string, number>>({})

  /** Save known auction IDs to localStorage for fallback when backend is down */
  const cacheAuctionIds = (auctionList: AuctionData[]) => {
    try {
      const ids = auctionList.map((a) => ({
        auction_id: a.auction_id,
        title: a.title,
        description: a.description,
      }))
      localStorage.setItem(CACHE_KEY, JSON.stringify(ids))
    } catch { /* localStorage not available */ }
  }

  /** Fallback: load cached auction IDs and fetch their on-chain data directly */
  const fetchAuctionsOnChainFallback = useCallback(async () => {
    try {
      let ids: { auction_id: string; title?: string; description?: string }[] = []
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) ids = parsed
      }
      if (ids.length === 0) return  // No cached data — show empty state

      const results = await Promise.allSettled(
        ids.map(async (entry) => {
          const key = entry.auction_id.endsWith('field') ? entry.auction_id : `${entry.auction_id}field`
          const raw = await fetchMapping('auctions', key)
          if (raw) {
            const onChain = parseAuctionData(raw, entry.auction_id)
            return { ...onChain, title: entry.title, description: entry.description }
          }
          return null
        })
      )
      const onChainAuctions = results
        .flatMap((r) => r.status === 'fulfilled' && r.value ? [r.value as AuctionData] : [])

      if (onChainAuctions.length > 0) {
        setAuctions(onChainAuctions)
      }
    } catch { /* cache parse error */ }
  }, [setAuctions])

  const fetchAuctionsFromBackend = useCallback(async () => {
    setLoading(true)
    setBackendDown(false)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${config.backendApi}/api/auctions`, { signal: controller.signal })
      clearTimeout(timeout)
      if (res.ok) {
        const data = await res.json()
        if (data.auctions && Array.isArray(data.auctions)) {
          // Enrich with on-chain data in parallel
          const results = await Promise.allSettled(
            data.auctions.map(async (a: any) => {
              const key = a.auction_id?.endsWith('field') ? a.auction_id : `${a.auction_id}field`
              const raw = await fetchMapping('auctions', key)
              if (raw) {
                const onChain = parseAuctionData(raw, a.auction_id)
                return { ...onChain, title: a.title, description: a.description }
              }
              // On-chain data unavailable — skip this auction rather than
              // fabricating status:1 (ACTIVE) which misleads users
              return null
            })
          )
          const enriched: AuctionData[] = results
            .filter((r): r is PromiseFulfilledResult<AuctionData | null> => r.status === 'fulfilled')
            .map(r => r.value)
            .filter((v): v is AuctionData => v !== null)
          setAuctions(enriched)
          cacheAuctionIds(enriched) // Save to localStorage for fallback
        }
      } else {
        setBackendDown(true)
        await fetchAuctionsOnChainFallback() // Try cached on-chain fallback
      }
    } catch {
      setBackendDown(true)
      await fetchAuctionsOnChainFallback() // Try cached on-chain fallback
    }
    setLoading(false)
  }, [setAuctions, setLoading, fetchAuctionsOnChainFallback])

  const handleDirectLookup = async () => {
    if (!lookupId.trim()) return
    setLookupError(null)
    const id = lookupId.trim()
    const key = id.endsWith('field') ? id : `${id}field`
    try {
      const raw = await fetchMapping('auctions', key)
      if (raw) {
        navigate(`/auction/${id}`)
      } else {
        setLookupError('Auction not found on-chain')
      }
    } catch {
      setLookupError('Failed to look up auction')
    }
  }

  useEffect(() => {
    fetchAuctionsFromBackend()
  }, [fetchAuctionsFromBackend])

  // Check for scheduled start blocks on active auctions
  useEffect(() => {
    if (auctions.length === 0) return
    const activeAuctions = auctions.filter(a => a.status === STATUS.ACTIVE)
    if (activeAuctions.length === 0) return

    Promise.allSettled(
      activeAuctions.map(async (a) => {
        const key = a.auction_id.endsWith('field') ? a.auction_id : `${a.auction_id}field`
        const raw = await fetchMapping('scheduled_start', key)
        if (raw) {
          const block = parseInt(raw.replace(/u64\s*$/, '').trim(), 10)
          if (block > 0) return { id: a.auction_id, block }
        }
        return null
      })
    ).then((results) => {
      const newMap: Record<string, number> = {}
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) {
          newMap[r.value.id] = r.value.block
        }
      })
      setScheduledMap(newMap)
    })
  }, [auctions])

  const upcomingIds = new Set(
    Object.entries(scheduledMap)
      .filter(([_, block]) => blockHeight > 0 && block > blockHeight)
      .map(([id]) => id)
  )

  const allDisplayed = filteredAuctions().filter((a) => {
    if (searchId.trim()) {
      return a.auction_id.toLowerCase().includes(searchId.trim().toLowerCase())
    }
    return true
  })

  const displayed = viewTab === 'upcoming'
    ? allDisplayed.filter(a => upcomingIds.has(a.auction_id))
    : allDisplayed.filter(a => !upcomingIds.has(a.auction_id))

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Marketplace</h1>
          <p className="text-sm text-gray-500 mt-1">
            Private auctions, fixed sales, and token offerings on Aleo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAuctionsFromBackend}
            disabled={loading}
            className="btn-secondary text-xs inline-flex items-center gap-1.5 !py-2 !px-3 !min-h-0"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link to="/create" className="btn-primary text-xs inline-flex items-center gap-1.5 !py-2 !px-4 !min-h-0">
            <Plus className="w-3 h-3" />
            Create
          </Link>
        </div>
      </div>

      {/* Platform Tabs */}
      <PlatformTabs />

      {/* Backend down banner */}
      {backendDown && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
          <Radio className="w-4 h-4 text-accent-400 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-400">
            Loading data directly from the Aleo blockchain.
            You can also search by Auction ID below.
          </p>
        </div>
      )}

      {/* Faucet banner */}
      <FaucetBanner />

      {/* Activity Pulse Bar */}
      {auctions.length > 0 && <ActivityPulse auctions={auctions} />}

      {/* Direct On-Chain Lookup */}
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-accent-400" />
          <h3 className="text-sm font-medium text-white">Find an Auction by ID</h3>
          <span className="text-[10px] text-gray-600 ml-1 font-mono">on-chain lookup</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="Paste an Auction ID (e.g. 1234...field)"
            className="input-field flex-1 font-mono text-sm min-w-0"
            onKeyDown={(e) => e.key === 'Enter' && handleDirectLookup()}
          />
          <button onClick={handleDirectLookup} className="btn-primary text-sm !px-5 whitespace-nowrap shrink-0 !min-h-0 !py-3">
            Look Up
          </button>
        </div>
        {lookupError && <p className="text-xs text-red-400 mt-2">{lookupError}</p>}
      </div>

      {/* View Tabs: Active / Upcoming */}
      {upcomingIds.size > 0 && (
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setViewTab('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              viewTab === 'all'
                ? 'bg-accent-500/10 text-accent-400'
                : 'text-gray-500 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            Active Auctions
          </button>
          <button
            onClick={() => setViewTab('upcoming')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              viewTab === 'upcoming'
                ? 'bg-cyan-500/10 text-cyan-400'
                : 'text-gray-500 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Upcoming ({upcomingIds.size})
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input
              type="text"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="Filter listed auctions..."
              className="input-field pl-10"
            />
          </div>

          {/* Filter groups */}
          <div className="flex flex-wrap gap-2 items-center w-full lg:w-auto">
            <Filter className="w-3.5 h-3.5 text-gray-600 hidden sm:block" />

            {/* Status filter */}
            <div className="flex rounded-lg overflow-x-auto border border-white/[0.06] max-w-full">
              {statusFilters.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setFilters({ status: f.value })}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
                    filters.status === f.value
                      ? 'bg-accent-500/20 text-accent-300'
                      : 'bg-white/[0.02] text-gray-500 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Token filter */}
            <div className="flex rounded-lg overflow-x-auto border border-white/[0.06] max-w-full">
              {tokenFilters.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setFilters({ tokenType: f.value })}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
                    filters.tokenType === f.value
                      ? 'bg-accent-500/20 text-accent-300'
                      : 'bg-white/[0.02] text-gray-500 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Mode filter */}
            <div className="flex rounded-lg overflow-x-auto border border-white/[0.06] max-w-full">
              {modeFilters.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setFilters({ mode: f.value })}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
                    filters.mode === f.value
                      ? 'bg-accent-500/20 text-accent-300'
                      : 'bg-white/[0.02] text-gray-500 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Category filter */}
            <div className="flex rounded-lg overflow-x-auto border border-white/[0.06] max-w-full">
              {categoryFilters.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setFilters({ category: f.value })}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
                    filters.category === f.value
                      ? 'bg-accent-500/20 text-accent-300'
                      : 'bg-white/[0.02] text-gray-500 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Results with Activity Sidebar */}
      <div className="flex gap-6">
      <div className="flex-1 min-w-0">
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ShimmerCard key={i} />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
            <PackageOpen className="w-8 h-8 text-gray-600" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2 tracking-tight">
            {auctions.length === 0 ? 'Be the First to Create a Private Auction' : 'No Matching Auctions'}
          </h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6 leading-relaxed">
            {auctions.length === 0
              ? 'The marketplace is ready. Create a sealed-bid, Dutch, English, or Vickrey auction and it will appear here.'
              : 'No auctions match your current filters. Try adjusting your search or create a new auction.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/create" className="btn-primary inline-flex items-center gap-2 text-sm !px-5 !py-2.5">
              <Plus className="w-4 h-4" />
              Create Auction
            </Link>
            {auctions.length === 0 && (
              <button
                onClick={fetchAuctionsFromBackend}
                disabled={loading}
                className="btn-secondary inline-flex items-center gap-2 text-sm !px-5 !py-2.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Retry
              </button>
            )}
          </div>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {displayed.map((auction) => (
            <motion.div key={auction.auction_id} variants={fadeInUp}>
              <AuctionCard
                auction={auction}
                currentBlock={blockHeight}
                scheduledStart={scheduledMap[auction.auction_id]}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Count */}
      {displayed.length > 0 && (
        <p className="text-center text-gray-600 text-xs mt-6 font-mono">
          {displayed.length} of {auctions.length} auction{auctions.length !== 1 ? 's' : ''}
        </p>
      )}
      </div>

      {/* Activity Feed Sidebar — desktop only */}
      {auctions.length > 0 && (
        <div className="hidden xl:block w-72 shrink-0">
          <div className="sticky top-20">
            <ActivityFeedSidebar auctionIds={auctions.map(a => a.auction_id)} />
          </div>
        </div>
      )}
      </div>

      {/* Activity Feed — mobile */}
      {auctions.length > 0 && (
        <div className="xl:hidden mt-6">
          <ActivityFeedSidebar auctionIds={auctions.map(a => a.auction_id)} />
        </div>
      )}
    </div>
  )
}

/* -- Activity Pulse Bar ----------------------------------------- */

function ActivityPulse({ auctions }: { auctions: AuctionData[] }) {
  const activeCount = auctions.filter(a => a.status === STATUS.ACTIVE).length
  const totalBids = auctions.reduce((sum, a) => sum + a.bid_count, 0)

  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 mb-4">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Live indicator */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="absolute inset-0 h-2 w-2 rounded-full bg-green-400 animate-ping opacity-75" />
          </span>
          <span className="text-[10px] font-semibold text-green-400 uppercase tracking-widest">Live</span>
        </div>

        <div className="w-px h-4 bg-white/[0.06] hidden sm:block" />

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-accent-400" />
            <span className="text-white font-medium">{activeCount}</span> active
          </span>
          <span className="flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-cyan-400" />
            <span className="text-white font-medium">{totalBids}</span> sealed bids
          </span>
        </div>
      </div>
    </div>
  )
}
