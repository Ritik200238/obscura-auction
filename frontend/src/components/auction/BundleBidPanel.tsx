import { useState, useEffect, useRef } from 'react'
import { Package, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react'
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

interface BundleBidPanelProps {
  auction: AuctionData
  onBidConfirmed?: () => void
}

const BUNDLE_ITEMS = [
  { id: 1, label: 'Item 1', mask: 0b0001 },
  { id: 2, label: 'Item 2', mask: 0b0010 },
  { id: 3, label: 'Item 3', mask: 0b0100 },
  { id: 4, label: 'Item 4', mask: 0b1000 },
]

export default function BundleBidPanel({ auction, onBidConfirmed }: BundleBidPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { timeRemaining, isExpired } = useCountdown(auction.deadline)
  const { getForAuction } = useRecordStore()

  const [bidAmount, setBidAmount] = useState('')
  const [bidMode, setBidMode] = useState<'full' | 'subset'>('full')
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [formError, setFormError] = useState<string | null>(null)

  const prevTxStatus = useRef(txStatus)
  useEffect(() => {
    if (prevTxStatus.current === txStatus) return
    if (txStatus === 'confirmed') {
      toast.success(bidMode === 'full' ? 'Bundle bid placed!' : 'Subset bid placed!')
      onBidConfirmed?.()
    }
    if (txStatus === 'failed') toast.error(txError || 'Bid transaction failed')
    prevTxStatus.current = txStatus
  }, [txStatus, txError, onBidConfirmed, bidMode])

  const existingRecords = getForAuction(auction.auction_id)
  const existingBid = existingRecords.bids.length > 0 ? existingRecords.bids[0] : null
  const tokenSymbol = auction.token_type === TOKEN_TYPE.USDCX ? 'USDCx' : auction.token_type === TOKEN_TYPE.USAD ? 'USAD' : 'ALEO'

  const toggleItem = (itemId: number) => {
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    )
  }

  const computeBitmask = (): number => {
    return selectedItems.reduce((mask, itemId) => {
      const item = BUNDLE_ITEMS.find(i => i.id === itemId)
      return item ? mask | item.mask : mask
    }, 0)
  }

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

    if (bidMode === 'subset' && selectedItems.length === 0) {
      setFormError('Select at least one item for your subset bid')
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

    if (bidMode === 'subset') {
      const bitmask = computeBitmask()
      await execute({
        functionName: 'place_subset_bid',
        inputs: [auctionKey, `${bitmask}u8`, `${microsStr}u128`, nonce, `${auction.token_type}u8`],
        onChainVerify,
      })
    } else {
      await execute({
        functionName: 'place_bundle_bid',
        inputs: [auctionKey, `${microsStr}u128`, nonce, `${auction.token_type}u8`],
        onChainVerify,
      })
    }
  }

  if (txId) {
    return (
      <div className="card">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-3">
              {bidMode === 'full' ? 'Bundle Bid Submitted' : 'Subset Bid Submitted'}
            </h3>
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
                Your sealed bid record is stored in your wallet automatically.
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
        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <Package className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white">Bundle Auction — Bid on Items</h3>
          <p className="text-[10px] text-gray-500">Bid on the full bundle or select specific items.</p>
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

          {/* Bid mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setBidMode('full')}
              className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
                bidMode === 'full'
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                  : 'border-surface-700 bg-surface-800 text-gray-400 hover:border-surface-600'
              }`}
            >
              Full Bundle
            </button>
            <button
              onClick={() => setBidMode('subset')}
              className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
                bidMode === 'subset'
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                  : 'border-surface-700 bg-surface-800 text-gray-400 hover:border-surface-600'
              }`}
            >
              Subset (Pick Items)
            </button>
          </div>

          {/* Subset item checkboxes */}
          {bidMode === 'subset' && (
            <div className="bg-surface-800 rounded-xl p-4 mb-4">
              <p className="text-xs text-gray-400 mb-3">Select the items you want to bid on:</p>
              <div className="grid grid-cols-2 gap-2">
                {BUNDLE_ITEMS.map(item => (
                  <label
                    key={item.id}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      selectedItems.includes(item.id)
                        ? 'border-indigo-500/50 bg-indigo-500/10'
                        : 'border-surface-700 hover:border-surface-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.id)}
                      onChange={() => toggleItem(item.id)}
                      className="w-3.5 h-3.5 rounded border-surface-600 text-indigo-500 focus:ring-indigo-500/30"
                    />
                    <span className="text-sm text-gray-300">{item.label}</span>
                  </label>
                ))}
              </div>
              {selectedItems.length > 0 && (
                <p className="text-[10px] text-gray-600 mt-2">
                  Bitmask: {computeBitmask()} ({selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected)
                </p>
              )}
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
              <span className="text-green-400 font-medium">Bid amounts and item selections stay private.</span>{' '}
              Only an encrypted commitment is stored on-chain. Your {tokenSymbol} is locked when you
              reveal your bid. {bidMode === 'subset' && 'Which items you selected is hidden until reveal.'}
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
              ) : bidMode === 'full' ? (
                'Bid on Full Bundle'
              ) : (
                `Bid on ${selectedItems.length} Item${selectedItems.length !== 1 ? 's' : ''}`
              )}
            </button>
          )}
        </>
      )}
    </div>
  )
}
