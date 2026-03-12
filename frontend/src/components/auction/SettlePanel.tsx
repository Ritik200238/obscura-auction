import { useState } from 'react'
import { Scale, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { toMicrocredits, fetchMapping, parseAuctionData } from '@/lib/aleo'
import type { AuctionData } from '@/types'
import TransactionLink from '@/components/shared/TransactionLink'
import TransactionProgress from '@/components/shared/TransactionProgress'

interface SettlePanelProps {
  auction: AuctionData
}

export default function SettlePanel({ auction }: SettlePanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()

  const [reservePrice, setReservePrice] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const handleSettle = async () => {
    setFormError(null)
    reset()

    if (!connected) {
      setFormError('Connect your wallet first')
      return
    }

    const amount = parseFloat(reservePrice)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Enter the reserve price you set when creating this auction')
      return
    }

    const microsStr = toMicrocredits(amount)
    const auctionKey = auction.auction_id.endsWith('field')
      ? auction.auction_id
      : `${auction.auction_id}field`

    // On-chain verification: check if auction status changed to SETTLED (4)
    const onChainVerify = async () => {
      const raw = await fetchMapping('auctions', auctionKey)
      if (!raw) return false
      const updated = parseAuctionData(raw, auction.auction_id)
      return updated.status === 4 // SETTLED
    }

    await execute({
      functionName: 'finalize_auction',
      inputs: [auctionKey, `${microsStr}u128`],
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
          <div>
            <h3 className="text-white font-semibold mb-1">Settlement Submitted</h3>
            <div className="mb-3">
              <TransactionProgress
                status={txStatus}
                txId={txId}
                error={txError}
                onRetry={retryCheck}
              />
            </div>
            <div className="bg-surface-800 rounded-lg p-3">
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
      <h3 className="text-white font-semibold flex items-center gap-2 mb-4">
        <Scale className="w-4 h-4 text-accent-400" />
        Finalize Auction
      </h3>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-accent-500/10 border border-accent-500/20 mb-4">
        <Info className="w-4 h-4 text-accent-400 mt-0.5 shrink-0" />
        <p className="text-sm text-accent-300">
          As the seller, you must finalize the auction after the reveal deadline passes.
          This checks if the highest bid meets your reserve price and determines the winner.
        </p>
      </div>

      {/* Reserve price input */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-1.5">Your Reserve Price</label>
        <input
          type="number"
          value={reservePrice}
          onChange={(e) => setReservePrice(e.target.value)}
          placeholder="Enter the reserve price you set"
          min="0.001"
          step="0.001"
          className="input-field"
          disabled={loading}
        />
        <p className="text-xs text-gray-600 mt-1">
          Re-enter the exact reserve price to prove you know it. The on-chain hash will be
          verified against this value.
        </p>
      </div>

      {/* Errors */}
      {(formError || txError) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{formError || txError}</p>
        </div>
      )}

      <button
        onClick={handleSettle}
        disabled={loading || !connected}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Finalizing...
          </>
        ) : (
          'Finalize Auction'
        )}
      </button>
    </div>
  )
}
