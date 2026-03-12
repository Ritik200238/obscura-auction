import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { fadeInUp, staggerContainer, scaleIn } from '@/lib/animations'
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Users,
  Hash,
  Activity,
  Play,
  XCircle,
  Trophy,
  Shield,
  Zap,
} from 'lucide-react'
import { useAuction } from '@/hooks/useAuction'
import { useRecords } from '@/hooks/useRecords'
import { useTransaction } from '@/hooks/useTransaction'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import {
  STATUS,
  CATEGORY_LABELS,
} from '@/types'
import {
  getPhase,
  formatTokenAmount,
  blockHeightToTime,
  truncateId,
  formatAleoAmount,
  fetchSettlementProof,
  fetchPaymentProof,
} from '@/lib/aleo'

import StatusBadge from '@/components/shared/StatusBadge'
import TokenBadge from '@/components/shared/TokenBadge'
import ModeBadge from '@/components/shared/ModeBadge'
import CountdownTimer from '@/components/shared/CountdownTimer'
import { ShimmerDetail } from '@/components/shared/Shimmer'
import BidPanel from '@/components/auction/BidPanel'
import RevealPanel from '@/components/auction/RevealPanel'
import ClaimPanel from '@/components/auction/ClaimPanel'
import RefundPanel from '@/components/auction/RefundPanel'
import SettlePanel from '@/components/auction/SettlePanel'
import PrivacyDashboard from '@/components/auction/PrivacyDashboard'
import PrivacyShield from '@/components/auction/PrivacyShield'
import AuctionStateMachine from '@/components/auction/AuctionStateMachine'
import AuctionReplay from '@/components/auction/AuctionReplay'
import TransactionLink from '@/components/shared/TransactionLink'
import AuctionQR from '@/components/shared/AuctionQR'
import FaucetBanner from '@/components/shared/FaucetBanner'

