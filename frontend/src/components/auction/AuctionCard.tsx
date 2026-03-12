import { Link } from 'react-router-dom'
import { Clock, Users, Coins, Tag, ArrowUpRight } from 'lucide-react'
import {
  STATUS,
  STATUS_LABELS,
  STATUS_COLORS,
  AUCTION_MODE,
  TOKEN_TYPE,
  CATEGORY_LABELS,
  type AuctionData,
} from '@/types'
import { truncateId, blockHeightToTime } from '@/lib/aleo'

interface AuctionCardProps {
  auction: AuctionData
  currentBlock: number
}

export function AuctionCard({ auction, currentBlock }: AuctionCardProps) {
  const statusLabel = STATUS_LABELS[auction.status] || 'Unknown'
  const statusColor = STATUS_COLORS[auction.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  const categoryLabel = CATEGORY_LABELS[auction.category] || 'Other'
  const modeLabel = auction.auction_mode === AUCTION_MODE.VICKREY ? 'Vickrey' : 'First-Price'
  const isActive = auction.status === STATUS.ACTIVE
  const timeLeft = blockHeightToTime(auction.deadline, currentBlock)

  return (
    <Link
      to={`/auction/${auction.auction_id}`}
      className="card-hover cursor-pointer group relative overflow-hidden block"
    >
      {/* Subtle gradient accent at top */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${
        isActive
          ? 'from-green-500/60 to-accent-500/40'
          : auction.status === STATUS.REVEALING
          ? 'from-amber-500/60 to-yellow-500/40'
          : auction.status === STATUS.SETTLED
          ? 'from-blue-500/60 to-accent-500/40'
          : 'from-gray-500/30 to-gray-600/20'
      }`} />

      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          {auction.title ? (
            <h3 className="text-white font-semibold text-sm truncate group-hover:text-accent-400 transition-colors">
              {auction.title}
            </h3>
          ) : (
            <h3 className="text-gray-300 font-mono text-sm truncate group-hover:text-accent-400 transition-colors">
              {truncateId(auction.auction_id, 10)}
            </h3>
          )}
          <p className="text-xs text-gray-600 font-mono mt-0.5">
            {truncateId(auction.auction_id, 8)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className={`badge text-xs ${statusColor}`}>
            {statusLabel}
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-accent-400 transition-colors" />
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800/80 text-gray-400 text-xs">
          <Tag className="w-3 h-3" />
          {categoryLabel}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800/80 text-gray-400 text-xs">
          <Coins className="w-3 h-3" />
          {auction.token_type === TOKEN_TYPE.USDCX ? 'USDCx' : 'ALEO'}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs ${
          auction.auction_mode === AUCTION_MODE.VICKREY
            ? 'bg-brand-cyan/10 text-brand-cyan'
            : 'bg-surface-800/80 text-gray-400'
        }`}>
          {modeLabel}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between pt-3 border-t border-surface-700/50">
        <div className="flex items-center gap-1.5 text-gray-400 text-xs">
          <Users className="w-3.5 h-3.5" />
          <span>{auction.bid_count} bid{auction.bid_count !== 1 ? 's' : ''}</span>
        </div>
        {isActive && currentBlock > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span className={`font-medium ${
              timeLeft === 'Expired' ? 'text-red-400' : 'text-gray-300'
            }`}>
              {timeLeft}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}
