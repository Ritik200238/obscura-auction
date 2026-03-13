import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { staggerContainer, fadeInUp } from '@/lib/animations'
import { Search, Filter, PackageOpen, RefreshCw, AlertTriangle, Plus, Shield, Coins, Radio } from 'lucide-react'
import { useAuctionStore } from '@/stores/auctionStore'
import { useBlockHeight } from '@/contexts/BlockHeightContext'
import { fetchMapping, parseAuctionData } from '@/lib/aleo'
import { config } from '@/lib/config'
import { AuctionCard } from '@/components/auction/AuctionCard'
import { ShimmerCard } from '@/components/shared/Shimmer'
import FaucetBanner from '@/components/shared/FaucetBanner'
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
]

const modeFilters = [
  { label: 'All Modes', value: null },
  { label: 'First-Price', value: AUCTION_MODE.FIRST_PRICE },
  { label: 'Vickrey', value: AUCTION_MODE.VICKREY },
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
      // No seed data — show empty state instead of fake auctions
      if (ids.length === 0) return

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
      const res = await fetch(`${config.backendApi}/api/auctions`)
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

  const displayed = filteredAuctions().filter((a) => {
    if (searchId.trim()) {
      return a.auction_id.toLowerCase().includes(searchId.trim().toLowerCase())
    }
    return true
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Browse Auctions</h1>
          <p className="text-gray-400">
            Discover active private auctions on Aleo. All bids are sealed until the reveal phase.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAuctionsFromBackend}
            disabled={loading}
            className="btn-secondary text-xs inline-flex items-center gap-2 py-2.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link to="/create" className="btn-primary text-xs inline-flex items-center gap-2 py-2.5">
            <Plus className="w-3.5 h-3.5" />
            Create Auction
          </Link>
        </div>
      </div>

      {/* Backend down banner */}
      {backendDown && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-300">
            Indexer is unavailable — showing cached auctions with live on-chain data.
            Use the on-chain lookup below to find auctions by ID directly.
          </p>
        </div>
      )}

      {/* Faucet banner */}
      <FaucetBanner />

      {/* Activity Pulse Bar */}
      {auctions.length > 0 && <ActivityPulse auctions={auctions} />}

      {/* Direct On-Chain Lookup — prominent */}
      <div className="glass-card p-5 mb-6 glow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-accent-400" />
          <h3 className="text-sm font-medium text-white">On-Chain Auction Lookup</h3>
          <span className="text-[10px] text-gray-600 ml-1">Reads directly from Aleo blockchain</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="Paste auction_id field hash..."
            className="input-field flex-1 font-mono text-sm min-w-0"
            onKeyDown={(e) => e.key === 'Enter' && handleDirectLookup()}
          />
          <button onClick={handleDirectLookup} className="btn-primary text-sm px-5 whitespace-nowrap shrink-0">
            Look Up
          </button>
        </div>
        {lookupError && <p className="text-xs text-red-400 mt-2">{lookupError}</p>}
      </div>

      {/* Search and Filters */}
      <div className="card mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
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
            <Filter className="w-4 h-4 text-gray-500 hidden sm:block" />

            {/* Status filter */}
            <div className="flex rounded-lg overflow-x-auto border border-surface-700 max-w-full">
              {statusFilters.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setFilters({ status: f.value })}
                  className={`px-3 py-2 sm:py-1.5 text-xs font-medium transition-colors min-h-[36px] whitespace-nowrap ${
                    filters.status === f.value
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Token filter */}
            <select
              value={filters.tokenType ?? ''}
              onChange={(e) =>
                setFilters({ tokenType: e.target.value ? Number(e.target.value) : null })
              }
              className="bg-surface-800 border border-surface-700 text-gray-300 text-xs rounded-lg px-3 py-2 sm:py-1.5 min-h-[36px] focus:outline-none focus:border-accent-500"
            >
              {tokenFilters.map((f) => (
                <option key={f.label} value={f.value ?? ''}>
                  {f.label}
                </option>
              ))}
            </select>

            {/* Mode filter */}
            <select
              value={filters.mode ?? ''}
              onChange={(e) =>
                setFilters({ mode: e.target.value ? Number(e.target.value) : null })
              }
              className="bg-surface-800 border border-surface-700 text-gray-300 text-xs rounded-lg px-3 py-2 sm:py-1.5 min-h-[36px] focus:outline-none focus:border-accent-500"
            >
              {modeFilters.map((f) => (
                <option key={f.label} value={f.value ?? ''}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ShimmerCard key={i} />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-500/20 to-accent-600/10 flex items-center justify-center mx-auto mb-5">
            <PackageOpen className="w-10 h-10 text-accent-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">
            {auctions.length === 0 ? 'Be the First to Create a Private Auction' : 'No Matching Auctions'}
          </h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
            {auctions.length === 0
              ? 'The marketplace is ready. Create a sealed-bid auction and your listing will appear here — fully private on Aleo.'
              : 'No auctions match your current filters. Try adjusting your search or create a new auction.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/create" className="btn-primary inline-flex items-center gap-2 text-sm px-6 py-3">
              <Plus className="w-4 h-4" />
              Create Auction
            </Link>
            {auctions.length === 0 && (
              <button
                onClick={fetchAuctionsFromBackend}
                disabled={loading}
                className="btn-secondary inline-flex items-center gap-2 text-sm px-6 py-3"
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
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Count */}
      {displayed.length > 0 && (
        <p className="text-center text-gray-600 text-xs mt-6">
          Showing {displayed.length} of {auctions.length} auction{auctions.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

/* ── Activity Pulse Bar ─────────────────────── */

function ActivityPulse({ auctions }: { auctions: AuctionData[] }) {
  const activeCount = auctions.filter(a => a.status === STATUS.ACTIVE).length
  const totalBids = auctions.reduce((sum, a) => sum + a.bid_count, 0)

  const totalBidsLabel = totalBids > 0 ? `${totalBids} sealed` : 'None'
  // Find most recent auction by created_at (if available from backend) or fallback
  const mostRecent = auctions.reduce((latest, a) => {
    const aTime = (a as any).created_at
    const lTime = (latest as any)?.created_at
    if (aTime && (!lTime || aTime > lTime)) return a
    return latest
  }, null as AuctionData | null)
  const lastActivity = mostRecent ? 'Recent' : 'No activity'

  const recentEvents = auctions.slice(0, 5).map(a => `Activity on "${a.title || 'Auction'}"`)

  return (
    <div className="card p-3 mb-4 overflow-hidden">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Live indicator */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-400 animate-ping" />
          </div>
          <span className="text-[10px] font-semibold text-green-400 uppercase tracking-widest">Live</span>
        </div>

        <div className="w-px h-4 bg-surface-700 hidden sm:block" />

        {/* Stats */}
        <div className="flex items-center gap-3 sm:gap-4 text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1">
            <Radio className="w-3 h-3 text-accent-400" />
            <span className="text-white font-medium">{activeCount}</span> active
          </span>
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-cyan-400" />
            <span className="text-white font-medium">{totalBids}</span> sealed bids
          </span>
          <span className="hidden sm:flex items-center gap-1">
            Last activity: <span className="text-white font-medium">{lastActivity}</span>
          </span>
          <span className="hidden md:flex items-center gap-1">
            <Coins className="w-3 h-3 text-accent-400" />
            Bids: <span className="text-white font-medium">{totalBidsLabel}</span>
          </span>
        </div>

        <div className="w-px h-4 bg-surface-700 hidden lg:block" />

        {/* Recent events ticker — 3 events visible */}
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-gray-500 flex-1 min-w-0 overflow-hidden">
          {recentEvents.slice(0, 3).map((evt, i) => (
            <span key={i} className="truncate">
              {i > 0 && <span className="text-surface-700 mx-1">&middot;</span>}
              {evt}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
