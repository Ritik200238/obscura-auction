import { useState } from 'react'
import { Eye, Loader2, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useCountdown } from '@/hooks/useCountdown'
import { useRecordStore } from '@/stores/recordStore'
import { formatTokenAmount, serializeRecordForTx } from '@/lib/aleo'
import type { AuctionData, SealedBidRecord } from '@/types'
import TransactionLink from '@/components/shared/TransactionLink'

interface RevealPanelProps {
  auction: AuctionData
}

export default function RevealPanel({ auction }: RevealPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset } = useTransaction()
  const { connected } = useWalletStore()
  const { timeRemaining, isExpired } = useCountdown(auction.reveal_deadline)
  const { getForAuction } = useRecordStore()

  const [revealingIndex, setRevealingIndex] = useState<number | null>(null)
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set())

  const records = getForAuction(auction.auction_id)
  const bids = records.bids

  const handleReveal = async (_bid: SealedBidRecord, index: number) => {
    reset()
    setRevealingIndex(index)

    // Pass the raw record (with type suffixes) for the wallet prover
    const rawBid = records.rawBids[index]
    const result = await execute({
      functionName: 'reveal_bid',
      inputs: [serializeRecordForTx(rawBid)],
    })

    if (result.transactionId) {
      setRevealedIndices((prev) => new Set(prev).add(index))
    }
    setRevealingIndex(null)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Eye className="w-4 h-4 text-yellow-400" />
          Reveal Bids
        </h3>
        {!isExpired && (
          <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded border border-yellow-500/20">
            {timeRemaining} to reveal
          </span>
        )}
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
        <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-sm text-yellow-300">
          Unrevealed bids cannot win. Reveal all your bids before the deadline to participate
          in the auction settlement.
        </p>
      </div>

      {bids.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {connected
            ? 'No sealed bids found for this auction in your wallet.'
            : 'Connect your wallet to see your bids.'}
        </p>
      ) : (
        <div className="space-y-3">
          {bids.map((bid, i) => {
            const isRevealed = revealedIndices.has(i)
            const isRevealing = revealingIndex === i

            return (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-800 border border-surface-700"
              >
                <div>
                  <p className="text-sm text-white font-medium">
                    {formatTokenAmount(bid.bid_amount, auction.token_type)}
                  </p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    Nonce: {bid.bid_nonce.slice(0, 12)}...
                  </p>
                </div>

                {isRevealed ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Revealed
                  </span>
                ) : isExpired ? (
                  <span className="text-xs text-red-400">Deadline passed</span>
                ) : (
                  <button
                    onClick={() => handleReveal(bid, i)}
                    disabled={loading || isRevealing}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    {isRevealing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Reveal'
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Transaction status */}
      {txId && (
        <div className="mt-4 bg-surface-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">Latest reveal TX</p>
            {txStatus === 'pending' && (
              <span className="flex items-center gap-1 text-xs text-accent-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Confirming...
              </span>
            )}
            {txStatus === 'confirmed' && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle className="w-3 h-3" />
                Confirmed
              </span>
            )}
          </div>
          <TransactionLink txId={txId} className="text-xs break-all" />
        </div>
      )}

      {txError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mt-4">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{txError}</p>
        </div>
      )}
    </div>
  )
}
