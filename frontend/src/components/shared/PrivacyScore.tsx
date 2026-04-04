import { useMemo } from 'react'
import { Shield } from 'lucide-react'
import { AUCTION_MODE } from '@/types'

interface PrivacyScoreProps {
  /** Auction mode constant — use this OR auctionMode (for backward compat) */
  mode?: number
  /** @deprecated Use `mode` instead */
  auctionMode?: number
  /** @deprecated No longer affects grade calculation */
  tokenType?: number
  /** @deprecated No longer affects grade calculation */
  isSettled?: boolean
  /** @deprecated No longer affects grade calculation */
  isRevealed?: boolean
  size?: 'sm' | 'md' | 'lg'
}

interface GradeInfo {
  grade: string
  color: string
  bgColor: string
  tooltip: string
}

/** Grade definitions by auction mode */
function getGradeInfo(mode: number): GradeInfo {
  switch (mode) {
    case AUCTION_MODE.FIRST_PRICE:
      return {
        grade: 'A+',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-400/10 border-emerald-400/20',
        tooltip:
          'A+ \u2014 Bids sealed with BHP256 commitments. No tokens move during bidding. Identity never on-chain.',
      }
    case AUCTION_MODE.VICKREY:
      return {
        grade: 'A+',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-400/10 border-emerald-400/20',
        tooltip:
          'A+ \u2014 Same as sealed-bid plus second-price fairness. Winner pays 2nd price, hiding true willingness to pay.',
      }
    case AUCTION_MODE.CANDLE:
      return {
        grade: 'A+',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-400/10 border-emerald-400/20',
        tooltip:
          'A+ \u2014 Sealed bids plus random end time. Prevents timing attacks and last-second sniping entirely.',
      }
    case AUCTION_MODE.REVERSE:
      return {
        grade: 'A+',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-400/10 border-emerald-400/20',
        tooltip:
          'A+ \u2014 Sealed bids, lowest wins. Bid amounts and seller identities hidden until settlement.',
      }
    case AUCTION_MODE.BLIND_DUTCH:
      return {
        grade: 'A+',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-400/10 border-emerald-400/20',
        tooltip:
          'A+ \u2014 Sealed bids with hidden descending price. Nobody sees the current price or other bids.',
      }
    case AUCTION_MODE.BUNDLE:
      return {
        grade: 'A',
        color: 'text-green-400',
        bgColor: 'bg-green-400/10 border-green-400/20',
        tooltip:
          'A \u2014 Sealed bids with commit-reveal. Item hashes are public but amounts and identities are private.',
      }
    case AUCTION_MODE.MULTI_UNIT:
      return {
        grade: 'A',
        color: 'text-green-400',
        bgColor: 'bg-green-400/10 border-green-400/20',
        tooltip:
          'A \u2014 Sealed bids with private amounts. Unit configuration is public but bid details are hidden.',
      }
    case AUCTION_MODE.TIMED_ESCALATION:
      return {
        grade: 'B+',
        color: 'text-teal-400',
        bgColor: 'bg-teal-400/10 border-teal-400/20',
        tooltip:
          'B+ \u2014 Bid amounts visible on-chain but bidder identity is hashed. Auto-incrementing price is public.',
      }
    case AUCTION_MODE.ENGLISH:
      return {
        grade: 'B+',
        color: 'text-teal-400',
        bgColor: 'bg-teal-400/10 border-teal-400/20',
        tooltip:
          'B+ \u2014 Open ascending bids. Amounts public by design but bidder identity is hashed on-chain.',
      }
    case AUCTION_MODE.DUTCH:
      return {
        grade: 'B',
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-400/10 border-cyan-400/20',
        tooltip:
          'B \u2014 Price publicly descending each block. Buyer identity exposed at purchase time.',
      }
    default:
      return {
        grade: 'B',
        color: 'text-cyan-400',
        bgColor: 'bg-cyan-400/10 border-cyan-400/20',
        tooltip: 'B \u2014 Standard privacy protections.',
      }
  }
}

export default function PrivacyScore({
  mode,
  auctionMode,
  size = 'sm',
}: PrivacyScoreProps) {
  const resolvedMode = mode ?? auctionMode ?? AUCTION_MODE.FIRST_PRICE

  const gradeInfo = useMemo(() => getGradeInfo(resolvedMode), [resolvedMode])

  if (size === 'lg') {
    return (
      <div
        className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg border backdrop-blur-sm ${gradeInfo.bgColor}`}
        title={gradeInfo.tooltip}
      >
        <Shield className={`w-5 h-5 ${gradeInfo.color}`} />
        <div className="flex flex-col">
          <span className={`text-sm font-bold leading-tight ${gradeInfo.color}`}>
            {gradeInfo.grade}
          </span>
          <span className="text-[11px] text-gray-400 leading-snug max-w-[240px]">
            {gradeInfo.tooltip.split(' \u2014 ')[1]}
          </span>
        </div>
      </div>
    )
  }

  // sm (default) -- compact badge ~20px tall
  return (
    <div
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border backdrop-blur-sm ${gradeInfo.bgColor}`}
      title={gradeInfo.tooltip}
    >
      <Shield className={`w-3 h-3 ${gradeInfo.color}`} />
      <span className={`text-[10px] font-bold ${gradeInfo.color}`}>
        {gradeInfo.grade}
      </span>
    </div>
  )
}
