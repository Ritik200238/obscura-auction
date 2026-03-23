import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { fadeInUp } from '@/lib/animations'
import { Search, BarChart3, Loader2, Activity, TrendingUp, Gavel, Shield, ExternalLink, RefreshCw } from 'lucide-react'
import { config } from '@/lib/config'
import { STATUS, AUCTION_MODE, STATUS_LABELS, MODE_LABELS, TOKEN_LABELS } from '@/types'
import { fetchMapping, parseAuctionData } from '@/lib/aleo'
import type { AuctionData } from '@/types'
import StatusBadge from '@/components/shared/StatusBadge'
import ModeBadge from '@/components/shared/ModeBadge'
import TokenBadge from '@/components/shared/TokenBadge'
import FaucetBanner from '@/components/shared/FaucetBanner'

interface Stats {
  total_auctions: number
  total_bids: number
  active_auctions: number
  settled_auctions: number
}

export default function Explorer() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [auctions, setAuctions] = useState<AuctionData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchId, setSearchId] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsRes, auctionsRes] = await Promise.all([
        fetch(`${config.backendApi}/api/stats/overview`),
        fetch(`${config.backendApi}/api/auctions?limit=20`),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (auctionsRes.ok) {
        const data = await auctionsRes.json()
        if (data.auctions) {
          const enriched = await Promise.all(
            data.auctions.slice(0, 12).map(async (a: any) => {
              const key = `${a.auction_id}field`
              const raw = await fetchMapping('auctions', key).catch(() => null)
              if (raw) return { ...parseAuctionData(raw, a.auction_id), title: a.title }
              return null
            })
          )
          setAuctions(enriched.filter((a): a is AuctionData => a !== null))
        }
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const modeCount = (mode: number) => auctions.filter(a => a.auction_mode === mode).length
  const tokenCount = (token: number) => auctions.filter(a => a.token_type === token).length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <FaucetBanner />

      {/* Header */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-accent-500/10 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Auction Intelligence</h1>
              <p className="text-xs sm:text-sm text-gray-500">Real-time on-chain analytics for Obscura</p>
            </div>
          </div>
          <button onClick={fetchData} disabled={loading} className="btn-secondary text-xs inline-flex items-center gap-2 py-2.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && searchId.trim()) window.location.href = `/auction/${searchId.trim()}` }}
            placeholder="Search by auction ID..."
            className="input-field pl-10 text-sm"
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Live Auctions', value: stats?.active_auctions ?? 0, icon: Activity, color: 'text-green-400', bg: 'from-green-500/20 to-green-600/10' },
          { label: 'Total Bids', value: stats?.total_bids ?? 0, icon: Gavel, color: 'text-cyan-400', bg: 'from-cyan-500/20 to-cyan-600/10' },
          { label: 'Settled', value: stats?.settled_auctions ?? 0, icon: Shield, color: 'text-blue-400', bg: 'from-blue-500/20 to-blue-600/10' },
          { label: 'Total Auctions', value: stats?.total_auctions ?? 0, icon: BarChart3, color: 'text-accent-400', bg: 'from-accent-500/20 to-accent-600/10' },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            className="glass rounded-2xl p-5 border border-surface-700/50"
          >
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${stat.bg} flex items-center justify-center shrink-0`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-bold font-mono text-white">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Distribution row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {/* Format distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">Format Distribution</h3>
          <div className="space-y-2">
            {[
              { mode: AUCTION_MODE.FIRST_PRICE, label: 'Sealed Bid', color: 'bg-gray-400' },
              { mode: AUCTION_MODE.VICKREY, label: 'Vickrey', color: 'bg-cyan-400' },
              { mode: AUCTION_MODE.DUTCH, label: 'Dutch', color: 'bg-orange-400' },
              { mode: AUCTION_MODE.ENGLISH, label: 'English', color: 'bg-purple-400' },
            ].map((m) => {
              const count = modeCount(m.mode)
              const pct = auctions.length > 0 ? (count / auctions.length) * 100 : 0
              return (
                <div key={m.mode} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-20">{m.label}</span>
                  <div className="flex-1 h-2 bg-surface-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${m.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Token distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">Token Distribution</h3>
          <div className="space-y-2">
            {[
              { token: 1, label: 'ALEO', color: 'bg-accent-400' },
              { token: 2, label: 'USDCx', color: 'bg-green-400' },
              { token: 3, label: 'USAD', color: 'bg-blue-400' },
            ].map((t) => {
              const count = tokenCount(t.token)
              const pct = auctions.length > 0 ? (count / auctions.length) * 100 : 0
              return (
                <div key={t.token} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-20">{t.label}</span>
                  <div className="flex-1 h-2 bg-surface-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${t.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Auction list */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Recent Auctions</h2>
        <Link to="/browse" className="text-xs text-accent-400 hover:text-accent-300">View all →</Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-accent-400 animate-spin" />
        </div>
      ) : auctions.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400">No auctions found. <Link to="/create" className="text-accent-400">Create one →</Link></p>
        </div>
      ) : (
        <div className="space-y-3">
          {auctions.map((auction) => {
            const phases = auction.auction_mode === AUCTION_MODE.DUTCH
              ? ['Created', 'Live', 'Sold']
              : auction.auction_mode === AUCTION_MODE.ENGLISH
              ? ['Created', 'Bidding', 'Settlement', 'Settled']
              : ['Created', 'Bidding', 'Revealing', 'Settled']

            const currentPhase = auction.status === STATUS.ACTIVE ? 1
              : auction.status === STATUS.REVEALING ? 2
              : auction.status === STATUS.SETTLED ? phases.length - 1
              : auction.status === STATUS.FAILED ? phases.length - 1
              : 0

            return (
              <Link
                key={auction.auction_id}
                to={`/auction/${auction.auction_id}`}
                className="block card hover:border-accent-500/30 transition-all group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-white truncate">{auction.title || `Auction #${auction.auction_id.slice(0, 8)}...`}</p>
                      <StatusBadge status={auction.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <ModeBadge mode={auction.auction_mode} />
                      <TokenBadge tokenType={auction.token_type} />
                      <span className="text-[10px] text-gray-600">{auction.bid_count} bids</span>
                    </div>
                  </div>

                  {/* Phase timeline */}
                  <div className="flex items-center gap-1">
                    {phases.map((phase, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${
                          i <= currentPhase ? 'bg-accent-400' : 'bg-surface-700'
                        }`} />
                        <span className={`text-[9px] ${i <= currentPhase ? 'text-gray-400' : 'text-gray-700'}`}>{phase}</span>
                        {i < phases.length - 1 && <div className={`w-4 h-px ${i < currentPhase ? 'bg-accent-400/50' : 'bg-surface-700'}`} />}
                      </div>
                    ))}
                  </div>

                  {/* Verify link */}
                  <ExternalLink className="w-4 h-4 text-gray-700 group-hover:text-accent-400 shrink-0 transition-colors" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
