import { useState } from 'react'
import { ArrowDownLeft, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useRecordStore } from '@/stores/recordStore'
import { formatTokenAmount, serializeRecordForTx, fetchMapping } from '@/lib/aleo'
import { TOKEN_TYPE, type AuctionData, type EscrowReceiptRecord } from '@/types'
import TransactionLink from '@/components/shared/TransactionLink'
import TransactionProgress from '@/components/shared/TransactionProgress'

interface RefundPanelProps {
  auction: AuctionData
}

export default function RefundPanel({ auction }: RefundPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { getForAuction } = useRecordStore()

  const [claimingIndex, setClaimingIndex] = useState<number | null>(null)
  const [claimedIndices, setClaimedIndices] = useState<Set<number>>(new Set())

  const records = getForAuction(auction.auction_id)
  const receipts = records.receipts
  const isUsdcx = auction.token_type === TOKEN_TYPE.USDCX

  const handleRefund = async (_receipt: EscrowReceiptRecord, index: number) => {
    reset()
    setClaimingIndex(index)

    const rawReceipt = records.rawReceipts[index]
    if (!rawReceipt) {
      setClaimingIndex(null)
      return
    }

    try {
      // On-chain verification: check if auction_escrow decreased (refund processed)
      const auctionKey = auction.auction_id.endsWith('field')
        ? auction.auction_id
        : `${auction.auction_id}field`
      const onChainVerify = async () => {
        const escrow = await fetchMapping('auction_escrow', auctionKey)
        return escrow === null || escrow === '0u128'
      }

      // Select correct refund transition based on token type
      const functionName = isUsdcx ? 'claim_refund_usdcx' : 'claim_refund'
      const result = await execute({
        functionName,
        inputs: [serializeRecordForTx(rawReceipt)],
        onChainVerify,
      })

      if (result.transactionId) {
        setClaimedIndices((prev) => new Set(prev).add(index))
      }
    } finally {
      setClaimingIndex(null)
    }
  }

  if (receipts.length === 0) {
    return null
  }

  return (
    <div className="card">
      <h3 className="text-white font-semibold flex items-center gap-2 mb-4">
        <ArrowDownLeft className="w-4 h-4 text-blue-400" />
        Claim Refunds
      </h3>

      <div className="space-y-3">
          {receipts.map((receipt, i) => {
            const isClaimed = claimedIndices.has(i)
            const isClaiming = claimingIndex === i

            return (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-surface-800 border border-surface-700"
              >
                <div>
                  <p className="text-sm text-white font-medium">
                    {formatTokenAmount(receipt.escrowed_amount, auction.token_type)}
                  </p>
                </div>

                {isClaimed ? (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Refunded
                  </span>
                ) : (
                  <button
                    onClick={() => handleRefund(receipt, i)}
                    disabled={loading || isClaiming}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    {isClaiming ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      'Claim Refund'
                    )}
                  </button>
                )}
              </div>
            )
          })}
      </div>

      {/* Transaction status */}
      {txId && (
        <div className="mt-4 space-y-2">
          <TransactionProgress
            status={txStatus}
            txId={txId}
            error={txError}
            onRetry={retryCheck}
          />
          <div className="bg-surface-800 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-0.5">Latest refund TX</p>
            <TransactionLink txId={txId} className="text-xs break-all" />
          </div>
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
