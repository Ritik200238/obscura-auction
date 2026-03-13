import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { fadeInUp } from '@/lib/animations'
import StatsCards from '@/components/dashboard/StatsCards'
import ActivityFeed from '@/components/dashboard/ActivityFeed'
import { BarChart3, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { config } from '@/lib/config'

interface OverviewStats {
  total_auctions: number
  total_bids: number
  active_auctions: number
  settled_auctions: number
}

interface ActivityEvent {
  id: string
  auction_id: string
  event_type: string
  event_data: Record<string, unknown>
  created_at: string
}

function mapEventToFeed(event: ActivityEvent, index: number) {
  const typeMap: Record<string, { icon: string; type: 'bid' | 'phase' | 'settlement' | 'creation' }> = {
    auction_created: { icon: '\u{1F3D7}\uFE0F', type: 'creation' },
    bid_placed: { icon: '\u{1F512}', type: 'bid' },
    auction_updated: { icon: '\u{1F4E2}', type: 'phase' },
    auction_settled: { icon: '\u2705', type: 'settlement' },
  }

  const mapped = typeMap[event.event_type] || { icon: '\u{1F50D}', type: 'phase' as const }
  const auctionShort = event.auction_id ? event.auction_id.slice(0, 12) + '...' : ''
  const title = (event.event_data as any)?.title || ''

  let description = `${event.event_type.replace(/_/g, ' ')} — ${title || auctionShort}`
  if (event.event_type === 'bid_placed') {
    description = `New sealed bid on ${title || `Auction ${auctionShort}`}`
  } else if (event.event_type === 'auction_created') {
    description = `New auction created: "${title || auctionShort}"`
  } else if (event.event_type === 'auction_settled') {
    description = `Auction settled: "${title || auctionShort}"`
  }

  const ago = getTimeAgo(event.created_at)

  return {
    id: event.id || String(index),
    timestamp: ago,
    icon: mapped.icon,
    description,
    type: mapped.type,
  }
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function Dashboard() {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsRes, activityRes] = await Promise.all([
        fetch(`${config.backendApi}/api/stats/overview`),
        fetch(`${config.backendApi}/api/stats/activity?limit=20`),
      ])

      if (!statsRes.ok || !activityRes.ok) {
        throw new Error('Backend unavailable')
      }

      const statsData = await statsRes.json()
      const activityData = await activityRes.json()

      setStats(statsData)
      setEvents(Array.isArray(activityData.events) ? activityData.events : [])
    } catch {
      setError('Could not reach backend. Analytics require the indexer to be running.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const statsForCards = stats
    ? {
        totalAuctions: stats.total_auctions,
        activeBids: stats.total_bids,
        activeAuctions: stats.active_auctions,
        settledAuctions: stats.settled_auctions,
      }
    : { totalAuctions: 0, activeBids: 0, activeAuctions: 0, settledAuctions: 0 }

  const feedEvents = events.map(mapEventToFeed)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500/20 to-cyan-500/10 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-accent-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Analytics</h1>
              <p className="text-xs sm:text-sm text-gray-500">Live platform data from on-chain indexer</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="btn-secondary text-xs inline-flex items-center gap-2 py-2.5 w-full sm:w-auto justify-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </motion.div>

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-accent-400 animate-spin" />
          <span className="ml-3 text-gray-400">Loading analytics...</span>
        </div>
      ) : error ? (
        <div className="card text-center py-12">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Backend Unavailable</h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">{error}</p>
          <button onClick={fetchData} className="btn-primary text-sm">
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="mb-6">
            <StatsCards data={statsForCards} />
          </div>

          {/* Activity Feed */}
          {feedEvents.length > 0 ? (
            <motion.div variants={fadeInUp} initial="hidden" animate="visible" transition={{ delay: 0.3 }}>
              <ActivityFeed events={feedEvents} />
            </motion.div>
          ) : (
            <div className="card text-center py-8">
              <p className="text-gray-400 text-sm">
                No activity events yet. Create an auction and place bids to see activity here.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
