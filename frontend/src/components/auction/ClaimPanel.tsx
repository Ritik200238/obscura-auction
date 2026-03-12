import { useState } from 'react'
import { Award, Loader2, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useRecordStore } from '@/stores/recordStore'
import { formatTokenAmount, formatAleoAmount, serializeRecordForTx, fetchMapping } from '@/lib/aleo'
import { AUCTION_MODE, TOKEN_TYPE, type AuctionData } from '@/types'
import { config } from '@/lib/config'
import TransactionLink from '@/components/shared/TransactionLink'
import TransactionProgress from '@/components/shared/TransactionProgress'

interface ClaimPanelProps {
  auction: AuctionData
  highestBid: bigint
  secondHighest: bigint
}

export default function ClaimPanel({ auction, highestBid, secondHighest }: ClaimPanelProps) {
  const { execute, loading, error: txError, txId, status: txStatus, reset, retryCheck } = useTransaction()
  const { connected } = useWalletStore()
  const { getForAuction } = useRecordStore()

  const [sellerAddress, setSellerAddress] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const records = getForAuction(auction.auction_id)
  const winnerCert = records.winnerCert

  // Pick the receipt with the highest escrowed amount (most likely the winning bid).
  // Using receipts[0] blindly fails when a user bid multiple times.
  const receiptIndex = records.receipts.length > 0
    ? records.receipts.reduce((best, r, i) => {
        const amount = BigInt(String(r.escrowed_amount).replace(/[^0-9]/g, '') || '0')
        return amount > best.amount ? { index: i, amount } : best
      }, { index: 0, amount: 0n }).index
    : -1
  const receipt = receiptIndex >= 0 ? records.receipts[receiptIndex] : undefined

  const isVickrey = auction.auction_mode === AUCTION_MODE.VICKREY
  const isUsdcx = auction.token_type === TOKEN_TYPE.USDCX
  const tokenSymbol = isUsdcx ? 'USDCx' : 'ALEO'

  // Vickrey: fee is on the second-highest bid (what the winner actually pays)
  // First-price: fee is on the highest bid
  const effectivePrice = isVickrey && secondHighest > 0n ? secondHighest : highestBid
  const feeBps = config.platformFeeBps
  const feeAmount = effectivePrice * BigInt(feeBps) / 10000n
  const sellerPayout = effectivePrice - feeAmount
  const winnerRefund = isVickrey && secondHighest > 0n && highestBid > secondHighest
    ? highestBid - secondHighest
    : 0n

  // Seller address hash warning — show only when the address is valid and we have a hash to verify against.
  // The on-chain seller_hash = BHP256(seller_address), so we can't verify client-side without
  // the hash function, but we CAN warn that the contract will reject a wrong address.
  const hasSellerHash = auction.seller_hash && auction.seller_hash !== '0' && auction.seller_hash !== ''
  const isValidAddress = sellerAddress.startsWith('aleo1') && sellerAddress.length >= 60
  const showSellerWarning = isValidAddress && hasSellerHash

  const handleClaim = async () => {
    setFormError(null)
    reset()

    if (!connected) {
      setFormError('Connect your wallet first')
      return
    }

    if (!receipt) {
      setFormError('No EscrowReceipt found — you must reveal your bid first to create one')
      return
    }

    if (!sellerAddress.startsWith('aleo1') || sellerAddress.length < 60) {
      setFormError('Enter a valid Aleo address for the seller')
      return
    }

    const rawReceipt = records.rawReceipts[receiptIndex]
    if (!rawReceipt) {
      setFormError('Raw receipt data missing — try refreshing your wallet records')
      return
    }

    const itemHash = auction.item_hash.endsWith('field') ? auction.item_hash : `${auction.item_hash}field`
    const auctionKey = auction.auction_id.endsWith('field')
      ? auction.auction_id
      : `${auction.auction_id}field`

    // On-chain verification: check payment_proofs mapping to confirm claim went through
    const onChainVerify = async () => {
      const proof = await fetchMapping('payment_proofs', auctionKey)
      return proof !== null && proof !== '0field'
    }

    // Select the correct transition based on auction_mode + token_type
    if (isVickrey && winnerRefund > 0n) {
      // Vickrey with savings — needs claimed_second_price
      const functionName = isUsdcx ? 'claim_win_vickrey_usdcx' : 'claim_win_vickrey'
      await execute({
        functionName,
        inputs: [
          serializeRecordForTx(rawReceipt),
          sellerAddress,
          itemHash,
          `${secondHighest}u128`,
        ],
        onChainVerify,
      })
    } else {
      // First-price, or Vickrey where highest == second (no savings)
      const functionName = isUsdcx ? 'claim_win_usdcx' : 'claim_win'
      await execute({
        functionName,
        inputs: [
          serializeRecordForTx(rawReceipt),
          sellerAddress,
          itemHash,
        ],
        onChainVerify,
      })
    }
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
        <Award className="w-4 h-4 text-green-400" />
        Claim Winning Item
      </h3>

      {/* Winning info */}
      <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 mb-4">
        <p className="text-green-400 text-sm font-medium mb-2">You won this auction</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Your Bid</span>
            <span className="text-white">{formatAleoAmount(highestBid)} {tokenSymbol}</span>
          </div>
          {isVickrey && secondHighest > 0n && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-400">Second-Highest Bid</span>
                <span className="text-white">{formatAleoAmount(secondHighest)} {tokenSymbol}</span>
              </div>
              {winnerRefund > 0n && (
                <div className="flex justify-between text-green-400">
                  <span>Vickrey Refund to You</span>
                  <span>+{formatAleoAmount(winnerRefund)} {tokenSymbol}</span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between border-t border-surface-700 pt-2">
            <span className="text-gray-400">
              {isVickrey ? 'Effective Price' : 'Winning Amount'}
            </span>
            <span className="text-white">{formatAleoAmount(effectivePrice)} {tokenSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Platform Fee ({feeBps / 100}%)</span>
            <span className="text-gray-500">{formatAleoAmount(feeAmount)} {tokenSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Seller Receives</span>
            <span className="text-white">{formatAleoAmount(sellerPayout)} {tokenSymbol}</span>
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

      {/* Seller address hash warning — shows when valid address entered and seller_hash exists */}
      {showSellerWarning && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-yellow-300 font-medium">On-chain hash verification active</p>
            <p className="text-xs text-gray-400 mt-0.5">
              The contract stores a BHP256 hash of the seller's address (
              <span className="font-mono text-gray-500">{auction.seller_hash.slice(0, 12)}...</span>).
              If the address you enter doesn't match this hash, the transaction will be rejected on-chain.
              Verify the seller's address through a trusted channel before proceeding.
            </p>
          </div>
        </div>
      )}

      {/* Errors */}
      {(formError || txError) && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{formError || txError}</p>
        </div>
      )}

      <button
        onClick={handleClaim}
        disabled={loading || !connected || !receipt}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Claiming...
          </>
        ) : !receipt ? (
          'Reveal Bid First'
        ) : (
          'Claim Winning Item'
        )}
      </button>
    </div>
  )
}
