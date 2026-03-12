import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import { STATUS } from '@/types'

interface AuctionStateMachineProps {
  currentStatus: number
}

interface StateNode {
  key: string
  label: string
  tooltip: string
}

const stateNodes: StateNode[] = [
  {
    key: 'created',
    label: 'Created',
    tooltip: 'Auction registered on-chain',
  },
  {
    key: 'active',
    label: 'Active',
    tooltip: 'Accepting sealed bids',
  },
  {
    key: 'sealed',
    label: 'Sealed',
    tooltip: 'Bidding closed, awaiting reveals',
  },
  {
    key: 'revealing',
    label: 'Revealing',
    tooltip: 'Bidders revealing their commitments',
  },
  {
    key: 'revealed',
    label: 'Revealed',
    tooltip: 'All bids revealed, ready for settlement',
  },
  {
    key: 'settling',
    label: 'Settling',
    tooltip: 'Vickrey price calculated, awaiting finalization',
  },
  {
    key: 'settled',
    label: 'Settled',
    tooltip: 'Winner determined, tokens transferred',
  },
  {
    key: 'claimed',
    label: 'Claimed',
    tooltip: 'All parties have claimed their records',
  },
]

/**
 * Map the actual on-chain STATUS enum to the 8-node visual index.
 * Some visual states (Revealed, Settling, Claimed) are conceptual —
 * the on-chain contract collapses them, but the UX shows the full lifecycle.
 */
function getActiveIndex(status: number): number {
  if (status === STATUS.ACTIVE) return 1
  if (status === STATUS.CLOSED) return 2
  if (status === STATUS.REVEALING) return 3
  // SETTLED maps to index 6 (the Revealed+Settling phases are passed)
  if (status === STATUS.SETTLED) return 7
  // Terminal states — dim everything
  if (status === STATUS.CANCELLED || status === STATUS.FAILED || status === STATUS.EXPIRED) return -1
  return 0
}

function getTerminalLabel(status: number): string | null {
  if (status === STATUS.CANCELLED) return 'Cancelled'
  if (status === STATUS.FAILED) return 'Failed'
  if (status === STATUS.EXPIRED) return 'Expired'
  return null
}

export default function AuctionStateMachine({ currentStatus }: AuctionStateMachineProps) {
  const [tooltipIndex, setTooltipIndex] = useState<number | null>(null)
  const activeIndex = getActiveIndex(currentStatus)
  const terminalLabel = getTerminalLabel(currentStatus)

  return (
    <div className="card relative overflow-hidden mb-6">
      {/* Accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 via-cyan-400 to-purple-500" />

      <div className="flex items-center gap-2 mb-5">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <h3 className="text-sm font-semibold text-white">Auction Lifecycle</h3>
        {terminalLabel && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
            {terminalLabel}
          </span>
        )}
      </div>

      {/* State machine — horizontal, scrollable on mobile */}
      <div className="flex items-start justify-between relative px-1 overflow-x-auto pb-2 -mx-1 scrollbar-hide" style={{ minWidth: 0 }}>
        {stateNodes.map((node, i) => {
          const isCompleted = activeIndex > i && activeIndex !== -1
          const isCurrent = activeIndex === i
          const isFuture = !isCompleted && !isCurrent

          return (
            <div key={node.key} className="flex items-start flex-1 min-w-0 last:flex-none">
              {/* Node + label */}
              <div className="flex flex-col items-center relative">
                <button
                  onClick={() => setTooltipIndex(tooltipIndex === i ? null : i)}
                  className="relative z-10 cursor-pointer focus:outline-none"
                >
                  <motion.div
                    initial={false}
                    animate={{
                      backgroundColor: isCompleted
                        ? 'rgb(168, 85, 247)'
                        : isCurrent
                        ? 'rgb(34, 211, 238)'
                        : 'rgb(55, 55, 70)',
                    }}
                    transition={{ duration: 0.5 }}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={
                      isCurrent
                        ? { boxShadow: '0 0 16px rgba(34, 211, 238, 0.4), 0 0 32px rgba(34, 211, 238, 0.15)' }
                        : isCompleted
                        ? { boxShadow: '0 0 8px rgba(168, 85, 247, 0.2)' }
                        : undefined
                    }
                  >
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5 text-white" />
                    ) : isCurrent ? (
                      <motion.div
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-2 h-2 rounded-full bg-white"
                      />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                    )}
                  </motion.div>
                </button>

                {/* Label */}
                <span
                  className={`text-[9px] mt-1.5 font-medium text-center whitespace-nowrap ${
                    isCurrent
                      ? 'text-cyan-400'
                      : isCompleted
                      ? 'text-purple-300'
                      : 'text-gray-600'
                  }`}
                >
                  {node.label}
                </span>

                {/* Tooltip */}
                <AnimatePresence>
                  {tooltipIndex === i && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-11 z-20 w-36 sm:w-44 p-2 sm:p-2.5 rounded-lg bg-surface-800 border border-surface-700 shadow-xl"
                      style={{
                        left: '50%',
                        transform: 'translateX(-50%)',
                        maxWidth: 'calc(100vw - 2rem)',
                      }}
                    >
                      <p className="text-[11px] text-gray-300 leading-relaxed">{node.tooltip}</p>
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-surface-800 border-l border-t border-surface-700 rotate-45" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Connector line */}
              {i < stateNodes.length - 1 && (
                <div className="flex-1 flex items-center pt-3.5 px-0.5">
                  {isCompleted ? (
                    /* Solid purple for completed segments */
                    <div className="w-full h-0.5 rounded-full relative overflow-hidden bg-surface-700">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-y-0 left-0 rounded-full bg-purple-500/60"
                      />
                    </div>
                  ) : isCurrent ? (
                    /* Half-filled for current → next */
                    <div className="w-full h-0.5 rounded-full relative overflow-hidden bg-surface-700">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '50%' }}
                        transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-y-0 left-0 rounded-full bg-cyan-400/40"
                      />
                    </div>
                  ) : (
                    /* Dashed gray for future segments */
                    <div
                      className="w-full h-0"
                      style={{
                        borderTop: '2px dashed rgb(75, 75, 90)',
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
