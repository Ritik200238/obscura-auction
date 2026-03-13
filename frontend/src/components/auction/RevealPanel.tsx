import { useState, useEffect, useRef } from 'react'
import { Eye, Loader2, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useCountdown } from '@/hooks/useCountdown'
import { useRecordStore } from '@/stores/recordStore'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { formatTokenAmount, serializeRecordForTx, fetchCreditsRecord, fetchUsdcxBalance, fetchMapping } from '@/lib/aleo'
import { config } from '@/lib/config'
import { TOKEN_TYPE, type AuctionData, type SealedBidRecord } from '@/types'
import TransactionLink from '@/components/shared/TransactionLink'
import TransactionProgress from '@/components/shared/TransactionProgress'

interface RevealPanelProps {
  auction: AuctionData
}

export default function RevealPanel({ auction }: RevealPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { requestRecords } = useWallet()
  const { timeRemaining, isExpired } = useCountdown(auction.reveal_deadline)
  const { getForAuction } = useRecordStore()

  const [revealingIndex, setRevealingIndex] = useState<number | null>(null)
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set())
  const [revealError, setRevealError] = useState<string | null>(null)

  // Toast notifications for reveal status changes
  const prevTxStatus = useRef(txStatus)
  useEffect(() => {
    if (prevTxStatus.current === txStatus) return
    if (txStatus === 'confirmed') toast.success('Bid revealed successfully!')
    if (txStatus === 'failed') toast.error(txError || 'Reveal transaction failed')
    prevTxStatus.current = txStatus
  }, [txStatus, txError])
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [usdcxBalance, setUsdcxBalance] = useState<bigint | null>(null)

  const records = getForAuction(auction.auction_id)
  const bids = records.bids
  const isUsdcx = auction.token_type === TOKEN_TYPE.USDCX
  const tokenSymbol = isUsdcx ? 'USDCx' : 'ALEO'

  // Pre-fetch USDCx public balance for preemptive insufficiency check
  const { address } = useWalletStore()
  useEffect(() => {
    if (!isUsdcx || !connected || !address) return
    let cancelled = false
    fetchUsdcxBalance(address).then((bal) => { if (!cancelled) setUsdcxBalance(bal) })
    return () => { cancelled = true }
  }, [isUsdcx, connected, address])

  const handleReveal = async (bid: SealedBidRecord, index: number) => {
    reset()
    setRevealingIndex(index)
    setRevealError(null)
    setBalanceError(null)

    try {
      const rawBid = records.rawBids[index]
      if (!rawBid) {
        return
      }

      // On-chain verification: check auction_escrow mapping to confirm escrow was created
      const auctionKey = auction.auction_id.endsWith('field')
        ? auction.auction_id
        : `${auction.auction_id}field`
      const onChainVerify = async () => {
        const escrow = await fetchMapping('auction_escrow', auctionKey)
        return escrow !== null && escrow !== '0u128'
      }

      if (isUsdcx) {
        // USDCx path: check public balance before submitting
        const bidAmountMicro = BigInt(bid.bid_amount.replace(/[^0-9]/g, '') || '0')
        if (address) {
          const balance = await fetchUsdcxBalance(address)
          if (balance < bidAmountMicro) {
            const needed = Number(bidAmountMicro) / 1_000_000
            const have = Number(balance) / 1_000_000
            setBalanceError(
              `Insufficient USDCx balance. Need ${needed.toFixed(3)} USDCx but you have ${have.toFixed(3)}. ` +
              `Deposit USDCx via test_usdcx_stablecoin.aleo first.`
            )
            return
          }
        }

        const result = await execute({
          functionName: 'reveal_bid_usdcx',
          inputs: [serializeRecordForTx(rawBid)],
          onChainVerify,
        })

        if (result.transactionId) {
          setRevealedIndices((prev) => new Set(prev).add(index))
        }
      } else {
        // ALEO path: reveal_bid needs a credits record with sufficient balance
        const bidAmountMicro = parseInt(bid.bid_amount.replace(/[^0-9]/g, ''), 10) || 0
        const feeMicro = Math.floor(config.defaultFee * 1_000_000)
        const totalNeeded = bidAmountMicro + feeMicro

        const creditsRecord = await fetchCreditsRecord(requestRecords, totalNeeded)
        if (!creditsRecord) {
          const bidAleo = (bidAmountMicro / 1_000_000).toFixed(3)
          const feeAleo = config.defaultFee.toFixed(3)
          const totalAleo = (totalNeeded / 1_000_000).toFixed(3)
          setBalanceError(
            `Insufficient balance. You need ${totalAleo} ALEO (bid: ${bidAleo} + fee: ${feeAleo}). ` +
            `Ensure you have enough private ALEO credits in your wallet.`
          )
          return
        }

        const result = await execute({
          functionName: 'reveal_bid',
          inputs: [serializeRecordForTx(rawBid), creditsRecord],
          onChainVerify,
        })

        if (result.transactionId) {
          setRevealedIndices((prev) => new Set(prev).add(index))
        }
      }
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : 'Reveal failed unexpectedly')
    } finally {
      setRevealingIndex(null)
    }
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
          {isUsdcx
            ? ' USDCx will be transferred from your public balance during reveal.'
            : ' Your ALEO credits will be escrowed (locked) during reveal.'}
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
                className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-800 border border-surface-700"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {formatTokenAmount(bid.bid_amount, auction.token_type)}
                  </p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
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
                ) : (() => {
                  // Preemptive balance check for USDCx
                  const bidMicro = BigInt(bid.bid_amount.replace(/[^0-9]/g, '') || '0')
                  const insufficientUsdcx = isUsdcx && usdcxBalance !== null && usdcxBalance < bidMicro
                  return (
                    <button
                      onClick={() => handleReveal(bid, i)}
                      disabled={loading || isRevealing || insufficientUsdcx}
                      className="btn-primary text-xs py-1.5 px-3"
                      title={insufficientUsdcx ? 'Insufficient USDCx balance' : undefined}
                    >
                      {isRevealing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : insufficientUsdcx ? (
                        'Low Balance'
                      ) : (
                        'Reveal'
                      )}
                    </button>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}

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
            <p className="text-xs text-gray-500 mb-0.5">Latest reveal TX</p>
            <TransactionLink txId={txId} className="text-xs break-all" />
          </div>
        </div>
      )}

      {(txError || revealError || balanceError) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mt-4">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{balanceError || revealError || txError}</p>
        </div>
      )}
    </div>
  )
}
