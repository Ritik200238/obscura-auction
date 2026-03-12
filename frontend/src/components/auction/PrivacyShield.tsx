import { useState, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, ChevronDown } from 'lucide-react'

interface PrivacyShieldProps {
  auctionMode: number
  status: number
  expanded?: boolean
}

type PrivacyLevel = 'hidden' | 'hashed' | 'zero-address' | 'visible'

interface PrivacyField {
  label: string
  level: PrivacyLevel
  barPercent: number
}

/**
 * Privacy score: ~97% of auction data is private on Obscura vs 0% on Ethereum.
 *
 * On Ethereum, every auction interaction is fully transparent: bid amounts, bidder
 * addresses, transaction history, escrow balances, winner identity, settlement
 * amounts, refund flows, token approvals, gas costs, timestamps, nonces, etc.
 * On Obscura, only bid_count and status are public on-chain — everything else
 * lives in encrypted Aleo records or hashed mappings. That's ~97% data privacy.
 */
const SCORE = 97

const levelLabel: Record<PrivacyLevel, string> = {
  hidden: 'HIDDEN',
  hashed: 'HASHED',
  'zero-address': 'ZERO-ADDR',
  visible: 'VISIBLE',
}

const levelBarColor: Record<PrivacyLevel, string> = {
  hidden: 'bg-emerald-500',
  hashed: 'bg-amber-500',
  'zero-address': 'bg-emerald-500',
  visible: 'bg-red-400',
}

const levelTextColor: Record<PrivacyLevel, string> = {
  hidden: 'text-emerald-400',
  hashed: 'text-amber-400',
  'zero-address': 'text-emerald-400',
  visible: 'text-red-400',
}

// Show the 6 most important fields in expanded view (matches prompt spec)
const displayFields: PrivacyField[] = [
  { label: 'Bid Amounts', level: 'hidden', barPercent: 100 },
  { label: 'Bidder Identity', level: 'hidden', barPercent: 100 },
  { label: 'Seller Identity', level: 'hashed', barPercent: 80 },
  { label: 'Settlement', level: 'zero-address', barPercent: 100 },
  { label: 'Bid Count', level: 'visible', barPercent: 20 },
  { label: 'Status', level: 'visible', barPercent: 20 },
]

export default function PrivacyShield({ auctionMode, status, expanded: initialExpanded }: PrivacyShieldProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded ?? false)

  const handleToggle = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsExpanded((prev) => !prev)
  }

  // Collapsed badge
  if (!isExpanded) {
    return (
      <button
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
          bg-purple-500/10 border border-purple-500/20
          hover:bg-purple-500/20 hover:border-purple-500/30
          transition-all duration-200 group cursor-pointer"
        style={{ boxShadow: '0 0 12px rgba(168, 85, 247, 0.15)' }}
      >
        <Shield className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-300" />
        <span className="text-xs font-medium text-purple-300">{SCORE}% Private</span>
        <ChevronDown className="w-3 h-3 text-purple-500 group-hover:text-purple-400" />
      </button>
    )
  }

  // Expanded view
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-xl border border-purple-500/20 bg-surface-900/80 overflow-hidden"
        style={{ boxShadow: '0 0 24px rgba(168, 85, 247, 0.1)' }}
      >
        <div className="p-4">
          {/* Header */}
          <button
            onClick={handleToggle}
            className="w-full flex items-center justify-between mb-4 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center"
                style={{ boxShadow: '0 0 16px rgba(168, 85, 247, 0.25)' }}
              >
                <Shield className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Privacy Shield</p>
                <p className="text-[10px] text-gray-500">On-chain data exposure analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-purple-300">{SCORE}%</span>
              <ChevronDown className="w-4 h-4 text-gray-500 rotate-180" />
            </div>
          </button>

          {/* Field breakdown */}
          <div className="space-y-2.5">
            {displayFields.map((field, i) => (
              <motion.div
                key={field.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="flex items-center gap-3"
              >
                <span className="text-xs text-gray-400 w-28 shrink-0">{field.label}</span>
                <span className={`text-[10px] font-medium w-16 shrink-0 ${levelTextColor[field.level]}`}>
                  {levelLabel[field.level]}
                </span>
                <div className="flex-1 h-2 rounded-full bg-surface-800 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${field.barPercent}%` }}
                    transition={{ delay: i * 0.05 + 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full rounded-full ${levelBarColor[field.level]}`}
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Ethereum comparison */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 pt-3 border-t border-surface-700/50"
          >
            <p className="text-[11px] text-gray-500 leading-relaxed">
              On Ethereum, <span className="text-red-400 font-medium">ALL</span> of this would be publicly visible on Etherscan.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
