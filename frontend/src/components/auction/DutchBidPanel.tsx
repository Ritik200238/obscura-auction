import { useState, useEffect } from 'react'
import { TrendingDown, Loader2, AlertCircle, CheckCircle, Timer } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useBlockHeight } from '@/contexts/BlockHeightContext'
import { type AuctionData } from '@/types'
import { generateNonce, toMicrocredits, formatTokenAmount, fetchMapping, fetchCreditsRecord } from '@/lib/aleo'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { config } from '@/lib/config'
import TransactionProgress from '@/components/shared/TransactionProgress'
import TransactionLink from '@/components/shared/TransactionLink'

interface DutchBidPanelProps {
  auction: AuctionData
  onBidConfirmed?: () => void
}

export default function DutchBidPanel({ auction, onBidConfirmed }: DutchBidPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { requestRecords } = useWallet()
  const { blockHeight } = useBlockHeight()
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [startPrice, setStartPrice] = useState<number | null>(null)
  const [endPrice, setEndPrice] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // Fetch Dutch config and compute current price
  useEffect(() => {
    const auctionKey = auction.auction_id.endsWith('field') ? auction.auction_id : `${auction.auction_id}field`
    fetchMapping('dutch_params', auctionKey).then(raw => {
      if (!raw) return
      const startMatch = raw.match(/start_price:\s*(\d+)u128/)
      const endMatch = raw.match(/end_price:\s*(\d+)u128/)
      if (startMatch) setStartPrice(Number(startMatch[1]))
      if (endMatch) setEndPrice(Number(endMatch[1]))
    }).catch(() => {})
  }, [auction.auction_id])

  // Compute current price from block height
  useEffect(() => {
    if (startPrice === null || endPrice === null || !blockHeight || !auction.created_at) return
    const elapsed = blockHeight - auction.created_at
    const totalDuration = auction.deadline - auction.created_at
    if (totalDuration <= 0) { setCurrentPrice(endPrice); return }
    const priceRange = startPrice - endPrice
    const drop = Math.floor((priceRange * Math.min(elapsed, totalDuration)) / totalDuration)
    setCurrentPrice(startPrice - drop)
  }, [blockHeight, startPrice, endPrice, auction.created_at, auction.deadline])

  const priceAleo = currentPrice !== null ? currentPrice / 1_000_000 : null
  const startAleo = startPrice !== null ? startPrice / 1_000_000 : null
  const endAleo = endPrice !== null ? endPrice / 1_000_000 : null

  const handleBuyNow = async () => {
    setFormError(null)
    reset()
    if (!connected) { setFormError('Connect your wallet first'); return }
    if (currentPrice === null) { setFormError('Price not loaded yet'); return }

    // Add small buffer for block timing (2 blocks worth of price drop)
    const buffer = startPrice && endPrice && auction.deadline > auction.created_at
      ? Math.ceil(((startPrice - endPrice) * 2) / (auction.deadline - auction.created_at))
      : 0
    const bidAmount = currentPrice + buffer

    const nonce = generateNonce()
    const auctionKey = auction.auction_id.endsWith('field') ? auction.auction_id : `${auction.auction_id}field`

    const tokenType = auction.token_type

    if (tokenType === 1) {
      // ALEO path — needs a private credits record as 4th input
      let creditsRecord: string | null = null
      try {
        creditsRecord = await fetchCreditsRecord(requestRecords, bidAmount)
      } catch (e) {
        setFormError(`Failed to fetch credits records from wallet: ${e instanceof Error ? e.message : 'unknown error'}`)
        return
      }
      if (!creditsRecord) {
        setFormError(`No ALEO credits record with >= ${(bidAmount / 1_000_000).toFixed(4)} ALEO found. Need a private record (not public balance). Try getting tokens from the faucet.`)
        return
      }
      await execute({
        functionName: 'bid_dutch',
        inputs: [auctionKey, `${bidAmount}u128`, nonce, creditsRecord],
      })
    } else {
      // USDCx/USAD path — no record needed (public balance transfer)
      const funcName = tokenType === 2 ? 'bid_dutch_usdcx' : 'bid_dutch_usad'
      await execute({
        functionName: funcName,
        inputs: [auctionKey, `${bidAmount}u128`, nonce],
      })
    }
  }

  useEffect(() => {
    if (txStatus === 'confirmed') {
      toast.success('You won the Dutch auction!')
      onBidConfirmed?.()
    }
    if (txStatus === 'failed') toast.error(txError || 'Bid failed')
  }, [txStatus])

  if (txId) {
    return (
      <div className="card">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-3">Purchase Submitted</h3>
            <TransactionProgress
              status={txStatus}
              txId={txId}
              error={txError}
              onRetry={retryCheck}
              nextAction={txStatus === 'confirmed' ? { label: 'Claim Your Item', href: `/auction/${auction.auction_id}` } : undefined}
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
        <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
          <TrendingDown className="w-4 h-4 text-orange-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Dutch Auction — Buy Now</h3>
          <p className="text-[10px] text-gray-500">Price drops every block. First buyer wins.</p>
        </div>
      </div>

      {/* Current price display */}
      <div className="bg-surface-800 rounded-xl p-4 mb-4">
        <p className="text-xs text-gray-500 mb-1">Current Price</p>
        {priceAleo !== null ? (
          <p className="text-2xl font-bold text-white font-mono">
            {priceAleo.toFixed(4)} <span className="text-sm text-gray-400">ALEO</span>
          </p>
        ) : (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading price...</span>
          </div>
        )}
        {startAleo !== null && endAleo !== null && (
          <div className="flex items-center justify-between mt-2 text-[10px] text-gray-600">
            <span>Started at {startAleo.toFixed(2)}</span>
            <span>Floor: {endAleo.toFixed(2)}</span>
          </div>
        )}
        {/* Price progress bar */}
        {startPrice !== null && endPrice !== null && currentPrice !== null && (
          <div className="mt-2 h-1.5 rounded-full bg-surface-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-green-500 transition-all duration-1000"
              style={{ width: `${Math.max(0, Math.min(100, ((startPrice - currentPrice) / (startPrice - endPrice)) * 100))}%` }}
            />
          </div>
        )}
      </div>

      {/* Timing info */}
      <div className="flex items-center gap-2 p-2 rounded-lg bg-surface-800/50 mb-4">
        <Timer className="w-3.5 h-3.5 text-gray-500" />
        <p className="text-xs text-gray-400">
          Price drops every block (~15 seconds). Buy now before someone else does.
        </p>
      </div>

      {/* Privacy notice */}
      <div className="bg-surface-800 rounded-lg p-3 mb-4">
        <p className="text-xs text-gray-400 leading-relaxed">
          <span className="text-green-400 font-medium">Your identity stays private.</span>{' '}
          The blockchain records the purchase but your wallet address is hashed. Other bidders
          never see who bought or at what price until settlement.
        </p>
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
          <p className="text-xs text-gray-500">Connect your wallet to buy at the current price.</p>
        </div>
      ) : (
        <button
          onClick={handleBuyNow}
          disabled={loading || currentPrice === null}
          className="btn-primary w-full flex items-center justify-center gap-2 min-h-[44px]"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Purchasing...</>
          ) : priceAleo !== null ? (
            `Buy Now at ${priceAleo.toFixed(4)} ALEO`
          ) : (
            'Loading...'
          )}
        </button>
      )}
    </div>
  )
}
