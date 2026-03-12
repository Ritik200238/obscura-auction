import { motion } from 'framer-motion'
import { staggerContainer, slideIn } from '@/lib/animations'

interface FeedEvent {
  id: string
  timestamp: string
  icon: string
  description: string
  type: 'bid' | 'phase' | 'settlement' | 'creation'
}

const borderColors: Record<FeedEvent['type'], string> = {
  bid: 'border-l-accent-500/60',
  phase: 'border-l-amber-500/60',
  settlement: 'border-l-green-500/60',
  creation: 'border-l-blue-500/60',
}

export default function ActivityFeed({ events }: { events: FeedEvent[] }) {
  return (
    <div className="glass rounded-2xl border border-surface-700/50 p-5 h-full">
      <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
      <motion.div
        className="space-y-2 max-h-80 overflow-y-auto pr-1"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {events.map(event => (
          <motion.div
            key={event.id}
            variants={slideIn}
            className={`flex items-start gap-3 p-3 rounded-xl bg-surface-900/60 border-l-2 ${borderColors[event.type]}`}
          >
            <span className="text-base shrink-0 mt-0.5">{event.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-300 leading-snug">{event.description}</p>
              <p className="text-[11px] text-gray-600 mt-1">{event.timestamp}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