export default function AuctionDetail() {
  const { id } = useParams<{ id: string }>()
  const { auction, highestBid, secondHighest, winner, blockHeight, loading, error, refresh } =
    useAuction(id)
  const { refresh: refreshRecords } = useRecords()
  const { connected } = useWallet()
  const [settlementProof, setSettlementProof] = useState<string | null>(null)
  const [paymentProof, setPaymentProof] = useState<string | null>(null)
  const [showReplay, setShowReplay] = useState(false)

  useEffect(() => {
    if (connected) {
      refreshRecords()
    }
  }, [connected, refreshRecords])

  // Fetch on-chain proofs when auction is settled
  useEffect(() => {
    if (!auction || !id) return
    if (auction.status !== 4) return // STATUS_SETTLED only
    fetchSettlementProof(id).then(setSettlementProof)
    fetchPaymentProof(id).then(setPaymentProof)
  }, [auction, id])

  if (loading && !auction) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ShimmerDetail />
      </div>
    )
  }

  if (error && !auction) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="card text-center">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Auction Not Found</h2>
          <p className="text-gray-400 text-sm">{error}</p>
          <p className="text-gray-500 text-xs mt-4 font-mono">ID: {id}</p>
          <Link to="/browse" className="btn-secondary inline-flex items-center gap-2 mt-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Browse
          </Link>
        </div>
      </div>
    )
  }

  if (!auction) return null

  const phase = getPhase(auction.status)
  const categoryLabel = CATEGORY_LABELS[auction.category] || 'Other'
  const isActive = auction.status === STATUS.ACTIVE
  const isRevealing = auction.status === STATUS.REVEALING || auction.status === STATUS.CLOSED
  const isSettled = auction.status === STATUS.SETTLED
  const isFailed = auction.status === STATUS.FAILED
  const isCancelled = auction.status === STATUS.CANCELLED
  const isExpired = auction.status === STATUS.EXPIRED

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link to="/browse" className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Browse
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-gray-400 text-sm font-mono">{truncateId(auction.auction_id, 12)}</span>
      </div>

      {/* Animated state machine — prominent for judges */}
      <AuctionStateMachine currentStatus={auction.status} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <motion.div
          className="lg:col-span-2 space-y-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {/* Header card */}
          <motion.div variants={fadeInUp} className="card relative overflow-hidden">
            {/* Status accent line */}
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${
              isActive ? 'bg-gradient-to-r from-green-500 to-emerald-400' :
              isRevealing ? 'bg-gradient-to-r from-yellow-500 to-amber-400' :
              isSettled ? 'bg-gradient-to-r from-accent-500 to-purple-400' :
              'bg-gradient-to-r from-gray-600 to-gray-500'
            }`} />

            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <StatusBadge status={auction.status} />
                  <ModeBadge mode={auction.auction_mode} />
                  <span className="text-xs text-gray-500 bg-surface-800 px-2 py-0.5 rounded">{categoryLabel}</span>
                </div>
                <h1 className="text-2xl font-bold text-white">
                  {auction.title || 'Auction ' + truncateId(auction.auction_id, 8)}
                </h1>
                {auction.description && (
                  <p className="text-gray-400 text-sm mt-2 leading-relaxed">{auction.description}</p>
                )}
              </div>
              <button
                onClick={() => refresh()}
                className="text-gray-500 hover:text-accent-400 p-2 rounded-lg hover:bg-surface-800 transition-all shrink-0"
                title="Refresh auction data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <InfoCard icon={<TokenBadge tokenType={auction.token_type} />} label="Token" />
              <InfoCard
                icon={<Users className="w-4 h-4 text-accent-400" />}
                label="Bids"
                value={String(auction.bid_count)}
              />
              <InfoCard
                icon={<Clock className="w-4 h-4 text-gray-400" />}
                label="Deadline"
                value={blockHeightToTime(auction.deadline, blockHeight)}
              />
              <InfoCard
                icon={<Shield className="w-4 h-4 text-green-400" />}
                label="Privacy"
                value="ZK Sealed"
              />
            </div>

            {/* Anti-snipe notice — visible if deadline is past original estimate */}
            {isActive && auction.bid_count > 0 && (
              <div className="mt-3 flex items-center gap-2 px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
                <p className="text-xs text-gray-500">
                  Anti-sniping active — bids in the last ~10 min extend the deadline by ~10 min.
                  <span className="text-gray-600 ml-1">Block #{auction.deadline.toLocaleString()}</span>
                </p>
              </div>
            )}
          </motion.div>

          {/* Privacy Shield — expanded breakdown */}
          <motion.div variants={fadeInUp}>
            <PrivacyShield auctionMode={auction.auction_mode} status={auction.status} expanded />
          </motion.div>

          {/* Privacy Dashboard — the #1 differentiator */}
          <motion.div variants={fadeInUp}>
            <PrivacyDashboard status={auction.status} auctionMode={auction.auction_mode} />
          </motion.div>

          {/* Bid summary (post-reveal only) */}
          {(isSettled || isFailed || isRevealing) && (highestBid > 0n || secondHighest > 0n) && (
            <div className="card relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent-500 to-cyan-400" />
              <h3 className="text-sm text-gray-500 mb-4 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-accent-400" />
                Revealed Bid Summary
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-surface-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Highest Revealed Bid</p>
                  <p className="text-xl font-bold text-white">
                    {highestBid > 0n ? formatTokenAmount(highestBid, auction.token_type) : '--'}
                  </p>
                </div>
                <div className="bg-surface-800 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Second Highest</p>
                  <p className="text-xl font-bold text-white">
                    {secondHighest > 0n ? formatTokenAmount(secondHighest, auction.token_type) : '--'}
                  </p>
                </div>
              </div>
              {winner && (
                <div className="mt-4 pt-4 border-t border-surface-800">
                  <p className="text-xs text-gray-500 mb-1">Winner Hash</p>
                  <p className="text-sm text-accent-400 font-mono">{truncateId(winner, 16)}</p>
                </div>
              )}
            </div>
          )}

          {/* Proof of Fair Auction — shown after settlement */}
          {isSettled && (settlementProof || paymentProof) && (
            <div className="card border-green-500/20 bg-green-500/5">
              <div className="flex items-start gap-3 mb-3">
                <Shield className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-green-300">Proof of Fair Auction</h3>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                    These on-chain hashes cryptographically bind the auction outcome.
                    Any third party can recompute them to verify settlement integrity —
                    no party can retroactively alter the reported bids or winner.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {settlementProof && (
                  <div className="bg-surface-800 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 mb-1">
                      Settlement Proof · BHP256(auction_id, highest_bid, 2nd_bid, winner_hash, block)
                    </p>
                    <p className="text-xs text-green-400 font-mono break-all">{settlementProof}field</p>
                  </div>
                )}
                {paymentProof && (
                  <div className="bg-surface-800 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 mb-1">
                      Payment Commitment · commit.bhp256(amount, nonce_scalar) — hiding + binding
                    </p>
                    <p className="text-xs text-accent-400 font-mono break-all">{paymentProof}field</p>
                  </div>
                )}
              </div>

              {/* Explorer QR for settled auctions */}
              <div className="mt-3 pt-3 border-t border-surface-700/30">
                <AuctionQR
                  value={`https://testnet.aleoscan.io/program?id=obscura_v3.aleo`}
                  label="Verify on Explorer"
                  sublabel="Scan to verify this auction's settlement on Aleo Explorer"
                  size={100}
                />
              </div>
            </div>
          )}

          {/* Phase transition controls */}
          {isActive && blockHeight > auction.deadline && (
            <CloseBiddingCard auctionId={auction.auction_id} onSuccess={refresh} />
          )}

          {isActive && auction.bid_count === 0 && blockHeight <= auction.deadline && (
            <CancelAuctionCard auctionId={auction.auction_id} onSuccess={refresh} />
          )}

          {/* Phase-based action panels */}
          {isActive && blockHeight <= auction.deadline && (
            <motion.div variants={scaleIn}>
              <BidPanel auction={auction} />
            </motion.div>
          )}

          {isRevealing && (
            <>
              <motion.div variants={scaleIn}>
                <RevealPanel auction={auction} />
              </motion.div>
              {auction.reveal_deadline > 0 && blockHeight > auction.reveal_deadline && (
                <motion.div variants={scaleIn}>
                  <SettlePanel auction={auction} />
                </motion.div>
              )}
            </>
          )}

          {isSettled && (
            <>
              <motion.div variants={scaleIn}>
                <ClaimPanel
                  auction={auction}
                  highestBid={highestBid}
                  secondHighest={secondHighest}
                />
              </motion.div>
              <motion.div variants={scaleIn}>
                <RefundPanel auction={auction} />
              </motion.div>
              {showReplay ? (
                <motion.div variants={scaleIn}>
                  <AuctionReplay auction={auction} onClose={() => setShowReplay(false)} autoPlay />
                </motion.div>
              ) : (
                <motion.div variants={scaleIn}>
                  <button
                    onClick={() => setShowReplay(true)}
                    className="card w-full text-left flex items-center gap-3 hover:border-accent-500/30 transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-accent-500/20 flex items-center justify-center shrink-0">
                      <Play className="w-5 h-5 text-accent-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Watch Auction Replay</p>
                      <p className="text-xs text-gray-400">
                        See the complete auction lifecycle animated in 12 seconds
                      </p>
                    </div>
                  </button>
                </motion.div>
              )}
            </>
          )}

          {isFailed && (
            <motion.div variants={scaleIn}>
              <RefundPanel auction={auction} />
            </motion.div>
          )}

          {isCancelled && (
            <div className="card">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1">Auction Cancelled</h3>
                  <p className="text-gray-400 text-sm">
                    This auction was cancelled by the seller before settlement.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isExpired && (
            <div className="card">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-500/20 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1">Auction Expired</h3>
                  <p className="text-gray-400 text-sm">
                    This auction ended without receiving any valid bids.
                  </p>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Countdown */}
          {(isActive || isRevealing) && (
            <div className="card">
              <h3 className="text-sm text-gray-500 mb-3">
                {isActive ? 'Bidding Ends In' : 'Reveal Deadline'}
              </h3>
              <CountdownTimer
                targetBlock={isActive ? auction.deadline : auction.reveal_deadline}
              />
              {isActive && auction.reveal_deadline > 0 && (
                <div className="mt-4 pt-4 border-t border-surface-800">
                  <p className="text-xs text-gray-500 mb-1">Reveal Window</p>
                  <p className="text-sm text-white">{blockHeightToTime(auction.reveal_deadline, blockHeight)}</p>
                </div>
              )}
            </div>
          )}

          {/* Auction metadata */}
          <div className="card">
            <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-accent-400" />
              On-Chain Data
            </h3>
            <div className="space-y-3">
              <InfoRow label="Auction ID" value={truncateId(auction.auction_id, 10)} mono />
              <InfoRow label="Item Hash" value={truncateId(auction.item_hash, 10)} mono />
              <InfoRow label="Seller Hash" value={truncateId(auction.seller_hash, 10)} mono />
              <InfoRow label="Bid Deadline" value={`#${auction.deadline.toLocaleString()}`} />
              {auction.reveal_deadline > 0 && (
                <InfoRow label="Reveal Deadline" value={`#${auction.reveal_deadline.toLocaleString()}`} />
              )}
              <InfoRow label="Mode" value={auction.auction_mode === 2 ? 'Vickrey (2nd-Price)' : 'First-Price'} />
            </div>
          </div>

          {/* Anti-snipe info card */}
          {isActive && (
            <div className="card border-orange-500/10 bg-orange-500/5">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-orange-300 font-medium mb-1">Anti-Sniping Active</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Any bid placed within the last 40 blocks (~10 min) extends the deadline by 40 blocks.
                    Last-second manipulation is impossible.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Status timeline */}
          <div className="card">
            <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-accent-400" />
              Timeline
            </h3>
            <div className="space-y-0">
              <TimelineStep label="Created" completed />
              <TimelineStep
                label="Bidding"
                completed={phase !== 'active'}
                active={phase === 'active'}
              />
              <TimelineStep
                label="Revealing"
                completed={phase === 'settled' || phase === 'failed'}
                active={phase === 'revealing'}
              />
              <TimelineStep
                label="Settled"
                completed={phase === 'settled'}
                active={false}
                last
              />
            </div>
          </div>

          {/* Current block */}
          <div className="card">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Current Block</span>
              <span className="text-xs text-gray-400 font-mono">
                {blockHeight > 0 ? `#${blockHeight.toLocaleString()}` : 'Loading...'}
              </span>
            </div>
          </div>

          {/* Faucet banner */}
          <FaucetBanner />

          {/* Share QR Code */}
          <div className="card">
            <AuctionQR
              value={`${window.location.origin}/auction/${auction.auction_id}`}
              label="Share This Auction"
              sublabel="Scan to open this auction on any device"
              size={120}
            />
          </div>
        </div>
      </div>
    </div>
  )
}


function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value?: string
}) {
  return (
    <div className="bg-surface-800/80 rounded-xl p-3">
      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        {icon}
        {value && <span className="text-sm text-white">{value}</span>}
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs text-gray-300 ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function CloseBiddingCard({ auctionId, onSuccess }: { auctionId: string; onSuccess: () => void }) {
  const { execute, loading, error, txId } = useTransaction()
  const { connected } = useWallet()

  const handleClose = async () => {
    try {
      const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`
      const result = await execute({ functionName: 'close_bidding', inputs: [key] })
      if (result.transactionId) {
        setTimeout(onSuccess, 3000)
      }
    } catch {
      // Error is surfaced via useTransaction's error state
    }
  }

  if (txId) {
    return (
      <div className="card">
        <div className="flex items-start gap-3">
          <Play className="w-5 h-5 text-green-400 mt-0.5" />
          <div>
            <p className="text-white font-semibold text-sm">Bidding Closed</p>
            <TransactionLink txId={txId} className="text-xs mt-1" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card border-yellow-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0">
            <Play className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Deadline Passed</p>
            <p className="text-xs text-gray-400">Close bidding to start the reveal phase.</p>
          </div>
        </div>
        <button onClick={handleClose} disabled={loading || !connected} className="btn-primary text-xs py-2 px-4">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Close Bidding'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  )
}

function CancelAuctionCard({ auctionId, onSuccess }: { auctionId: string; onSuccess: () => void }) {
  const { execute, loading, error, txId } = useTransaction()
  const { connected } = useWallet()

  const handleCancel = async () => {
    try {
      const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`
      const result = await execute({ functionName: 'cancel_auction', inputs: [key] })
      if (result.transactionId) {
        setTimeout(onSuccess, 3000)
      }
    } catch {
      // Error is surfaced via useTransaction's error state
    }
  }

  if (txId) {
    return (
      <div className="card">
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
          <div>
            <p className="text-white font-semibold text-sm">Auction Cancelled</p>
            <TransactionLink txId={txId} className="text-xs mt-1" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-white font-semibold text-sm">Cancel Auction</p>
            <p className="text-xs text-gray-400">Only available before any bids are placed.</p>
          </div>
        </div>
        <button onClick={handleCancel} disabled={loading || !connected} className="btn-secondary text-xs py-2 px-4 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  )
}

function TimelineStep({
  label,
  completed,
  active,
  last,
}: {
  label: string
  completed: boolean
  active?: boolean
  last?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full border-2 transition-all ${
            completed
              ? 'bg-accent-500 border-accent-500'
              : active
              ? 'bg-transparent border-accent-400 animate-pulse'
              : 'bg-transparent border-surface-700'
          }`}
        />
        {!last && (
          <div
            className={`w-0.5 h-6 ${completed ? 'bg-accent-500/30' : 'bg-surface-700'}`}
          />
        )}
      </div>
      <span
        className={`text-xs -mt-0.5 font-medium ${
          completed ? 'text-gray-300' : active ? 'text-accent-400' : 'text-gray-600'
        }`}
      >
        {label}
        {active && <span className="ml-1.5 text-accent-400/60 font-normal">(current)</span>}
      </span>
    </div>
  )
}
