import { useState } from 'react'
import { Award, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useRecordStore } from '@/stores/recordStore'
import { formatTokenAmount, formatAleoAmount, serializeRecordForTx } from '@/lib/aleo'
import { AUCTION_MODE, type AuctionData } from '@/types'
import { config } from '@/lib/config'
import TransactionLink from '@/components/shared/TransactionLink'

interface ClaimPanelProps {
  auction: AuctionData
  highestBid: bigint
  secondHighest: bigint
}

export default function ClaimPanel({ auction, highestBid, secondHighest }: ClaimPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset } = useTransaction()
  const { connected } = useWalletStore()
  const { getForAuction } = useRecordStore()

  const [sellerAddress, setSellerAddress] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const records = getForAuction(auction.auction_id)
  const winnerCert = records.winnerCert
  const bid = records.bids[0]
  const receipt = records.receipts[0]

  const isVickrey = auction.auction_mode === AUCTION_MODE.VICKREY
  const feeBps = config.platformFeeBps
  const feeAmount = highestBid * BigInt(feeBps) / 10000n
  // Contract always charges bid.bid_amount (first price) regardless of mode
  const sellerPayout = highestBid - feeAmount

  const handleClaim = async () => {
    setFormError(null)
    reset()

    if (!connected) {
      setFormError('Connect your wallet first')
      return
    }

    if (!bid || !receipt) {
      setFormError('Missing bid or escrow receipt records in your wallet')
      return
    }

    if (!sellerAddress.startsWith('aleo1') || sellerAddress.length < 60) {
      setFormError('Enter a valid Aleo address for the seller')
      return
    }

    let functionName: string
    // Use raw records (with type suffixes) for the wallet prover
    const rawBid = records.rawBids[0]
    const rawReceipt = records.rawReceipts[0]
    const inputs: string[] = [
      serializeRecordForTx(rawBid),
      serializeRecordForTx(rawReceipt),
      sellerAddress,
      auction.item_hash.endsWith('field') ? auction.item_hash : `${auction.item_hash}field`,
    ]

    functionName = 'claim_win'

    await execute({ functionName, inputs })
  }

  // Already claimed
  if (winnerCert) {
    return (
      <div className="card">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold mb-1">Item Claimed</h3>
            <p className="text-gray-400 text-sm mb-3">
              You have successfully claimed your winning item. Your WinnerCertificate
              record serves as proof of ownership.
            </p>
            <div className="bg-surface-800 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-0.5">Amount Paid</p>
              <p className="text-sm text-white">
                {formatTokenAmount(winnerCert.winning_amount, auction.token_type)}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (txId) {
    return (
      <div className="card">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold mb-1">Claim Submitted</h3>
            <p className="text-gray-400 text-sm mb-3">
              {txStatus === 'confirmed'
                ? 'Your claim has been confirmed. You now have a WinnerCertificate record.'
                : txStatus === 'failed'
                ? 'Claim transaction was rejected.'
                : 'Your claim transaction has been submitted. Waiting for confirmation...'}
            </p>
            {txStatus === 'pending' && (
              <div className="flex items-center gap-2 text-xs text-accent-400 mb-3">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Confirming on-chain...</span>
              </div>
            )}
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
        <Award className="w-4 h-4 text-green-400" />
        Claim Winning Item
      </h3>

      {/* Winning info */}
      <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 mb-4">
        <p className="text-green-400 text-sm font-medium mb-2">You won this auction</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Your Bid</span>
            <span className="text-white">{formatAleoAmount(highestBid)} ALEO</span>
          </div>
          {isVickrey && secondHighest > 0n && (
            <div className="flex justify-between">
              <span className="text-gray-400">Second-Highest Bid</span>
              <span className="text-white">{formatAleoAmount(secondHighest)} ALEO</span>
            </div>
          )}
          <div className="flex justify-between border-t border-surface-700 pt-2">
            <span className="text-gray-400">Platform Fee ({feeBps / 100}%)</span>
            <span className="text-gray-500">{formatAleoAmount(feeAmount)} ALEO</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Seller Receives</span>
            <span className="text-white">{formatAleoAmount(sellerPayout)} ALEO</span>
          </div>
        </div>
      </div>

      {/* Seller address input */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-1.5">Seller Address</label>
        <input
          type="text"
          value={sellerAddress}
          onChange={(e) => setSellerAddress(e.target.value)}
          placeholder="aleo1..."
          className="input-field font-mono text-sm"
          disabled={loading}
        />
        <p className="text-xs text-gray-600 mt-1">
          The seller's Aleo address. Required to complete the transfer.
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
        onClick={handleClaim}
        disabled={loading || !connected || !bid || !receipt}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Claiming...
          </>
        ) : !bid || !receipt ? (
          'Missing Records'
        ) : (
          'Claim Winning Item'
        )}
      </button>
    </div>
  )
}
