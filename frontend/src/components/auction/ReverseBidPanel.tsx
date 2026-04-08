import { useState, useEffect, useRef } from 'react'
import { ArrowDownCircle, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useCountdown } from '@/hooks/useCountdown'
import { useRecordStore } from '@/stores/recordStore'
import { TOKEN_TYPE, type AuctionData } from '@/types'
import { generateNonce, toMicrocredits, formatTokenAmount, fetchMapping, parseAuctionData } from '@/lib/aleo'
import { config } from '@/lib/config'
import TransactionProgress from '@/components/shared/TransactionProgress'
import TransactionLink from '@/components/shared/TransactionLink'

interface ReverseBidPanelProps {
  auction: AuctionData
  onBidConfirmed?: () => void
}

export default function ReverseBidPanel({ auction, onBidConfirmed }: ReverseBidPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { timeRemaining, isExpired } = useCountdown(auction.deadline)
  const { getForAuction } = useRecordStore()

  const [quoteAmount, setQuoteAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const prevTxStatus = useRef(txStatus)
  useEffect(() => {
    if (prevTxStatus.current === txStatus) return
    if (txStatus === 'confirmed') {
      toast.success('Reverse bid (quote) placed!')
      onBidConfirmed?.()
    }
    if (txStatus === 'failed') toast.error(txError || 'Quote submission failed')
    prevTxStatus.current = txStatus
  }, [txStatus, txError, onBidConfirmed])

  const existingRecords = getForAuction(auction.auction_id)
  const existingBid = existingRecords.bids.length > 0 ? existingRecords.bids[0] : null
  const tokenSymbol = auction.token_type === TOKEN_TYPE.USDCX ? 'USDCx' : auction.token_type === TOKEN_TYPE.USAD ? 'USAD' : 'ALEO'

  const handleBid = async () => {
    setFormError(null)
    reset()

    if (!connected) {
      setFormError('Connect your wallet first')
      return
    }

    const amount = parseFloat(quoteAmount)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Enter a valid quote amount')
      return
    }

    const micros = Math.floor(amount * 1_000_000)
    if (micros < Number(config.minBidAmount)) {
      setFormError(`Minimum quote is ${Number(config.minBidAmount) / 1_000_000} ${tokenSymbol}`)
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
      functionName: 'place_reverse_bid',
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
            <h3 className="text-white font-semibold mb-3">Quote Submitted</h3>
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
                Your sealed quote is stored in your wallet automatically.
                You'll need it during the reveal phase.
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
        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
          <ArrowDownCircle className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Reverse Auction — Submit Your Quote</h3>
          <p className="text-[10px] text-gray-500">Lowest quote wins. Compete by bidding down.</p>
        </div>
        {!isExpired && (
          <span className="text-xs text-gray-400 bg-surface-800 px-2 py-1 rounded">
            {timeRemaining} left
          </span>
        )}
      </div>

      {isExpired ? (
        <p className="text-gray-400 text-sm">Quoting period has ended.</p>
      ) : (
        <>
          {/* Reverse auction info */}
          <div className="bg-surface-800 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
                <ArrowDownCircle className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-white font-semibold">Lowest Quote Wins</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  A buyer has posted a request. Sellers compete by quoting lower prices.
                  The seller with the lowest quote wins the contract.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-700">
              <span className="text-xs text-gray-500">Total Quotes</span>
              <span className="text-sm font-bold text-white">{auction.bid_count}</span>
            </div>
          </div>

          {/* Existing quote notice */}
          {existingBid && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-accent-500/10 border border-accent-500/20 mb-4">
              <Info className="w-4 h-4 text-accent-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-accent-300 font-medium">You have an existing quote</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Amount: {formatTokenAmount(existingBid.bid_amount, auction.token_type)}
                </p>
              </div>
            </div>
          )}

          {/* Quote input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1.5">
              {existingBid ? 'New Quote' : 'Your Quote'}
            </label>
            <div className="relative">
              <input
                type="number"
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
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
            <p className="text-[10px] text-gray-600 mt-1">
              Lower is better. Quote the minimum you would accept for this work.
            </p>
          </div>

          {/* Privacy notice */}
          <div className="bg-surface-800 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="text-green-400 font-medium">Quotes stay private until reveal.</span>{' '}
              Only an encrypted commitment is stored on-chain. Competitors cannot see or
              undercut your quote. This prevents a race to the bottom and encourages honest pricing.
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
              <p className="text-xs text-gray-500">Connect your wallet to submit a quote.</p>
            </div>
          ) : (
            <button
              onClick={handleBid}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 min-h-[44px]"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting Quote...</>
              ) : existingBid ? (
                'Submit New Quote'
              ) : (
                'Submit Quote'
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
