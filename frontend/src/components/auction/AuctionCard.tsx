import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, Users, Coins, Tag, Shield, Percent } from 'lucide-react'
import {
  STATUS,
  STATUS_LABELS,
  AUCTION_MODE,
  TOKEN_TYPE,
  TOKEN_LABELS,
  CATEGORY_LABELS,
  type AuctionData,
} from '@/types'
import { truncateId, blockHeightToTime, fetchMapping } from '@/lib/aleo'
import ReputationBadge from '@/components/shared/ReputationBadge'

interface AuctionCardProps {
  auction: AuctionData
  currentBlock: number
  scheduledStart?: number
}

/** Mode chip color mapping */
const MODE_CHIP: Record<number, { bg: string; text: string; label: string }> = {
  [AUCTION_MODE.FIRST_PRICE]: { bg: 'bg-accent-500/10', text: 'text-accent-400', label: 'Sealed' },
  [AUCTION_MODE.VICKREY]: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Vickrey' },
  [AUCTION_MODE.DUTCH]: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Dutch' },
  [AUCTION_MODE.ENGLISH]: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'English' },
  [AUCTION_MODE.BUNDLE]: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'Bundle' },
  [AUCTION_MODE.MULTI_UNIT]: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Multi-Unit' },
  [AUCTION_MODE.CANDLE]: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Candle' },
  [AUCTION_MODE.REVERSE]: { bg: 'bg-rose-500/10', text: 'text-rose-400', label: 'Reverse' },
  [AUCTION_MODE.BLIND_DUTCH]: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', label: 'Blind Dutch' },
  [AUCTION_MODE.TIMED_ESCALATION]: { bg: 'bg-pink-500/10', text: 'text-pink-400', label: 'Escalation' },
}

/** Status dot + text color */
const STATUS_DOT: Record<number, { dot: string; text: string; pulse?: boolean }> = {
  [STATUS.ACTIVE]: { dot: 'bg-green-400', text: 'text-green-400', pulse: true },
  [STATUS.CLOSED]: { dot: 'bg-yellow-400', text: 'text-yellow-400' },
  [STATUS.REVEALING]: { dot: 'bg-amber-400', text: 'text-amber-400', pulse: true },
  [STATUS.SETTLED]: { dot: 'bg-blue-400', text: 'text-blue-400' },
  [STATUS.CANCELLED]: { dot: 'bg-red-400', text: 'text-red-400' },
  [STATUS.FAILED]: { dot: 'bg-red-400', text: 'text-red-400' },
  [STATUS.DISPUTED]: { dot: 'bg-orange-400', text: 'text-orange-400' },
  [STATUS.EXPIRED]: { dot: 'bg-gray-400', text: 'text-gray-400' },
}

/** Privacy grade by mode */
function getPrivacyGrade(mode: number, tokenType: number): { grade: string; color: string } {
  let base: { grade: string; color: string }
  switch (mode) {
    case AUCTION_MODE.VICKREY:
      base = { grade: 'A+', color: 'text-emerald-400' }
      break
    case AUCTION_MODE.FIRST_PRICE:
      base = { grade: 'A', color: 'text-green-400' }
      break
    case AUCTION_MODE.DUTCH:
      base = { grade: 'B+', color: 'text-teal-400' }
      break
    case AUCTION_MODE.ENGLISH:
      base = { grade: 'B', color: 'text-cyan-400' }
      break
    case AUCTION_MODE.BUNDLE:
      base = { grade: 'A', color: 'text-green-400' }
      break
    case AUCTION_MODE.MULTI_UNIT:
      base = { grade: 'B+', color: 'text-teal-400' }
      break
    default:
      base = { grade: 'B', color: 'text-cyan-400' }
  }
  // Stablecoin slight penalty
  if (tokenType === TOKEN_TYPE.USDCX || tokenType === TOKEN_TYPE.USAD) {
    if (base.grade === 'A+') return { grade: 'A', color: 'text-green-400' }
    if (base.grade === 'A') return { grade: 'B+', color: 'text-teal-400' }
  }
  return base
}

