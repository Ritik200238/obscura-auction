import { motion } from 'framer-motion'
import { fadeInUp } from '@/lib/animations'
import StatsCards from '@/components/dashboard/StatsCards'
import ActivityChart from '@/components/dashboard/ActivityChart'
import VickreySavingsChart from '@/components/dashboard/VickreySavingsChart'
import PrivacyCoverage from '@/components/dashboard/PrivacyCoverage'
import ActivityFeed from '@/components/dashboard/ActivityFeed'
import { BarChart3 } from 'lucide-react'

// ── Demo data ─────────────────────────────────
// Replace these with real API/Supabase calls when backend is connected.

const STATS = {
  totalAuctions: 24,
  activeBids: 12,
  totalVolume: 4_850,
  vickreySavings: 725,
}

const ACTIVITY_7D = [
  { day: 'Mon', auctions: 3, bids: 8 },
  { day: 'Tue', auctions: 5, bids: 12 },
  { day: 'Wed', auctions: 2, bids: 6 },
  { day: 'Thu', auctions: 7, bids: 18 },
  { day: 'Fri', auctions: 4, bids: 14 },
  { day: 'Sat', auctions: 6, bids: 22 },
  { day: 'Sun', auctions: 3, bids: 9 },
]

const VICKREY_SAVINGS = [
  { auction: '#1', winningBid: 500, secondPrice: 380, savings: 120 },
  { auction: '#2', winningBid: 250, secondPrice: 200, savings: 50 },
  { auction: '#3', winningBid: 1200, secondPrice: 950, savings: 250 },
  { auction: '#4', winningBid: 800, secondPrice: 650, savings: 150 },
  { auction: '#5', winningBid: 350, secondPrice: 280, savings: 70 },
  { auction: '#6', winningBid: 600, secondPrice: 515, savings: 85 },
]

const PRIVACY = [
  { name: 'Hidden', value: 97, color: '#7c3aed' },
  { name: 'Visible', value: 3, color: '#4b5563' },
]

const EVENTS = [
  { id: '1', timestamp: '2m ago', icon: '\u{1F512}', description: 'New sealed bid on Auction #12 — amount hidden by BHP256', type: 'bid' as const },
  { id: '2', timestamp: '15m ago', icon: '\u{1F4E2}', description: 'Auction #8 entering reveal phase — bidders have 12h to reveal', type: 'phase' as const },
  { id: '3', timestamp: '1h ago', icon: '\u2705', description: 'Vickrey settlement: Winner saved 25 ALEO via second-price', type: 'settlement' as const },
  { id: '4', timestamp: '2h ago', icon: '\u{1F512}', description: 'New sealed bid on Auction #11 — privacy preserved', type: 'bid' as const },
  { id: '5', timestamp: '3h ago', icon: '\u{1F3D7}\uFE0F', description: 'New auction created: "Rare Leo NFT" — Vickrey mode, ALEO token', type: 'creation' as const },
  { id: '6', timestamp: '5h ago', icon: '\u2705', description: 'Vickrey settlement: Winner saved 85 ALEO on Auction #7', type: 'settlement' as const },
  { id: '7', timestamp: '6h ago', icon: '\u{1F4E2}', description: 'Auction #6 finalized — all refunds processed', type: 'phase' as const },
  { id: '8', timestamp: '8h ago', icon: '\u{1F512}', description: 'New sealed bid on Auction #9 — 4th bidder joins', type: 'bid' as const },
]

const totalSavings = VICKREY_SAVINGS.reduce((s, d) => s + d.savings, 0)

// ── Page ──────────────────────────────────────

export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500/20 to-cyan-500/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Analytics</h1>
            <p className="text-sm text-gray-500">Platform overview & Vickrey auction insights</p>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="mb-6">
        <StatsCards data={STATS} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <motion.div variants={fadeInUp} initial="hidden" animate="visible" transition={{ delay: 0.2 }}>
          <ActivityChart data={ACTIVITY_7D} />
        </motion.div>
        <motion.div variants={fadeInUp} initial="hidden" animate="visible" transition={{ delay: 0.3 }}>
          <VickreySavingsChart data={VICKREY_SAVINGS} totalSavings={totalSavings} />
        </motion.div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={fadeInUp} initial="hidden" animate="visible" transition={{ delay: 0.4 }}>
          <PrivacyCoverage data={PRIVACY} />
        </motion.div>
        <motion.div variants={fadeInUp} initial="hidden" animate="visible" transition={{ delay: 0.5 }} className="lg:col-span-2">
          <ActivityFeed events={EVENTS} />
        </motion.div>
      </div>
    </div>
  )
}
