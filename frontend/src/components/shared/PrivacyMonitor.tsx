import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Lock, Unlock, Monitor, Eye, ShieldCheck } from 'lucide-react'
import { AUCTION_MODE, STATUS } from '@/types'
import PrivacyScore from '@/components/shared/PrivacyScore'

interface PrivacyMonitorProps {
  auctionMode: number
  status: number
  bidCount: number
  /** @deprecated Kept for backward compat with existing callsites */
  auctionId?: string
  /** @deprecated */
  highestBid?: number
  /** @deprecated */
  itemName?: string
  /** @deprecated */
  deadline?: number
}

/** Stagger animation for list items */
const containerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
}

/** Generate a truncated hash-like string for display */
function fakeHash(): string {
  const chars = '0123456789abcdef'
  let result = ''
  for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result + '...'
}

/** Items the network can see -- always public on-chain data */
function getNetworkItems(
  bidCount: number,
  status: number
) {
  const statusLabels: Record<number, string> = {
    [STATUS.ACTIVE]: '1 (ACTIVE)',
    [STATUS.CLOSED]: '2 (CLOSED)',
    [STATUS.REVEALING]: '3 (REVEALING)',
    [STATUS.SETTLED]: '4 (SETTLED)',
    [STATUS.CANCELLED]: '5 (CANCELLED)',
    [STATUS.FAILED]: '6 (FAILED)',
    [STATUS.DISPUTED]: '7 (DISPUTED)',
    [STATUS.EXPIRED]: '8 (EXPIRED)',
  }

  return [
    { label: 'auction_id', value: fakeHash() },
    { label: 'status', value: statusLabels[status] || `${status}` },
    { label: 'bid_count', value: `${bidCount}` },
    { label: 'seller_hash', value: fakeHash() },
    { label: 'reserve_hash', value: fakeHash() },
    { label: 'deadline', value: '#' + Math.floor(14000000 + Math.random() * 2000000).toLocaleString() },
  ]
}

interface HiddenItem {
  label: string
  locked: boolean
  note: string
}

/** Items that are hidden -- some unlock based on auction phase */
function getHiddenItems(
  auctionMode: number,
  status: number
): HiddenItem[] {
  const isRevealing = status === STATUS.REVEALING
  const isSettled = status === STATUS.SETTLED
  const isPostReveal = isRevealing || isSettled

  // For open formats (English, Dutch, Timed Escalation), bids are public by design
  const bidsPublic =
    auctionMode === AUCTION_MODE.ENGLISH ||
    auctionMode === AUCTION_MODE.DUTCH ||
    auctionMode === AUCTION_MODE.TIMED_ESCALATION

  return [
    {
      label: 'Bid amounts',
      locked: bidsPublic ? false : !isPostReveal,
      note: bidsPublic
        ? 'Public by design in this format'
        : isPostReveal
          ? 'Unlocked during reveal phase'
          : 'Until reveal',
    },
    {
      label: 'Bidder identities',
      locked: true,
      note: 'Never revealed on-chain',
    },
    {
      label: "Seller's real address",
      locked: true,
      note: 'Never revealed on-chain',
    },
    {
      label: 'Reserve price',
      locked: !isSettled,
      note: isSettled ? 'Revealed at settlement' : 'Until settlement',
    },
    {
      label: 'Winner identity',
      locked: !isSettled,
      note: isSettled ? 'Revealed at claim' : 'Until claim',
    },
    {
      label: 'Payment details',
      locked: true,
      note: 'Private records only',
    },
  ]
}

export default function PrivacyMonitor({
  auctionMode,
  status,
  bidCount,
}: PrivacyMonitorProps) {
  const networkItems = useMemo(() => getNetworkItems(bidCount, status), [bidCount, status])
  const hiddenItems = useMemo(() => getHiddenItems(auctionMode, status), [auctionMode, status])

  return (
    <div
      className="rounded-xl bg-white/[0.03] backdrop-blur-md border border-white/[0.06] overflow-hidden"
      style={{ boxShadow: '0 0 24px rgba(6, 182, 212, 0.06)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
        <Monitor className="w-4 h-4 text-accent-400" />
        <h3 className="text-sm font-semibold text-white tracking-tight">Privacy Monitor</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="absolute inset-0 h-2 w-2 rounded-full bg-green-400 animate-ping opacity-75" />
          </span>
          <span className="text-[10px] text-green-400 uppercase tracking-wider font-medium">Live</span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
        {/* LEFT: Network Sees */}
        <motion.div
          className="p-5"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center gap-1.5 mb-4">
            <Eye className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
              Network Sees
            </span>
          </div>

          <div className="space-y-2.5">
            {networkItems.map((item) => (
              <motion.div
                key={item.label}
                variants={itemVariants}
                className="flex items-center justify-between font-mono"
              >
                <div className="flex items-center gap-2">
                  <Unlock className="w-3 h-3 text-zinc-600 shrink-0" />
                  <span className="text-[11px] text-zinc-600">{item.label}</span>
                </div>
                <span className="text-[11px] text-zinc-500 tabular-nums">{item.value}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* RIGHT: Hidden From Everyone */}
        <motion.div
          className="p-5"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center gap-1.5 mb-4">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">
              Hidden From Everyone
            </span>
          </div>

          <div className="space-y-2.5">
            {hiddenItems.map((item) => (
              <motion.div
                key={item.label}
                variants={itemVariants}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  {item.locked ? (
                    <Lock className="w-3 h-3 text-emerald-500 shrink-0" />
                  ) : (
                    <Unlock className="w-3 h-3 text-zinc-600 shrink-0" />
                  )}
                  <span
                    className={`text-[11px] ${
                      item.locked ? 'text-emerald-300' : 'text-zinc-500'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
                <span
                  className={`text-[10px] italic ${
                    item.locked ? 'text-emerald-500/60' : 'text-zinc-600'
                  }`}
                >
                  {item.note}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom: Privacy grade badge */}
      <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.015] flex items-center gap-3">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
          Overall Grade
        </span>
        <PrivacyScore mode={auctionMode} size="sm" />
      </div>
    </div>
  )
}
