import { useState, useEffect, useRef } from 'react'
import { Lock, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useCountdown } from '@/hooks/useCountdown'
import { useRecordStore } from '@/stores/recordStore'
import { TOKEN_TYPE, type AuctionData } from '@/types'
import { generateNonce, toMicrocredits, formatTokenAmount, fetchMapping, parseAuctionData } from '@/lib/aleo'
import { config } from '@/lib/config'
import TransactionLink from '@/components/shared/TransactionLink'
import TransactionProgress from '@/components/shared/TransactionProgress'
import AuctionQR from '@/components/shared/AuctionQR'

interface BidPanelProps {
  auction: AuctionData
  onBidConfirmed?: () => void
}

export default function BidPanel({ auction, onBidConfirmed }: BidPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { timeRemaining, isExpired } = useCountdown(auction.deadline)
  const { getForAuction } = useRecordStore()

  const [bidAmount, setBidAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Toast notifications for bid status changes + trigger parent refresh
  const prevTxStatus = useRef(txStatus)
  useEffect(() => {
    if (prevTxStatus.current === txStatus) return
    if (txStatus === 'confirmed') {
      toast.success('Sealed bid placed!')
      onBidConfirmed?.()
    }
    if (txStatus === 'failed') toast.error(txError || 'Bid transaction failed')
    prevTxStatus.current = txStatus
  }, [txStatus, txError, onBidConfirmed])

  const existingRecords = getForAuction(auction.auction_id)
  const existingBid = existingRecords.bids.length > 0 ? existingRecords.bids[0] : null
  const tokenSymbol = auction.token_type === TOKEN_TYPE.USDCX ? 'USDCx' : 'ALEO'

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

    // On-chain verification: check if bid_count has incremented
    const onChainVerify = async () => {
      const raw = await fetchMapping('auctions', auctionKey)
      if (!raw) return false
      const updated = parseAuctionData(raw, auction.auction_id)
      return updated.bid_count > currentBidCount
    }

    // Privacy design: place_bid only stores the commitment — NO token transfer.
    // Bid amounts are completely hidden during the sealed phase.
    // Tokens are escrowed at reveal_bid time (when amounts are intentionally public).
    await execute({
      functionName: 'place_bid',
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
            {txStatus === 'confirmed' && (
              <>
                <p className="text-xs text-gray-500 mt-3 mb-3">
                  Your sealed bid record is stored in your wallet automatically.
                  You'll need it during the reveal phase — keep your wallet connected.
                </p>
                <div className="bg-surface-800 rounded-lg p-3">
                  <AuctionQR
                    value={`${window.location.origin}/auction/${auction.auction_id}`}
                    label="Share This Auction"
                    sublabel="Share with other bidders — your bid amount stays sealed"
                    size={120}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Lock className="w-4 h-4 text-accent-400" />
          Place Sealed Bid
        </h3>
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
              {existingBid ? 'New Bid Amount' : 'Bid Amount'}
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
              <span className="text-green-400 font-medium">Zero amount leakage during bidding.</span>{' '}
              No tokens are transferred when placing a bid. Only a cryptographic commitment
              (BHP256 hash) is stored on-chain. Your {tokenSymbol} is only locked when you{' '}
              <span className="text-white">reveal</span> — at which point your bid amount is
              intentionally public.{' '}
              {auction.token_type === TOKEN_TYPE.USDCX
                ? 'USDCx uses public balance transfers during reveal (transfer_public_as_signer).'
                : 'ALEO uses private record transfers during reveal (transfer_private_to_public).'}
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
              <p className="text-xs text-gray-500">Use the wallet button in the top-right corner to connect, then return here to bid.</p>
            </div>
          ) : (
            <button
              onClick={handleBid}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting Bid...
                </>
              ) : existingBid ? (
                'Place New Bid'
              ) : (
                'Place Sealed Bid'
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
