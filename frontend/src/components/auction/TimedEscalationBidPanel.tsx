import { useState, useEffect, useRef } from 'react'
import { Timer, Loader2, AlertCircle, CheckCircle, Info, TrendingUp } from 'lucide-react'
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

interface TimedEscalationBidPanelProps {
  auction: AuctionData
  onBidConfirmed?: () => void
}

// Price auto-increments every 40 blocks (~10 minutes)
const ESCALATION_INTERVAL = 40

export default function TimedEscalationBidPanel({ auction, onBidConfirmed }: TimedEscalationBidPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { timeRemaining, isExpired } = useCountdown(auction.deadline)
  const { blockHeight } = useBlockHeight()
  const { getForAuction } = useRecordStore()

  const [bidAmount, setBidAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [basePrice, setBasePrice] = useState<number | null>(null)
  const [incrementAmount, setIncrementAmount] = useState<number | null>(null)

  const prevTxStatus = useRef(txStatus)
  useEffect(() => {
    if (prevTxStatus.current === txStatus) return
    if (txStatus === 'confirmed') {
      toast.success('Escalation bid placed! You are the current leader.')
      onBidConfirmed?.()
    }
    if (txStatus === 'failed') toast.error(txError || 'Bid transaction failed')
    prevTxStatus.current = txStatus
  }, [txStatus, txError, onBidConfirmed])

  // Fetch escalation parameters
  useEffect(() => {
    const auctionKey = auction.auction_id.endsWith('field') ? auction.auction_id : `${auction.auction_id}field`
    fetchMapping('escalation_params', auctionKey).then(raw => {
      if (!raw) return
      const baseMatch = raw.match(/base_price:\s*(\d+)u128/)
      const incMatch = raw.match(/increment:\s*(\d+)u128/)
      if (baseMatch) setBasePrice(Number(baseMatch[1]))
      if (incMatch) setIncrementAmount(Number(incMatch[1]))
    }).catch(() => {})
  }, [auction.auction_id])

  const existingRecords = getForAuction(auction.auction_id)
  const existingBid = existingRecords.bids.length > 0 ? existingRecords.bids[0] : null
  const tokenSymbol = auction.token_type === TOKEN_TYPE.USDCX ? 'USDCx' : auction.token_type === TOKEN_TYPE.USAD ? 'USAD' : 'ALEO'

  // Compute the current auto-incremented price
  const elapsed = blockHeight && auction.created_at ? blockHeight - auction.created_at : 0
  const escalationSteps = Math.floor(elapsed / ESCALATION_INTERVAL)
  const currentAutoPrice = basePrice !== null && incrementAmount !== null
    ? basePrice + (escalationSteps * incrementAmount)
    : null
  const currentAutoPriceAleo = currentAutoPrice !== null ? currentAutoPrice / 1_000_000 : null

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

    if (currentAutoPrice !== null && micros < currentAutoPrice) {
      setFormError(`Bid must be at least ${(currentAutoPrice / 1_000_000).toFixed(4)} ${tokenSymbol} (current escalated price)`)
      return
    }

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
      functionName: 'bid_timed_escalation',
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
            <h3 className="text-white font-semibold mb-3">Escalation Bid Submitted</h3>
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
                You are now the leading bidder. If no one outbids you before the
                deadline, you win.
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
        <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center">
          <Timer className="w-4 h-4 text-rose-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Timed Escalation — Beat the Clock</h3>
          <p className="text-[10px] text-gray-500">Price auto-increments. Last bidder when time expires wins.</p>
        </div>
        {!isExpired && (
          <span className="text-xs text-gray-400 bg-surface-800 px-2 py-1 rounded">
            {timeRemaining} left
          </span>
        )}
      </div>

      {isExpired ? (
        <p className="text-gray-400 text-sm">Escalation period has ended.</p>
      ) : (
        <>
          {/* Current escalated price display */}
          <div className="bg-surface-800 rounded-xl p-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">Current Minimum Price</p>
                {currentAutoPriceAleo !== null ? (
                  <p className="text-2xl font-bold text-white font-mono">
                    {currentAutoPriceAleo.toFixed(4)} <span className="text-sm text-gray-400">{tokenSymbol}</span>
                  </p>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading price...</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Escalation Step</p>
                <p className="text-lg font-bold text-white">{escalationSteps}</p>
              </div>
            </div>
            {incrementAmount !== null && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-700">
                <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
                <p className="text-[10px] text-gray-500">
                  Price increases by {(incrementAmount / 1_000_000).toFixed(4)} {tokenSymbol} every ~10 minutes (40 blocks)
                </p>
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 mb-4">
            <Timer className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400 leading-relaxed">
                The price automatically increases over time. Bid above the current price to become
                the leader. The last bidder standing when the clock expires wins the auction.
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
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Your Bid ({tokenSymbol})</label>
            <div className="relative">
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder={currentAutoPriceAleo !== null ? `Min: ${currentAutoPriceAleo.toFixed(4)}` : 'Enter bid amount'}
                min={currentAutoPriceAleo ?? 0.001}
                step="0.001"
                className="input-field pr-16"
                disabled={loading}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                {tokenSymbol}
              </span>
            </div>
            {currentAutoPriceAleo !== null && (
              <p className="text-[10px] text-gray-600 mt-1">
                Must be at least {currentAutoPriceAleo.toFixed(4)} {tokenSymbol}
              </p>
            )}
          </div>

          {/* Privacy notice */}
          <div className="bg-surface-800 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="text-green-400 font-medium">Your identity stays private.</span>{' '}
              The escalation price is public by design (bidders need to see the minimum), but your
              wallet address is hashed on-chain. Other bidders see the bid amount but not who placed it.
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
              <p className="text-xs text-gray-500">Connect your wallet to place an escalation bid.</p>
            </div>
          ) : (
            <button
              onClick={handleBid}
              disabled={loading || currentAutoPrice === null}
              className="btn-primary w-full flex items-center justify-center gap-2 min-h-[44px]"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting Bid...</>
              ) : currentAutoPriceAleo !== null ? (
                `Bid Above ${currentAutoPriceAleo.toFixed(4)} ${tokenSymbol}`
              ) : (
                'Loading...'
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