export function AuctionCard({ auction, currentBlock, scheduledStart }: AuctionCardProps) {
  const [royaltyBps, setRoyaltyBps] = useState<number | null>(null)
  useEffect(() => {
    const key = auction.auction_id.endsWith('field') ? auction.auction_id : `${auction.auction_id}field`
    fetchMapping('royalty_bps', key).then((raw) => {
      if (raw) {
        const val = parseInt(raw.replace(/u128\s*$/, '').trim(), 10)
        if (val > 0) setRoyaltyBps(val)
      }
    }).catch(() => {})
  }, [auction.auction_id])

  const statusLabel = STATUS_LABELS[auction.status] || 'Unknown'
  const statusStyle = STATUS_DOT[auction.status] || { dot: 'bg-gray-400', text: 'text-gray-400' }
  const modeChip = MODE_CHIP[auction.auction_mode] || { bg: 'bg-surface-800', text: 'text-gray-400', label: 'Unknown' }
  const categoryLabel = CATEGORY_LABELS[auction.category] || 'Other'
  const privacyGrade = getPrivacyGrade(auction.auction_mode, auction.token_type)
  const isActive = auction.status === STATUS.ACTIVE
  const timeLeft = blockHeightToTime(auction.deadline, currentBlock)

  return (
    <Link
      to={`/auction/${auction.auction_id}`}
      className="group relative block rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-[2px]"
    >
      {/* Gradient border on hover — done via a wrapper with padding trick */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent-500/0 via-cyan-500/0 to-accent-500/0 group-hover:from-accent-500/20 group-hover:via-cyan-500/10 group-hover:to-accent-500/20 transition-all duration-300 p-px">
        <div className="w-full h-full rounded-xl bg-surface-950" />
      </div>

      {/* Card content */}
      <div className="relative bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-5 group-hover:border-accent-500/20 transition-all duration-300">
        {/* Top: mode chip + privacy grade */}
        <div className="flex items-center justify-between mb-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide uppercase ${modeChip.bg} ${modeChip.text}`}>
            {modeChip.label}
          </span>
          <div
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]"
            title={`Privacy grade: ${privacyGrade.grade}`}
          >
            <Shield className={`w-3 h-3 ${privacyGrade.color}`} />
            <span className={`text-[10px] font-bold ${privacyGrade.color}`}>{privacyGrade.grade}</span>
          </div>
        </div>

        {/* Title */}
        <div className="mb-1">
          {auction.title ? (
            <h3 className="text-white font-semibold text-sm leading-snug group-hover:text-accent-300 transition-colors duration-200 truncate">
              {auction.title}
            </h3>
          ) : (
            <h3 className="text-gray-300 font-mono text-sm leading-snug group-hover:text-accent-300 transition-colors duration-200 truncate">
              {truncateId(auction.auction_id, 12)}
            </h3>
          )}
        </div>

        {/* Description preview */}
        {auction.description && (
          <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-2">
            {auction.description}
          </p>
        )}

        {/* Metadata chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-gray-400 text-[11px]">
            <Tag className="w-2.5 h-2.5" />
            {categoryLabel}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] text-gray-400 text-[11px]">
            <Coins className="w-2.5 h-2.5" />
            {TOKEN_LABELS[auction.token_type] || 'ALEO'}
          </span>
          {royaltyBps !== null && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[10px]">
              <Percent className="w-2.5 h-2.5" />
              {(royaltyBps / 100).toFixed(1)}%
            </span>
          )}
        </div>

        {/* Scheduled start banner */}
        {scheduledStart && currentBlock > 0 && scheduledStart > currentBlock && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-cyan-500/8 border border-cyan-500/15 mb-3 text-xs text-cyan-400">
            <Clock className="w-3 h-3" />
            Opens in {blockHeightToTime(scheduledStart, currentBlock)}
          </div>
        )}

        {/* Bottom: status + bids + time */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
          <div className="flex items-center gap-3">
            {/* Status with dot */}
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />
                {statusStyle.pulse && (
                  <span className={`absolute inset-0 h-2 w-2 rounded-full ${statusStyle.dot} animate-ping opacity-75`} />
                )}
              </span>
              <span className={`text-xs font-medium ${statusStyle.text}`}>{statusLabel}</span>
            </span>

            {/* Bid count */}
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="w-3 h-3" />
              {auction.bid_count}
            </span>

            <ReputationBadge sellerHash={auction.seller_hash} size="sm" />
          </div>

          {/* Time remaining */}
          {isActive && currentBlock > 0 && !scheduledStart && (
            <span className={`flex items-center gap-1 text-xs font-medium ${
              timeLeft === 'Expired' ? 'text-red-400' : 'text-gray-400'
            }`}>
              <Clock className="w-3 h-3" />
              {timeLeft}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
