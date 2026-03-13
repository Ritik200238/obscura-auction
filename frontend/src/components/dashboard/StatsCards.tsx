import { motion } from 'framer-motion'
import { fadeInUp } from '@/lib/animations'
import { BarChart3, Gavel, Radio, CheckCircle } from 'lucide-react'

interface StatsData {
  totalAuctions: number
  activeBids: number
  activeAuctions: number
  settledAuctions: number
}

const cards = [
  {
    key: 'auctions',
    label: 'Total Auctions',
    field: 'totalAuctions' as const,
    format: (v: number) => v.toString(),
    icon: BarChart3,
    color: 'text-accent-400',
    bg: 'from-accent-500/20 to-accent-600/10',
  },
  {
    key: 'bids',
    label: 'Total Sealed Bids',
    field: 'activeBids' as const,
    format: (v: number) => v.toString(),
    icon: Gavel,
    color: 'text-cyan-400',
    bg: 'from-cyan-500/20 to-cyan-600/10',
  },
  {
    key: 'active',
    label: 'Active Auctions',
    field: 'activeAuctions' as const,
    format: (v: number) => v.toString(),
    icon: Radio,
    color: 'text-green-400',
    bg: 'from-green-500/20 to-green-600/10',
  },
  {
    key: 'settled',
    label: 'Settled Auctions',
    field: 'settledAuctions' as const,
    format: (v: number) => v.toString(),
    icon: CheckCircle,
    color: 'text-blue-400',
    bg: 'from-blue-500/20 to-blue-600/10',
  },
]

export default function StatsCards({ data }: { data: StatsData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: i * 0.1 }}
          className="glass rounded-2xl p-5 border border-surface-700/50"
        >
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.bg} flex items-center justify-center shrink-0`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{card.label}</p>
              <p className="text-2xl font-bold font-mono text-white">
                {card.format(data[card.field])}
              </p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
