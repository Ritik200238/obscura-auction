import { useState, useEffect, useRef } from 'react'
import { Layers, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react'
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

interface MultiUnitBidPanelProps {
  auction: AuctionData
  onBidConfirmed?: () => void
}

export default function MultiUnitBidPanel({ auction, onBidConfirmed }: MultiUnitBidPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { timeRemaining, isExpired } = useCountdown(auction.deadline)
  const { getForAuction } = useRecordStore()

  const [quantity, setQuantity] = useState('')
  const [pricePerUnit, setPricePerUnit] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [totalUnits, setTotalUnits] = useState<number | null>(null)

  const prevTxStatus = useRef(txStatus)
  useEffect(() => {
    if (prevTxStatus.current === txStatus) return
    if (txStatus === 'confirmed') {
      toast.success('Multi-unit bid placed!')
      onBidConfirmed?.()
    }
    if (txStatus === 'failed') toast.error(txError || 'Bid transaction failed')
    prevTxStatus.current = txStatus
  }, [txStatus, txError, onBidConfirmed])

  // Fetch multi-unit config for total available units
  useEffect(() => {
    const auctionKey = auction.auction_id.endsWith('field') ? auction.auction_id : `${auction.auction_id}field`
    fetchMapping('multi_unit_params', auctionKey).then(raw => {
      if (!raw) return
      const totalMatch = raw.match(/total_units:\s*(\d+)u64/)
      if (totalMatch) setTotalUnits(Number(totalMatch[1]))
    }).catch(() => {})
  }, [auction.auction_id])

  const existingRecords = getForAuction(auction.auction_id)
  const existingBid = existingRecords.bids.length > 0 ? existingRecords.bids[0] : null
  const tokenSymbol = auction.token_type === TOKEN_TYPE.USDCX ? 'USDCx' : auction.token_type === TOKEN_TYPE.USAD ? 'USAD' : 'ALEO'

  const qty = parseInt(quantity) || 0
  const ppu = parseFloat(pricePerUnit) || 0
  const totalCost = qty * ppu

  const handleBid = async () => {
    setFormError(null)
    reset()

    if (!connected) {
      setFormError('Connect your wallet first')
      return
    }

    if (qty <= 0) {
      setFormError('Enter a valid quantity (at least 1)')
      return
    }

    if (totalUnits !== null && qty > totalUnits) {
      setFormError(`Maximum available units: ${totalUnits}`)
      return
    }

    if (ppu <= 0) {
      setFormError('Enter a valid price per unit')
      return
    }

    const ppuMicros = Math.floor(ppu * 1_000_000)
    if (ppuMicros < Number(config.minBidAmount)) {
      setFormError(`Minimum price per unit is ${Number(config.minBidAmount) / 1_000_000} ${tokenSymbol}`)
      return
    }

    const nonce = generateNonce()
    const ppuStr = toMicrocredits(ppu)
    const auctionKey = auction.auction_id.endsWith('field') ? auction.auction_id : `${auction.auction_id}field`
    const currentBidCount = auction.bid_count

    const onChainVerify = async () => {
      const raw = await fetchMapping('auctions', auctionKey)
      if (!raw) return false
      const updated = parseAuctionData(raw, auction.auction_id)
      return updated.bid_count > currentBidCount
    }

    await execute({
      functionName: 'place_multi_unit_bid',
      inputs: [auctionKey, `${qty}u64`, `${ppuStr}u128`, nonce, `${auction.token_type}u8`],
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
            <h3 className="text-white font-semibold mb-3">Multi-Unit Bid Submitted</h3>
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
                Your bid for {quantity} unit{qty !== 1 ? 's' : ''} has been sealed on-chain.
                You'll need the bid record during the reveal phase.
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
        <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
          <Layers className="w-4 h-4 text-teal-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Multi-Unit Auction — Quantity + Price</h3>
          <p className="text-[10px] text-gray-500">Specify how many units and your price per unit.</p>
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
          {/* Available units display */}
          <div className="bg-surface-800 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Available Units</p>
                <p className="text-2xl font-bold text-white font-mono">
                  {totalUnits !== null ? totalUnits : <Loader2 className="w-5 h-5 animate-spin text-gray-500 inline" />}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Total Bids</p>
                <p className="text-lg font-bold text-white">{auction.bid_count}</p>
              </div>
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

          {/* Quantity input */}
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Quantity (units)</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="How many units?"
              min="1"
              step="1"
              max={totalUnits ?? undefined}
              className="input-field"
              disabled={loading}
            />
          </div>

          {/* Price per unit input */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Price Per Unit ({tokenSymbol})</label>
            <div className="relative">
              <input
                type="number"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
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

          {/* Total cost preview */}
          {qty > 0 && ppu > 0 && (
            <div className="bg-surface-800/50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Total Cost</span>
                <span className="text-sm font-semibold text-white">
                  {totalCost.toFixed(4)} {tokenSymbol}
                </span>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">
                {qty} unit{qty !== 1 ? 's' : ''} x {ppu.toFixed(4)} {tokenSymbol} each
              </p>
            </div>
          )}

          {/* Privacy notice */}
          <div className="bg-surface-800 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              <span className="text-green-400 font-medium">Quantity and price stay private.</span>{' '}
              Only an encrypted commitment is stored on-chain. Your bid details are hidden until
              the reveal phase. Highest bidders per unit are allocated first.
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
              ) : qty > 0 && ppu > 0 ? (
                `Bid ${qty} Unit${qty !== 1 ? 's' : ''} at ${ppu.toFixed(4)} ${tokenSymbol} Each`
              ) : (
                'Place Multi-Unit Bid'
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
