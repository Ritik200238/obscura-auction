import { useMemo } from 'react'
import { Shield } from 'lucide-react'
import { AUCTION_MODE, TOKEN_TYPE } from '@/types'

interface PrivacyScoreProps {
  auctionMode: number
  tokenType: number
  isSettled?: boolean
  isRevealed?: boolean
  size?: 'sm' | 'md' | 'lg'
}

interface GradeInfo {
  grade: string
  color: string
  glow: string
  description: string
}

const GRADE_MAP: Record<number, GradeInfo> = {
  5: {
    grade: 'A+',
    color: 'text-emerald-400',
    glow: '0 0 16px rgba(52, 211, 153, 0.4)',
    description: 'Maximum privacy: sealed bids, hidden identities, private settlement, second-price protection',
  },
  4: {
    grade: 'A',
    color: 'text-green-400',
    glow: '0 0 12px rgba(74, 222, 128, 0.3)',
    description: 'Excellent privacy: sealed bids, hidden identities, private settlement',
  },
  3: {
    grade: 'B+',
    color: 'text-teal-400',
    glow: '0 0 10px rgba(45, 212, 191, 0.25)',
    description: 'Good privacy: price visible but instant settlement, no bid history exposed',
  },
  2: {
    grade: 'B',
    color: 'text-cyan-400',
    glow: '0 0 8px rgba(34, 211, 238, 0.2)',
    description: 'Moderate privacy: bids public on-chain, ascending history visible',
  },
  1: {
    grade: 'C',
    color: 'text-amber-400',
    glow: '0 0 8px rgba(251, 191, 36, 0.2)',
    description: 'Limited privacy: significant on-chain data exposure',
  },
  0: {
    grade: 'F',
    color: 'text-red-400',
    glow: '0 0 8px rgba(248, 113, 113, 0.2)',
    description: 'No privacy: all auction data publicly visible',
  },
}

function calculateScore(
  auctionMode: number,
  tokenType: number,
  isSettled?: boolean,
  isRevealed?: boolean
): number {
  let score = 0

  switch (auctionMode) {
    case AUCTION_MODE.VICKREY:
      // Sealed bids + hidden identities + private settlement + selective disclosure + second-price hides willingness
      score = 5
      break
    case AUCTION_MODE.FIRST_PRICE:
      // Sealed bids + hidden identities + private settlement + selective disclosure
      score = 4
      break
    case AUCTION_MODE.DUTCH:
      // Price visible but no sealed bids needed, instant settlement
      score = 3
      break
    case AUCTION_MODE.ENGLISH:
      // Bids are public ascending
      score = 2
      break
    default:
      score = 2
  }

  // Post-settlement amount hidden bonus
  if (isSettled && !isRevealed) {
    score = Math.min(score + 1, 5)
  }

  // Stablecoin penalty (addresses more exposed for cross-chain tokens)
  if (tokenType === TOKEN_TYPE.USDCX || tokenType === TOKEN_TYPE.USAD) {
    score = Math.max(score - 1, 0)
  }

  return score
}

const SIZE_CONFIG = {
  sm: {
    container: 'gap-1 px-1.5 py-0.5',
    icon: 'w-3 h-3',
    text: 'text-[10px]',
    wrapper: 'inline-flex',
  },
  md: {
    container: 'gap-1.5 px-2 py-1',
    icon: 'w-3.5 h-3.5',
    text: 'text-xs',
    wrapper: 'inline-flex',
  },
  lg: {
    container: 'gap-2 px-3 py-1.5',
    icon: 'w-4 h-4',
    text: 'text-sm',
    wrapper: 'inline-flex',
  },
}

export default function PrivacyScore({
  auctionMode,
  tokenType,
  isSettled,
  isRevealed,
  size = 'sm',
}: PrivacyScoreProps) {
  const score = useMemo(
    () => calculateScore(auctionMode, tokenType, isSettled, isRevealed),
    [auctionMode, tokenType, isSettled, isRevealed]
  )

  const gradeInfo = GRADE_MAP[score] ?? GRADE_MAP[0]
  const sizeConfig = SIZE_CONFIG[size]

  return (
    <div
      className={`${sizeConfig.wrapper} items-center ${sizeConfig.container} rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm`}
      style={{ boxShadow: gradeInfo.glow }}
      title={gradeInfo.description}
    >
      <Shield className={`${sizeConfig.icon} ${gradeInfo.color}`} />
      <span className={`${sizeConfig.text} font-bold ${gradeInfo.color}`}>
        {gradeInfo.grade}
      </span>
    </div>
  )
}
