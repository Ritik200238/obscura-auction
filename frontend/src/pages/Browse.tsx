import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Loader2, PackageOpen, RefreshCw } from 'lucide-react'
import { useAuctionStore } from '@/stores/auctionStore'
import { fetchBlockHeight, fetchMapping, parseAuctionData } from '@/lib/aleo'
import { config } from '@/lib/config'
import { AuctionCard } from '@/components/auction/AuctionCard'
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
]

const modeFilters = [
  { label: 'All Modes', value: null },
  { label: 'First-Price', value: AUCTION_MODE.FIRST_PRICE },
  { label: 'Vickrey', value: AUCTION_MODE.VICKREY },
]

export default function Browse() {
  const { auctions, loading, filters, setFilters, filteredAuctions, setAuctions, setLoading } = useAuctionStore()
  const [searchId, setSearchId] = useState('')
  const [blockHeight, setBlockHeight] = useState(0)
  const [lookupId, setLookupId] = useState('')
  const [lookupError, setLookupError] = useState<string | null>(null)

  const fetchAuctionsFromBackend = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${config.backendApi}/api/auctions`)
      if (res.ok) {
        const data = await res.json()
        if (data.auctions && Array.isArray(data.auctions)) {
          // Enrich with on-chain data for each auction
          const enriched: AuctionData[] = []
          for (const a of data.auctions) {
            const key = a.auction_id?.endsWith('field') ? a.auction_id : `${a.auction_id}field`
            try {
              const raw = await fetchMapping('auctions', key)
              if (raw) {
                const onChain = parseAuctionData(raw, a.auction_id)
                enriched.push({
                  ...onChain,
                  title: a.title,
                  description: a.description,
                })
              } else {
                enriched.push({
                  auction_id: a.auction_id,
                  item_hash: '',
                  seller_hash: '',
                  category: 4,
                  token_type: a.token_type || 1,
                  auction_mode: 1,
                  status: 1,
                  deadline: a.deadline || 0,
                  reveal_deadline: 0,
                  bid_count: a.bid_count || 0,
                  reserve_price_hash: '',
                  created_at: 0,
                  dispute_deadline: 0,
                  title: a.title,
                  description: a.description,
                })
              }
            } catch {
              enriched.push({
                auction_id: a.auction_id,
                item_hash: '',
                seller_hash: '',
                category: 4,
                token_type: a.token_type || 1,
                auction_mode: 1,
                status: 1,
                deadline: a.deadline || 0,
                reveal_deadline: 0,
                bid_count: a.bid_count || 0,
                reserve_price_hash: '',
                created_at: 0,
                dispute_deadline: 0,
                title: a.title,
                description: a.description,
              })
            }
          }
          setAuctions(enriched)
        }
      }
    } catch {
      // Backend may not be running — that's OK, user can still look up by ID
    }
    setLoading(false)
  }, [setAuctions, setLoading])

  const handleDirectLookup = async () => {
    if (!lookupId.trim()) return
    setLookupError(null)
    const id = lookupId.trim()
    const key = id.endsWith('field') ? id : `${id}field`
    try {
      const raw = await fetchMapping('auctions', key)
      if (raw) {
        const auction = parseAuctionData(raw, id)
        // Navigate to auction detail
        window.location.href = `/auction/${id}`
      } else {
        setLookupError('Auction not found on-chain')
      }
    } catch {
      setLookupError('Failed to look up auction')
    }
  }

  useEffect(() => {
    fetchBlockHeight().then(setBlockHeight)
    fetchAuctionsFromBackend()
    const interval = setInterval(() => {
      fetchBlockHeight().then(setBlockHeight)
    }, 15000)
    return () => clearInterval(interval)
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Browse Auctions</h1>
        <p className="text-gray-400">
          Discover active private auctions on Aleo. All bids are sealed until the reveal phase.
        </p>
        <button
          onClick={fetchAuctionsFromBackend}
          disabled={loading}
          className="mt-3 btn-secondary text-xs inline-flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh from index
        </button>
      </div>

      {/* Direct On-Chain Lookup */}
      <div className="card mb-4">
        <h3 className="text-sm text-gray-400 mb-2">Look up auction by on-chain ID</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="Enter auction_id (field hash)"
            className="input-field flex-1 font-mono text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleDirectLookup()}
          />
          <button onClick={handleDirectLookup} className="btn-primary text-sm px-4 whitespace-nowrap">
            Look Up
          </button>
        </div>
        {lookupError && <p className="text-xs text-red-400 mt-1">{lookupError}</p>}
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
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="w-4 h-4 text-gray-500 hidden sm:block" />

            {/* Status filter */}
            <div className="flex rounded-lg overflow-hidden border border-surface-700">
              {statusFilters.map((f) => (
                <button
                  key={f.label}
                  onClick={() => setFilters({ status: f.value })}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
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
              className="bg-surface-800 border border-surface-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent-500"
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
              className="bg-surface-800 border border-surface-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent-500"
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
            <div key={i} className="card animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="h-4 w-32 shimmer-bg mb-2" />
                  <div className="h-3 w-20 shimmer-bg" />
                </div>
                <div className="h-5 w-16 shimmer-bg rounded-full" />
              </div>
              <div className="flex gap-2 mb-4">
                <div className="h-5 w-14 shimmer-bg rounded-lg" />
                <div className="h-5 w-12 shimmer-bg rounded-lg" />
              </div>
              <div className="pt-3 border-t border-surface-700/50 flex justify-between">
                <div className="h-3 w-16 shimmer-bg" />
                <div className="h-3 w-20 shimmer-bg" />
              </div>
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mb-4">
            <PackageOpen className="w-8 h-8 text-gray-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-300 mb-1">No auctions found</h3>
          <p className="text-gray-500 text-sm mb-4">
            {auctions.length === 0
              ? 'No indexed auctions yet. Use the on-chain lookup above to find auctions by ID, or create your own.'
              : 'No auctions match your current filters. Try adjusting your search.'}
          </p>
          {auctions.length === 0 && (
            <a href="/create" className="btn-primary text-sm inline-flex items-center gap-2">
              Create First Auction
            </a>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((auction) => (
            <AuctionCard
              key={auction.auction_id}
              auction={auction}
              currentBlock={blockHeight}
            />
          ))}
        </div>
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
