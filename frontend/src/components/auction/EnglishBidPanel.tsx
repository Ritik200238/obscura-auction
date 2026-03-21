import { useState, useEffect, useRef } from 'react'
import { TrendingUp, Loader2, AlertCircle, CheckCircle, Shield, Timer } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useCountdown } from '@/hooks/useCountdown'
import { type AuctionData, AUCTION_MODE } from '@/types'
import { generateNonce, toMicrocredits, formatTokenAmount, fetchMapping, parseAuctionData } from '@/lib/aleo'
import { config } from '@/lib/config'
import TransactionProgress from '@/components/shared/TransactionProgress'
import TransactionLink from '@/components/shared/TransactionLink'

interface EnglishBidPanelProps {
  auction: AuctionData
  highestBid: number
  onBidConfirmed?: () => void
}

export default function EnglishBidPanel({ auction, highestBid, onBidConfirmed }: EnglishBidPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { timeRemaining, isExpired } = useCountdown(auction.deadline)

  const [bidAmount, setBidAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const highestAleo = highestBid / 1_000_000
  const minIncrement = highestBid > 0 ? Math.ceil(highestBid * 0.05) : Number(config.minBidAmount)
  const minBidAleo = (highestBid + minIncrement) / 1_000_000

  const prevTxStatus = useRef(txStatus)
  useEffect(() => {
    if (prevTxStatus.current === txStatus) return
    if (txStatus === 'confirmed') {
      toast.success('Bid placed! You are the new highest bidder.')
      onBidConfirmed?.()
    }
    if (txStatus === 'failed') toast.error(txError || 'Bid failed')
    prevTxStatus.current = txStatus
  }, [txStatus, txError, onBidConfirmed])

  const handleBid = async () => {
    setFormError(null)
    reset()
    if (!connected) { setFormError('Connect your wallet first'); return }

    const amount = parseFloat(bidAmount)
    if (isNaN(amount) || amount <= 0) { setFormError('Enter a valid bid amount'); return }

    const micros = Math.floor(amount * 1_000_000)
    if (micros < highestBid + minIncrement) {
      setFormError(`Bid must be at least ${minBidAleo.toFixed(4)} ALEO (5% above current highest)`)
      return
    }

    const nonce = generateNonce()
    const microsStr = toMicrocredits(amount)
    const auctionKey = auction.auction_id.endsWith('field') ? auction.auction_id : `${auction.auction_id}field`

    await execute({
      functionName: 'bid_english',
      inputs: [auctionKey, `${micros}u128`, nonce],
    })
  }

  if (txId) {
    return (
      <div className="card">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-3">Bid Submitted</h3>
            <TransactionProgress
              status={txStatus}
              txId={txId}
              error={txError}
              onRetry={retryCheck}
            />
            <div className="bg-surface-800 rounded-lg p-3 mt-3">
              <p className="text-xs text-gray-500 mb-0.5">Transaction</p>
              <TransactionLink txId={txId} className="text-xs break-all" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">English Auction — Place Higher Bid</h3>
          <p className="text-[10px] text-gray-500">Open ascending bids. Highest at deadline wins.</p>
        </div>
      </div>

      {/* Current highest bid display */}
      <div className="bg-surface-800 rounded-xl p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="text-xs text-gray-500 mb-1">Current Highest Bid</p>
            <p className="text-2xl font-bold text-white font-mono">
              {highestBid > 0 ? `${highestAleo.toFixed(4)}` : 'No bids yet'}
              {highestBid > 0 && <span className="text-sm text-gray-400 ml-1">ALEO</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Total Bids</p>
            <p className="text-lg font-bold text-white">{auction.bid_count}</p>
          </div>
        </div>
        {highestBid > 0 && (
          <p className="text-[10px] text-gray-600 mt-2">
            Minimum next bid: {minBidAleo.toFixed(4)} ALEO (5% above current)
          </p>
        )}
      </div>

      {/* Anti-snipe indicator */}
      {!isExpired && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-800/50 mb-4">
          <Shield className="w-3.5 h-3.5 text-accent-400" />
          <p className="text-xs text-gray-400">
            Anti-snipe protection: bids in the last ~10 minutes extend the deadline.
          </p>
        </div>
      )}

      {isExpired ? (
        <div className="text-center p-4 rounded-lg bg-surface-800 border border-surface-700">
          <Timer className="w-5 h-5 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Bidding has ended</p>
          <p className="text-xs text-gray-500 mt-1">Waiting for the seller to settle this auction.</p>
        </div>
      ) : (
        <>
          {/* Bid input */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Your Bid (ALEO)</label>
            <div className="relative">
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder={highestBid > 0 ? `Min: ${minBidAleo.toFixed(4)}` : 'Enter bid amount'}
                min={minBidAleo}
                step="0.001"
                className="input-field pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">ALEO</span>
            </div>
          </div>

          {(formError || txError) && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-400">{formError || txError}</p>
            </div>
          )}

          {!connected ? (
            <div className="text-center p-4 rounded-lg bg-surface-800 border border-surface-700">
              <p className="text-sm text-gray-400 mb-1">Wallet not connected</p>
              <p className="text-xs text-gray-500">Connect your wallet to place a bid.</p>
            </div>
          ) : (
            <button
              onClick={handleBid}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 min-h-[44px]"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting Bid...</>
              ) : (
                'Place Higher Bid'
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
