import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radio, Gavel, CheckCircle, ShoppingBag, Clock } from 'lucide-react'
import { fetchMapping, parseAuctionData, parseU64 } from '@/lib/aleo'
import { useBlockHeight } from '@/contexts/BlockHeightContext'

interface ActivityEvent {
  id: string
  message: string
  type: 'bid' | 'settled' | 'new_sale' | 'created'
  timestamp: number
}

interface ActivityFeedSidebarProps {
  auctionIds: string[]
}

function getTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const eventIcons = {
  bid: Gavel,
  settled: CheckCircle,
  new_sale: ShoppingBag,
  created: Radio,
}

const eventColors = {
  bid: 'text-accent-400 bg-accent-500/10',
  settled: 'text-green-400 bg-green-500/10',
  new_sale: 'text-purple-400 bg-purple-500/10',
  created: 'text-cyan-400 bg-cyan-500/10',
}

export default function ActivityFeedSidebar({ auctionIds }: ActivityFeedSidebarProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const prevBidCounts = useRef<Record<string, number>>({})
  const prevStatuses = useRef<Record<string, number>>({})
  const { blockHeight } = useBlockHeight()
  const eventCounter = useRef(0)

  const poll = useCallback(async () => {
    if (auctionIds.length === 0) return

    const sampled = auctionIds.slice(0, 10)
    const newEvents: ActivityEvent[] = []

    await Promise.allSettled(
      sampled.map(async (aId) => {
        const key = aId.endsWith('field') ? aId : `${aId}field`
        const raw = await fetchMapping('auctions', key)
        if (!raw) return

        const data = parseAuctionData(raw, aId)
        const shortId = aId.slice(0, 8)
        const prevCount = prevBidCounts.current[aId] ?? data.bid_count
        const prevStatus = prevStatuses.current[aId] ?? data.status

        if (data.bid_count > prevCount) {
          eventCounter.current++
          newEvents.push({
            id: `bid-${aId}-${eventCounter.current}`,
            message: `New sealed bid on Auction #${shortId}...`,
            type: 'bid',
            timestamp: Date.now(),
          })
        }

        if (data.status !== prevStatus) {
          if (data.status === 4) {
            eventCounter.current++
            newEvents.push({
              id: `settled-${aId}-${eventCounter.current}`,
              message: `Auction #${shortId}... settled`,
              type: 'settled',
              timestamp: Date.now(),
            })
          } else if (data.status === 1 && prevStatus === 0) {
            eventCounter.current++
            newEvents.push({
              id: `created-${aId}-${eventCounter.current}`,
              message: `Auction #${shortId}... is now active`,
              type: 'created',
              timestamp: Date.now(),
            })
          }
        }

        prevBidCounts.current[aId] = data.bid_count
        prevStatuses.current[aId] = data.status
      })
    )

    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, 20))
    }
  }, [auctionIds])

  useEffect(() => {
    // Initialize tracking data on first load
    if (auctionIds.length > 0 && Object.keys(prevBidCounts.current).length === 0) {
      poll()
    }
  }, [auctionIds, poll])

  useEffect(() => {
    if (auctionIds.length === 0) return
    const interval = setInterval(poll, 15000)
    return () => clearInterval(interval)
  }, [auctionIds, poll])

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-400 animate-ping" />
        </div>
        <h3 className="text-sm font-semibold text-white">Live Activity</h3>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-6">
          <Clock className="w-5 h-5 text-gray-600 mx-auto mb-2" />
          <p className="text-xs text-gray-600">Monitoring for activity...</p>
          <p className="text-[10px] text-gray-700 mt-1">Updates appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          <AnimatePresence initial={false}>
            {events.map((event) => {
              const Icon = eventIcons[event.type]
              const color = eventColors[event.type]
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: -12, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-start gap-2 p-2 rounded-lg bg-surface-800/40"
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${color}`}>
                    <Icon className="w-3 h-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-300 truncate">{event.message}</p>
                    <p className="text-[10px] text-gray-600">{getTimeAgo(event.timestamp)}</p>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
