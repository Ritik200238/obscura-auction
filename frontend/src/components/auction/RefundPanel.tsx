import { useState } from 'react'
import { ArrowDownLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useRecordStore } from '@/stores/recordStore'
import { formatTokenAmount, serializeRecordForTx } from '@/lib/aleo'
import TransactionLink from '@/components/shared/TransactionLink'
import type { AuctionData, EscrowReceiptRecord } from '@/types'

interface RefundPanelProps {
  auction: AuctionData
}

export default function RefundPanel({ auction }: RefundPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset } = useTransaction()
  const { connected } = useWalletStore()
  const { getForAuction } = useRecordStore()

  const [claimingIndex, setClaimingIndex] = useState<number | null>(null)
  const [claimedIndices, setClaimedIndices] = useState<Set<number>>(new Set())

  const records = getForAuction(auction.auction_id)
  const receipts = records.receipts
  const bids = records.bids
  const handleRefund = async (_receipt: EscrowReceiptRecord, index: number, matchingBidIndex: number | undefined) => {
    reset()
    setClaimingIndex(index)

    let functionName: string
    const inputs: string[] = []
    // Use raw records (with type suffixes) for the wallet prover
    const rawReceipt = records.rawReceipts[index]
    if (!rawReceipt) {
      setClaimingIndex(null)
      return
    }

    if (matchingBidIndex !== undefined) {
      // For unrevealed bids, need both SealedBid and EscrowReceipt
      functionName = 'claim_unrevealed_refund'
      const rawBid = records.rawBids[matchingBidIndex]
      if (!rawBid) {
        setClaimingIndex(null)
        return
      }
      inputs.push(serializeRecordForTx(rawBid))
      inputs.push(serializeRecordForTx(rawReceipt))
    } else {
      functionName = 'claim_refund'
      inputs.push(serializeRecordForTx(rawReceipt))
    }

    const result = await execute({ functionName, inputs })

    if (result.transactionId) {
      setClaimedIndices((prev) => new Set(prev).add(index))
    }
    setClaimingIndex(null)
  }

  if (receipts.length === 0 && bids.length === 0) {
    return null
  }

  return (
    <div className="card">
      <h3 className="text-white font-semibold flex items-center gap-2 mb-4">
        <ArrowDownLeft className="w-4 h-4 text-blue-400" />
        Claim Refunds
      </h3>

      {receipts.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {connected
            ? 'No escrow receipts found for this auction.'
            : 'Connect your wallet to check for refundable bids.'}
        </p>
      ) : (
        <div className="space-y-3">
          {receipts.map((receipt, i) => {
            const isClaimed = claimedIndices.has(i)
            const isClaiming = claimingIndex === i
            // Check if we have an unrevealed bid matching this receipt
            const matchingBidIdx = bids.findIndex((b) => b.bid_nonce === receipt.bid_nonce)
            const isUnrevealed = matchingBidIdx >= 0

            return (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-800 border border-surface-700"
              >
                <div>
                  <p className="text-sm text-white font-medium">
                    {formatTokenAmount(receipt.escrowed_amount, auction.token_type)}
                  </p>
                  {isUnrevealed && (
                    <p className="text-xs text-yellow-400 mt-0.5">Unrevealed bid</p>
                  )}
                </div>

                {isClaimed ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Refunded
                  </span>
                ) : (
                  <button
                    onClick={() => handleRefund(receipt, i, matchingBidIdx >= 0 ? matchingBidIdx : undefined)}
                    disabled={loading || isClaiming}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    {isClaiming ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isUnrevealed ? (
                      'Claim Unrevealed Refund'
                    ) : (
                      'Claim Refund'
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
            <p className="text-xs text-gray-500">Latest refund TX</p>
            {txStatus === 'pending' && (
              <span className="flex items-center gap-1 text-xs text-accent-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Confirming...
              </span>
            )}
            {txStatus === 'confirmed' && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle className="w-3 h-3" />
                Refunded
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
