import { useState, useEffect, useRef } from 'react'
import { EyeOff, Loader2, AlertCircle, CheckCircle, Info, HelpCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useCountdown } from '@/hooks/useCountdown'
import { useBlockHeight } from '@/contexts/BlockHeightContext'
import { useRecordStore } from '@/stores/recordStore'
import { TOKEN_TYPE, type AuctionData } from '@/types'
import { generateNonce, toMicrocredits, formatTokenAmount, fetchMapping, parseAuctionData } from '@/lib/aleo'
import { config } from '@/lib/config'
import TransactionProgress from '@/components/shared/TransactionProgress'
import TransactionLink from '@/components/shared/TransactionLink'

interface BlindDutchBidPanelProps {
  auction: AuctionData
  onBidConfirmed?: () => void
}

export default function BlindDutchBidPanel({ auction, onBidConfirmed }: BlindDutchBidPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { timeRemaining, isExpired } = useCountdown(auction.deadline)
  const { blockHeight } = useBlockHeight()
  const { getForAuction } = useRecordStore()

  const [bidAmount, setBidAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const prevTxStatus = useRef(txStatus)
  useEffect(() => {
    if (prevTxStatus.current === txStatus) return
    if (txStatus === 'confirmed') {
      toast.success('Blind Dutch bid placed!')
      onBidConfirmed?.()
    }
    if (txStatus === 'failed') toast.error(txError || 'Bid transaction failed')
    prevTxStatus.current = txStatus
  }, [txStatus, txError, onBidConfirmed])

  const existingRecords = getForAuction(auction.auction_id)
  const existingBid = existingRecords.bids.length > 0 ? existingRecords.bids[0] : null
  const tokenSymbol = auction.token_type === TOKEN_TYPE.USDCX ? 'USDCx' : auction.token_type === TOKEN_TYPE.USAD ? 'USAD' : 'ALEO'

  // Compute how far along the auction is (without revealing the actual price)
  const elapsed = blockHeight && auction.created_at ? blockHeight - auction.created_at : 0
  const totalDuration = auction.deadline - auction.created_at
  const progressPct = totalDuration > 0 ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100)) : 0

  const handleBid = async () => {
    setFormError(null)
    reset()

    if (!connected) {
      setFormError('Connect your wallet first')
      return
    }

    const amount = parseFloat(bidAmount)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Enter a valid bid amount')
      return
    }

    const micros = Math.floor(amount * 1_000_000)
    if (micros < Number(config.minBidAmount)) {
      setFormError(`Minimum bid is ${Number(config.minBidAmount) / 1_000_000} ${tokenSymbol}`)
      return
    }

    const nonce = generateNonce()
    const microsStr = toMicrocredits(amount)
    const auctionKey = auction.auction_id.endsWith('field') ? auction.auction_id : `${auction.auction_id}field`
    const currentBidCount = auction.bid_count

    const onChainVerify = async () => {
      const raw = await fetchMapping('auctions', auctionKey)
      if (!raw) return false
      const updated = parseAuctionData(raw, auction.auction_id)
      return updated.bid_count > currentBidCount
    }

    await execute({
      functionName: 'place_blind_dutch_bid',
      inputs: [auctionKey, `${microsStr}u128`, nonce, `${auction.token_type}u8`],
      onChainVerify,
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
            <h3 className="text-white font-semibold mb-3">Blind Dutch Bid Submitted</h3>
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
            {txStatus === 'confirmed' && (
              <p className="text-xs text-gray-500 mt-3">
                Your sealed bid has been recorded. If your guess matches or exceeds the
                hidden current price, you win.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <EyeOff className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Blind Dutch Auction — Guess the Price</h3>
          <p className="text-[10px] text-gray-500">Price is dropping but hidden. Submit your best guess.</p>
        </div>
        {!isExpired && (
          <span className="text-xs text-gray-400 bg-surface-800 px-2 py-1 rounded">
            {timeRemaining} left
          </span>
        )}
      </div>

      {isExpired ? (
        <p className="text-gray-400 text-sm">Bidding period has ended.</p>
      ) : (
        <>
          {/* Hidden price indicator */}
          <div className="bg-surface-800 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Current Price</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-violet-400 font-mono">???</p>
                  <HelpCircle className="w-4 h-4 text-gray-600" />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Time Elapsed</p>
                <p className="text-lg font-bold text-white">{progressPct.toFixed(0)}%</p>
              </div>
            </div>
            {/* Progress bar — shows time, not price */}
            <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all duration-1000"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-600 mt-2">
              The price is decreasing over time, but the exact value is hidden from all participants.
            </p>
          </div>

          {/* Strategy hint */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 mb-4">
            <HelpCircle className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-violet-300 font-medium">How it works</p>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                The price drops every block, but nobody can see it. Submit your guess of the
                current price. If your bid meets or exceeds the hidden price, you win.
                Bid too high and you overpay. Bid too low and you miss out.
              </p>
            </div>
          </div>

          {/* Existing bid notice */}
          {existingBid && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-accent-500/10 border border-accent-500/20 mb-4">
              <Info className="w-4 h-4 text-accent-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-accent-300 font-medium">You have an existing bid</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Amount: {formatTokenAmount(existingBid.bid_amount, auction.token_type)}
                </p>
              </div>
            </div>
          )}

          {/* Bid input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1.5">
              {existingBid ? 'New Price Guess' : 'Your Price Guess'}
            </label>
            <div className="relative">
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder="0.00"
                min="0.001"
                step="0.001"
                className="input-field pr-16"
                disabled={loading}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                {tokenSymbol}
              </span>
            </div>
          </div>

          {/* Privacy notice */}
          <div className="bg-surface-800 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="text-green-400 font-medium">Double privacy: hidden price + sealed bids.</span>{' '}
              Neither the current price nor any bid amounts are visible on-chain. This is a novel
              privacy mechanism unique to Obscura — combining Dutch price discovery with sealed-bid
              commitment.
            </p>
          </div>

          {/* Errors */}
          {(formError || txError) && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-400">{formError || txError}</p>
            </div>
          )}

          {/* Submit */}
          {!connected ? (
            <div className="text-center p-4 rounded-lg bg-surface-800 border border-surface-700">
              <p className="text-sm text-gray-400 mb-1">Wallet not connected</p>
              <p className="text-xs text-gray-500">Connect your wallet to submit your price guess.</p>
            </div>
          ) : (
            <button
              onClick={handleBid}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 min-h-[44px]"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting Guess...</>
              ) : existingBid ? (
                'Submit New Price Guess'
              ) : (
                'Submit Price Guess'
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
