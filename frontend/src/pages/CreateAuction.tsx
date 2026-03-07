import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { TOKEN_TYPE, AUCTION_MODE } from '@/types'
import { hashStringToField, generateNonce, toMicrocredits, durationToBlocks, fetchBlockHeight, pollForAuctionId } from '@/lib/aleo'
import { config } from '@/lib/config'
import {
  Gavel,
  Info,
  CheckCircle,
  ArrowRight,
  Loader2,
  AlertCircle,
  Shield,
} from 'lucide-react'
import TransactionLink from '@/components/shared/TransactionLink'

const categories = [
  { value: 1, label: 'Art' },
  { value: 2, label: 'Collectible' },
  { value: 3, label: 'Service' },
  { value: 4, label: 'Other' },
]

const durations = [
  { value: '1h', label: '1 Hour' },
  { value: '6h', label: '6 Hours' },
  { value: '12h', label: '12 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '3d', label: '3 Days' },
  { value: '7d', label: '7 Days' },
]

export default function CreateAuction() {
  const { execute, loading: txLoading, error: txError, txId, status: txStatus } = useTransaction()
  const { connected } = useWalletStore()
  const { address: publicKey } = useWallet()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(4)
  const [reservePrice, setReservePrice] = useState('')
  const tokenType = TOKEN_TYPE.ALEO
  const [auctionMode, setAuctionMode] = useState<number>(AUCTION_MODE.FIRST_PRICE)
  const [duration, setDuration] = useState('24h')
  const [formError, setFormError] = useState<string | null>(null)
  const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null)
  const [onChainAuctionId, setOnChainAuctionId] = useState<string | null>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { pollCleanupRef.current?.() }
  }, [])

  const validate = (): boolean => {
    if (!title.trim()) {
      setFormError('Item title is required')
      return false
    }
    if (!reservePrice || parseFloat(reservePrice) <= 0) {
      setFormError('Reserve price must be greater than 0')
      return false
    }
    const micros = Math.floor(parseFloat(reservePrice) * 1_000_000)
    if (micros < 1000) {
      setFormError('Minimum reserve price is 0.001 (1000 microcredits)')
      return false
    }
    setFormError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    if (!connected) {
      setFormError('Please connect your wallet first')
      return
    }

    try {
      const itemHash = hashStringToField(title.trim())
      const reserveMicros = toMicrocredits(parseFloat(reservePrice))
      const nonce = generateNonce()
      const currentHeight = await fetchBlockHeight()
      const deadlineBlocks = durationToBlocks(duration)
      // Add 20-block buffer to account for TX confirmation delay
      const deadlineHeight = currentHeight + deadlineBlocks + 20

      const result = await execute({
        functionName: 'create_auction',
        inputs: [
          itemHash,
          `${category}u8`,
          `${reserveMicros}u128`,
          `${auctionMode}u8`,
          `${tokenType}u8`,
          nonce,
          `${deadlineHeight}u64`,
        ],
      })

      if (result.transactionId) {
        setCreatedAuctionId(result.transactionId)

        // Poll explorer to extract the real on-chain auction_id from TX outputs
        const titleTrimmed = title.trim()
        const descTrimmed = description.trim()
        const sellerAddr = publicKey || ''
        const txIdForBackend = result.transactionId

        pollCleanupRef.current = pollForAuctionId(
          result.transactionId,
          (realAuctionId) => {
            setOnChainAuctionId(realAuctionId)

            // Register auction metadata with backend using the REAL on-chain auction_id
            fetch(`${config.backendApi}/api/auctions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                auction_id: realAuctionId,
                title: titleTrimmed,
                description: descTrimmed,
                seller_address: sellerAddr,
                tx_id: txIdForBackend,
                token_type: tokenType,
                deadline: deadlineHeight,
              }),
            }).catch(() => {
              // Backend registration is best-effort — auction still works on-chain
            })
          }
        )
      }
    } catch {
      setFormError('Failed to create auction. Check your wallet and try again.')
    }
  }

  // Success state
  if (txId && createdAuctionId) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="card text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Auction Created</h2>
          <p className="text-gray-400 mb-4">
            {txStatus === 'confirmed'
              ? 'Your auction has been confirmed on-chain and is now live.'
              : txStatus === 'failed'
              ? 'Transaction was rejected by the network.'
              : 'Your auction has been submitted to the Aleo network. Waiting for confirmation...'}
          </p>
          {txStatus === 'pending' && (
            <div className="flex items-center justify-center gap-2 text-xs text-accent-400 mb-4">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Confirming on-chain...</span>
            </div>
          )}

          <div className="space-y-3 mb-6">
            <div className="bg-surface-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Transaction</p>
              <TransactionLink txId={txId} className="text-sm break-all" />
            </div>

            {onChainAuctionId ? (
              <div className="bg-accent-500/10 border border-accent-500/20 rounded-lg p-4">
                <p className="text-xs text-accent-400 mb-1">On-Chain Auction ID</p>
                <p className="text-sm text-white font-mono break-all">{onChainAuctionId}field</p>
                <p className="text-xs text-gray-500 mt-1">Share this ID with bidders so they can find your auction.</p>
              </div>
            ) : txStatus === 'confirmed' || txStatus === 'pending' ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Extracting auction ID from on-chain transaction...</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {onChainAuctionId ? (
              <Link to={`/auction/${onChainAuctionId}`} className="btn-primary flex items-center justify-center gap-2">
                View Auction
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link to="/browse" className="btn-primary flex items-center justify-center gap-2">
                Browse Auctions
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
            <button
              onClick={() => {
                pollCleanupRef.current?.()
                setCreatedAuctionId(null)
                setOnChainAuctionId(null)
                setTitle('')
                setDescription('')
                setReservePrice('')
              }}
              className="btn-secondary"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Shield className="w-7 h-7 text-accent-400" />
          Create Auction
        </h1>
        <p className="text-gray-400">
          List an item for private sealed-bid auction. All bid amounts remain hidden until
          the reveal phase.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Item Details */}
        <div className="card">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Gavel className="w-4 h-4 text-accent-400" />
            Item Details
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Item Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter item title"
                className="input-field"
                maxLength={100}
              />
              <p className="text-xs text-gray-600 mt-1">
                Hashed to a field element on-chain via BHP256. Original title stored encrypted off-chain.
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your item (stored off-chain only)"
                className="input-field min-h-[80px] resize-y"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(Number(e.target.value))}
                className="input-field"
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Auction Parameters */}
        <div className="card">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-accent-400" />
            Auction Parameters
          </h3>

          <div className="space-y-4">
            {/* Reserve Price */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Reserve Price</label>
              <div className="relative">
                <input
                  type="number"
                  value={reservePrice}
                  onChange={(e) => setReservePrice(e.target.value)}
                  placeholder="0.00"
                  min="0.001"
                  step="0.001"
                  className="input-field pr-20"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  ALEO
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Minimum bid to win. Hashed on-chain -- only you know the exact amount until settlement.
              </p>
            </div>

            {/* Token Type — ALEO only */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Token</label>
              <div className="p-3 rounded-lg border border-accent-500 bg-accent-500/10 text-sm font-medium text-accent-400">
                ALEO Credits
              </div>
              <p className="text-xs text-gray-600 mt-1">
                All bids and payouts use private ALEO credits via credits.aleo.
              </p>
            </div>

            {/* Auction Mode */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Auction Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAuctionMode(AUCTION_MODE.FIRST_PRICE)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    auctionMode === AUCTION_MODE.FIRST_PRICE
                      ? 'border-accent-500 bg-accent-500/10'
                      : 'border-surface-700 bg-surface-800 hover:border-surface-600'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    auctionMode === AUCTION_MODE.FIRST_PRICE ? 'text-accent-400' : 'text-gray-300'
                  }`}>
                    First-Price
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Highest bidder wins, pays their bid
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setAuctionMode(AUCTION_MODE.VICKREY)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    auctionMode === AUCTION_MODE.VICKREY
                      ? 'border-accent-500 bg-accent-500/10'
                      : 'border-surface-700 bg-surface-800 hover:border-surface-600'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    auctionMode === AUCTION_MODE.VICKREY ? 'text-accent-400' : 'text-gray-300'
                  }`}>
                    Vickrey
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Requires 2+ bids, tracks 2nd-highest on-chain
                  </p>
                </button>
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Bidding Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="input-field"
              >
                {durations.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">
                Approximate. Calculated in block heights (~{durationToBlocks(duration)} blocks).
              </p>
            </div>
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="bg-accent-500/5 border border-accent-500/20 rounded-xl p-4">
          <p className="text-accent-400 text-sm font-medium mb-1">Privacy Guarantees</p>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>- Reserve price is hashed on-chain (only you know the exact amount)</li>
            <li>- All bid amounts are sealed in encrypted records</li>
            <li>- Bidder identities are never revealed to other participants</li>
            <li>- Item details are stored encrypted off-chain</li>
          </ul>
        </div>

        {/* Errors */}
        {(formError || txError) && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-400">{formError || txError}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={txLoading || !connected}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {txLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating Auction...
            </>
          ) : !connected ? (
            'Connect Wallet to Create'
          ) : (
            <>
              Create Auction
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}
