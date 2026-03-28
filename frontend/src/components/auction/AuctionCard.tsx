import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Users, Coins, Tag, ArrowUpRight, Percent } from 'lucide-react'
import {
  STATUS,
  STATUS_LABELS,
  STATUS_COLORS,
  AUCTION_MODE,
  TOKEN_TYPE,
  TOKEN_LABELS,
  CATEGORY_LABELS,
  type AuctionData,
} from '@/types'
import { truncateId, blockHeightToTime, fetchMapping } from '@/lib/aleo'
import PrivacyShield from '@/components/auction/PrivacyShield'
import PrivacyScore from '@/components/shared/PrivacyScore'
import ReputationBadge from '@/components/shared/ReputationBadge'

interface AuctionCardProps {
  auction: AuctionData
  currentBlock: number
  scheduledStart?: number
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
  const statusColor = STATUS_COLORS[auction.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  const categoryLabel = CATEGORY_LABELS[auction.category] || 'Other'
  const MODE_SHORT: Record<number, string> = {
    [AUCTION_MODE.FIRST_PRICE]: 'First-Price',
    [AUCTION_MODE.VICKREY]: 'Vickrey',
    [AUCTION_MODE.DUTCH]: 'Dutch',
    [AUCTION_MODE.ENGLISH]: 'English',
  }
  const modeLabel = MODE_SHORT[auction.auction_mode] || 'Unknown'
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
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800/80 text-gray-400 text-xs">
          <Tag className="w-3 h-3" />
          {categoryLabel}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800/80 text-gray-400 text-xs">
          <Coins className="w-3 h-3" />
          {TOKEN_LABELS[auction.token_type] || 'ALEO'}
        </span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs ${
          auction.auction_mode === AUCTION_MODE.VICKREY
            ? 'bg-brand-cyan/10 text-brand-cyan'
            : auction.auction_mode === AUCTION_MODE.DUTCH
            ? 'bg-orange-500/10 text-orange-400'
            : auction.auction_mode === AUCTION_MODE.ENGLISH
            ? 'bg-purple-500/10 text-purple-400'
            : 'bg-surface-800/80 text-gray-400'
        }`}>
          {modeLabel}
        </span>
        <PrivacyScore
          auctionMode={auction.auction_mode}
          tokenType={auction.token_type}
          isSettled={auction.status === STATUS.SETTLED}
          size="sm"
        />
        {royaltyBps !== null && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-purple-500/10 text-purple-400 text-[10px]">
            <Percent className="w-2.5 h-2.5" />
            {(royaltyBps / 100).toFixed(1)}% Royalty
          </span>
        )}
      </div>

      {/* Privacy badge — stopPropagation prevents Link navigation on click */}
      <div className="mb-3" onClick={(e) => e.stopPropagation()}>
        <PrivacyShield auctionMode={auction.auction_mode} status={auction.status} />
      </div>

      {/* Scheduled start banner */}
      {scheduledStart && currentBlock > 0 && scheduledStart > currentBlock && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-3 text-xs text-cyan-400">
          <Clock className="w-3 h-3" />
          Bidding opens in {blockHeightToTime(scheduledStart, currentBlock)}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between pt-3 border-t border-surface-700/50">
        <div className="flex items-center gap-2 text-gray-400 text-xs">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>{auction.bid_count} bid{auction.bid_count !== 1 ? 's' : ''}</span>
          </div>
          <ReputationBadge sellerHash={auction.seller_hash} size="sm" />
        </div>
        {isActive && currentBlock > 0 && !scheduledStart && (
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
