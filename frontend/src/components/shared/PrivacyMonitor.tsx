import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Monitor, Eye, ShieldAlert } from 'lucide-react'
import { AUCTION_MODE, STATUS } from '@/types'

interface PrivacyMonitorProps {
  auctionId: string
  bidCount: number
  status: number
  auctionMode: number
  highestBid?: number
  itemName?: string
  deadline?: number
}

interface LogEntry {
  id: string
  text: string
  timestamp: number
}

const MODE_LABELS: Record<number, string> = {
  [AUCTION_MODE.FIRST_PRICE]: 'Sealed Bid',
  [AUCTION_MODE.VICKREY]: 'Vickrey (2nd Price)',
  [AUCTION_MODE.DUTCH]: 'Dutch Descending',
  [AUCTION_MODE.ENGLISH]: 'English Ascending',
}

const STATUS_LABELS: Record<number, string> = {
  [STATUS.ACTIVE]: 'ACTIVE',
  [STATUS.CLOSED]: 'CLOSED',
  [STATUS.REVEALING]: 'REVEAL',
  [STATUS.SETTLED]: 'SETTLED',
  [STATUS.CANCELLED]: 'CANCEL',
  [STATUS.FAILED]: 'FAILED',
  [STATUS.DISPUTED]: 'DISPUTE',
  [STATUS.EXPIRED]: 'EXPIRED',
}

/** Generate a fake commitment hash for animation */
function fakeCommitment(): string {
  const chars = '0123456789abcdef'
  let result = '0x'
  for (let i = 0; i < 4; i++) result += chars[Math.floor(Math.random() * chars.length)]
  result += '...'
  for (let i = 0; i < 4; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

/** Hidden data items that are never revealed */
const HIDDEN_ITEMS = [
  'Individual bid amounts',
  'Bidder identities',
  'Commitment nonces',
  'Reserve price',
  'Settlement amounts',
  'Bidder wallet links',
]

export default function PrivacyMonitor({
  auctionId,
  bidCount,
  status,
  auctionMode,
  highestBid,
  itemName,
  deadline,
}: PrivacyMonitorProps) {
  const [networkLogs, setNetworkLogs] = useState<LogEntry[]>([])
  const prevBidCount = useRef(bidCount)
  const logIdCounter = useRef(0)

  // Calculate remaining time
  const timeRemaining = useMemo(() => {
    if (!deadline || deadline <= 0) return 'N/A'
    // Rough estimate: 1 block ~ 15s on Aleo testnet
    const blocksLeft = deadline - Math.floor(Date.now() / 15000)
    if (blocksLeft <= 0) return 'Expired'
    const mins = Math.floor((blocksLeft * 15) / 60)
    if (mins > 1440) return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
    if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
    return `${mins}m`
  }, [deadline])

  // Truncate the auction ID for display
  const truncId = useMemo(() => {
    if (!auctionId) return '...'
    const clean = auctionId.replace('field', '')
    if (clean.length <= 12) return clean
    return `${clean.slice(0, 6)}...${clean.slice(-4)}`
  }, [auctionId])

  // When bid count changes, add a new log entry
  useEffect(() => {
    if (bidCount > prevBidCount.current) {
      const diff = bidCount - prevBidCount.current
      for (let i = 0; i < diff; i++) {
        const entry: LogEntry = {
          id: `log-${++logIdCounter.current}`,
          text: `New commitment: ${fakeCommitment()}`,
          timestamp: Date.now(),
        }
        setNetworkLogs((prev) => [entry, ...prev].slice(0, 8))
      }
    }
    prevBidCount.current = bidCount
  }, [bidCount])

  // Show the highest bid for English/Dutch modes (these are public by design)
  const showHighestBid =
    (auctionMode === AUCTION_MODE.ENGLISH || auctionMode === AUCTION_MODE.DUTCH) &&
    highestBid !== undefined &&
    highestBid > 0

  const formatLabel = MODE_LABELS[auctionMode] || 'Unknown'
  const statusCode = STATUS_LABELS[status] || `${status}`

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden"
      style={{ boxShadow: '0 0 20px rgba(6, 182, 212, 0.08)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.02]">
        <Monitor className="w-4 h-4 text-accent-400" />
        <h3 className="text-sm font-semibold text-white">Privacy Monitor</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
          </div>
          <span className="text-[10px] text-green-400 uppercase tracking-wider font-medium">Live</span>
        </div>
      </div>

      {/* Three columns (stacked on mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10">
        {/* Column 1: Network sees */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Eye className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
              Network sees
            </span>
          </div>

          <div className="space-y-2 font-mono text-xs text-zinc-500">
            <div className="flex justify-between">
              <span>auction_id</span>
              <span className="text-zinc-400">{truncId}</span>
            </div>
            <div className="flex justify-between">
              <span>bid_count</span>
              <span className="text-zinc-400">{bidCount}</span>
            </div>
            <div className="flex justify-between">
              <span>status</span>
              <span className="text-zinc-400">{statusCode}</span>
            </div>
            <div className="flex justify-between">
              <span>deadline</span>
              <span className="text-zinc-400">
                {deadline ? `#${deadline.toLocaleString()}` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Animated log entries */}
          <AnimatePresence>
            {networkLogs.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                {networkLogs.slice(0, 4).map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-[10px] font-mono text-zinc-600 truncate"
                  >
                    <span className="text-accent-500/60">+</span> {log.text}
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Column 2: You see */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Eye className="w-3.5 h-3.5 text-accent-400" />
            <span className="text-[10px] text-accent-400 uppercase tracking-wider font-medium">
              You see
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {itemName && (
              <div className="flex justify-between">
                <span className="text-gray-500">Item</span>
                <span className="text-white font-medium truncate ml-2">{itemName}</span>
              </div>
            )}
            {showHighestBid && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  {auctionMode === AUCTION_MODE.DUTCH ? 'Current price' : 'Highest bid'}
                </span>
                <span className="text-accent-300 font-mono">
                  {(highestBid! / 1000000).toFixed(2)} ALEO
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Time left</span>
              <span className="text-white">{timeRemaining}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Format</span>
              <span className="text-white">{formatLabel}</span>
            </div>
          </div>

          {/* Dynamic event */}
          <AnimatePresence>
            {bidCount > 0 && (
              <motion.div
                key={`event-${bidCount}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="mt-3 pt-3 border-t border-white/5"
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
                  <span className="text-[10px] text-accent-300">
                    {auctionMode === AUCTION_MODE.ENGLISH
                      ? `${bidCount} public bid${bidCount !== 1 ? 's' : ''} placed`
                      : `${bidCount} sealed bid${bidCount !== 1 ? 's' : ''} received`}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Column 3: Hidden from everyone */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">
              Hidden from everyone
            </span>
          </div>

          <div className="space-y-2">
            {HIDDEN_ITEMS.map((item, i) => (
              <div key={item} className="flex items-center gap-2">
                <Lock className="w-3 h-3 text-emerald-500/60 shrink-0" />
                <span className="text-xs text-gray-400 flex-1">{item}</span>
                {/* Animated redaction bar */}
                <div className="w-16 h-3 rounded bg-surface-800 overflow-hidden relative shrink-0">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      delay: i * 0.3,
                      ease: 'linear',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
