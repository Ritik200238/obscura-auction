import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { TOKEN_TYPE, AUCTION_MODE } from '@/types'
import { hashStringToField, generateNonce, toMicrocredits, durationToBlocks, fetchBlockHeight, pollForAuctionId, scanBlocksForCreateAuction } from '@/lib/aleo'
import { config } from '@/lib/config'
import {
  Gavel,
  Info,
  CheckCircle,
  ArrowRight,
  Loader2,
  AlertCircle,
  Shield,
  Sparkles,
  TrendingUp,
  Eye,
  Tag,
  Coins,
  Clock,
  Copy,
  Users,
} from 'lucide-react'
import TransactionLink from '@/components/shared/TransactionLink'
import AuctionQR from '@/components/shared/AuctionQR'
import FaucetBanner from '@/components/shared/FaucetBanner'
import ShieldWalletBanner from '@/components/shared/ShieldWalletBanner'

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
  const [tokenType, setTokenType] = useState<number>(TOKEN_TYPE.ALEO)
  const [auctionMode, setAuctionMode] = useState<number>(AUCTION_MODE.FIRST_PRICE)
  const [duration, setDuration] = useState('24h')
  const [formError, setFormError] = useState<string | null>(null)
  const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null)
  const [onChainAuctionId, setOnChainAuctionId] = useState<string | null>(null)
  const [confirmedTxId, setConfirmedTxId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  // Store form data at submit time for use in the txId-watching useEffect
  const submitDataRef = useRef<{
    title: string
    description: string
    seller: string
    tokenType: number
    deadlineHeight: number
  } | null>(null)

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Clipboard API unavailable (non-HTTPS or denied) — silent fail
    })
  }, [])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { pollCleanupRef.current?.() }
  }, [])

  // Helper: register auction with backend (best-effort)
  const registerAuctionWithBackend = useCallback((auctionId: string, transactionId: string) => {
    const data = submitDataRef.current
    if (!data) return
    fetch(`${config.backendApi}/api/auctions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auction_id: auctionId,
        title: data.title,
        description: data.description,
        seller_address: data.seller,
        tx_id: transactionId,
        token_type: data.tokenType,
        deadline: data.deadlineHeight,
      }),
    }).catch(() => { /* best-effort */ })
  }, [])

  // Watch txId from useTransaction — when Shield's temp ID resolves to a real at1... ID,
  // restart pollForAuctionId with the real ID so we can extract the on-chain auction_id.
  useEffect(() => {
    if (!txId || !createdAuctionId || onChainAuctionId) return

    const isRealId = txId.startsWith('at1') || txId.startsWith('au1')
    if (!isRealId) return

    // If createdAuctionId was already a real ID (Leo Wallet), polling was started in handleSubmit
    if (createdAuctionId.startsWith('at1') || createdAuctionId.startsWith('au1')) return

    // Shield case: txId just updated from shield_* to at1... — restart polling
    pollCleanupRef.current?.()
    pollCleanupRef.current = pollForAuctionId(
      txId,
      (realAuctionId) => {
        setOnChainAuctionId(realAuctionId)
        registerAuctionWithBackend(realAuctionId, txId)
      }
    )
  }, [txId, createdAuctionId, onChainAuctionId, registerAuctionWithBackend])

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
    const blocks = durationToBlocks(duration)
    if (blocks < config.minAuctionDuration) {
      setFormError(`Auction duration must be at least ${config.minAuctionDuration} blocks (~1 hour)`)
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

      // Record block height BEFORE submitting — used by onChainVerify to know
      // which blocks to scan for our create_auction transaction.
      const startHeight = currentHeight

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
        // Nuclear fallback for Shield Wallet: scan recent blocks to find our TX.
        // Shield returns shield_* temp IDs and its transactionStatus() may never
        // return the real at1... ID. This scans blocks directly to confirm.
        onChainVerify: async () => {
          const found = await scanBlocksForCreateAuction(startHeight, 15)
          if (found) {
            console.log('[CreateAuction] Block scan found TX:', found.txId, 'Auction:', found.auctionId)
            setOnChainAuctionId(found.auctionId)
            setConfirmedTxId(found.txId)
            registerAuctionWithBackend(found.auctionId, found.txId)
            return true
          }
          return false
        },
      })

      if (result.transactionId) {
        setCreatedAuctionId(result.transactionId)

        submitDataRef.current = {
          title: title.trim(),
          description: description.trim(),
          seller: publicKey || '',
          tokenType,
          deadlineHeight,
        }

        // If the ID is already a real on-chain TX ID (Leo Wallet), start polling immediately
        const isRealId = result.transactionId.startsWith('at1') || result.transactionId.startsWith('au1')
        if (isRealId) {
          pollCleanupRef.current = pollForAuctionId(
            result.transactionId,
            (realAuctionId) => {
              setOnChainAuctionId(realAuctionId)
              registerAuctionWithBackend(realAuctionId, result.transactionId!)
            }
          )
        }
      }
    } catch {
      setFormError('Failed to create auction. Check your wallet and try again.')
    }
  }

  // Success state
  if (txId && createdAuctionId) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="card text-center glow-success">
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Auction Created Successfully!</h2>
          <p className="text-gray-400 mb-4">
            {txStatus === 'confirmed'
              ? 'Your auction has been confirmed on-chain and is now live.'
              : txStatus === 'failed'
              ? 'Transaction was rejected by the network.'
              : txStatus === 'unconfirmed'
              ? 'Transaction submitted but confirmation timed out. It may still confirm — check the explorer shortly.'
              : 'Your auction has been submitted. ZK proof generation + block confirmation takes ~1-3 minutes.'}
          </p>
          {(txStatus === 'pending' || txStatus === 'submitting') && (
            <div className="flex items-center justify-center gap-2 text-xs text-accent-400 mb-4">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Generating ZK proof & confirming on-chain...</span>
            </div>
          )}

          <div className="space-y-3 mb-6">
            <div className="bg-surface-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Transaction</p>
              <TransactionLink txId={confirmedTxId || txId} className="text-sm break-all" />
            </div>

            {onChainAuctionId ? (
              <div className="bg-accent-500/10 border border-accent-500/20 rounded-lg p-4">
                <p className="text-xs text-accent-400 mb-1">On-Chain Auction ID</p>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm text-white font-mono break-all flex-1">{onChainAuctionId}field</p>
                  <button
                    type="button"
                    onClick={() => handleCopy(`${onChainAuctionId}field`)}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-surface-700 transition-colors"
                    title="Copy auction ID"
                  >
                    {copied ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500">Share this ID with bidders so they can find your auction.</p>
              </div>
            ) : txStatus === 'confirmed' || txStatus === 'pending' ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Extracting auction ID from on-chain transaction...</span>
              </div>
            ) : null}

            {/* QR Code for sharing */}
            {onChainAuctionId && (
              <div className="bg-surface-800 rounded-lg p-4">
                <AuctionQR
                  value={`${window.location.origin}/auction/${onChainAuctionId}`}
                  label="Share Auction"
                  sublabel="Bidders can scan this QR to find your auction directly"
                  size={140}
                />
              </div>
            )}
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
                setConfirmedTxId(null)
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

  const categoryLabel = categories.find(c => c.value === category)?.label || 'Other'
  const modeLabel = auctionMode === AUCTION_MODE.VICKREY ? 'Vickrey' : 'First-Price'
  const tokenLabel = tokenType === TOKEN_TYPE.USDCX ? 'USDCx' : 'ALEO'
  const durationLabel = durations.find(d => d.value === duration)?.label || duration

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <Shield className="w-7 h-7 text-accent-400" />
          Create Auction
        </h1>
        <p className="text-gray-400">
          List an item for private sealed-bid auction. All bid amounts remain hidden until
          the reveal phase.
        </p>
      </div>

      {/* Faucet banner for low balance */}
      <FaucetBanner />
      <ShieldWalletBanner />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {[
          { num: 1, label: 'Item Details', icon: Gavel, done: !!title.trim() },
          { num: 2, label: 'Auction Settings', icon: Info, done: !!reservePrice && parseFloat(reservePrice) > 0 },
          { num: 3, label: 'Review & Create', icon: CheckCircle, done: false },
        ].map((step, i) => (
          <div key={step.num} className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              step.done
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-surface-800/80 text-gray-500 border border-surface-700/50'
            }`}>
              <step.icon className="w-3.5 h-3.5" />
              <span>{step.num}. {step.label}</span>
            </div>
            {i < 2 && <ArrowRight className="w-3.5 h-3.5 text-surface-600 shrink-0" />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-6 items-start">
      {/* Left: Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Quick Templates */}
        <div className="card">
          <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-400" />
            Quick Templates
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { label: 'Digital Art', cat: 1, dur: '24h', mode: AUCTION_MODE.VICKREY, reserve: '1' },
              { label: 'Collectible', cat: 2, dur: '3d', mode: AUCTION_MODE.FIRST_PRICE, reserve: '0.5' },
              { label: 'Service', cat: 3, dur: '12h', mode: AUCTION_MODE.FIRST_PRICE, reserve: '0.1' },
            ].map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  setCategory(t.cat)
                  setDuration(t.dur)
                  setAuctionMode(t.mode)
                  setReservePrice(t.reserve)
                }}
                className="p-2.5 rounded-lg border border-surface-700 bg-surface-800 hover:border-accent-500/50 hover:bg-accent-500/5 text-left transition-all"
              >
                <p className="text-xs font-medium text-gray-300">{t.label}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{t.dur} · {t.mode === AUCTION_MODE.VICKREY ? 'Vickrey' : 'First-Price'}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Item Details */}
        <div className="card">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Gavel className="w-4 h-4 text-accent-400" />
            1. Item Details
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">Item Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Rare Aleo Genesis NFT #42"
                className="input-field"
                maxLength={100}
              />
              <p className="text-xs text-gray-600 mt-1">
                Hashed to a field element on-chain via BHP256. Original title stored encrypted off-chain.
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your item in detail — only visible to bidders (stored encrypted off-chain)"
                className="input-field min-h-[80px] resize-y"
                maxLength={500}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">Category</label>
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
            2. Auction Parameters
          </h3>

          <div className="space-y-4">
            {/* Reserve Price */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">Reserve Price</label>
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
                  {tokenType === TOKEN_TYPE.USDCX ? 'USDCx' : 'ALEO'}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Stored as <span className="font-mono text-gray-500">BHP256(reserve_price)</span> on-chain.
                You re-enter it at settlement to prove you know it — disclosed only after all bids are revealed.
                This is a deliberate privacy trade-off: seller protection during bidding, transparency at resolution.
              </p>
            </div>

            {/* Token Type */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">Token</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTokenType(TOKEN_TYPE.ALEO)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    tokenType === TOKEN_TYPE.ALEO
                      ? 'border-accent-500 bg-accent-500/10'
                      : 'border-surface-700 bg-surface-800 hover:border-surface-600'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    tokenType === TOKEN_TYPE.ALEO ? 'text-accent-400' : 'text-gray-300'
                  }`}>
                    ALEO Credits
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Private via credits.aleo records
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTokenType(TOKEN_TYPE.USDCX)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    tokenType === TOKEN_TYPE.USDCX
                      ? 'border-accent-500 bg-accent-500/10'
                      : 'border-surface-700 bg-surface-800 hover:border-surface-600'
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    tokenType === TOKEN_TYPE.USDCX ? 'text-accent-400' : 'text-gray-300'
                  }`}>
                    USDCx Stablecoin
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Public balance via test_usdcx_stablecoin.aleo
                  </p>
                </button>
              </div>
            </div>

            {/* Auction Mode */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">Auction Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    Highest bidder wins and pays their exact bid
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setAuctionMode(AUCTION_MODE.VICKREY)}
                  className={`p-3 rounded-lg border text-left transition-all relative ${
                    auctionMode === AUCTION_MODE.VICKREY
                      ? 'border-accent-500 bg-accent-500/10'
                      : 'border-surface-700 bg-surface-800 hover:border-surface-600'
                  }`}
                >
                  <span className="absolute top-1.5 right-1.5 text-[9px] font-bold text-accent-400 bg-accent-500/20 px-1.5 py-0.5 rounded-full tracking-wide">
                    FIRST ON ALEO
                  </span>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Sparkles className={`w-3.5 h-3.5 ${auctionMode === AUCTION_MODE.VICKREY ? 'text-accent-400' : 'text-gray-500'}`} />
                    <p className={`text-sm font-medium ${
                      auctionMode === AUCTION_MODE.VICKREY ? 'text-accent-400' : 'text-gray-300'
                    }`}>
                      Vickrey (2nd-Price)
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Winner pays 2nd-highest bid. Encourages honest bidding.
                  </p>
                </button>
              </div>

              {/* Vickrey explainer — shown when selected */}
              {auctionMode === AUCTION_MODE.VICKREY && (
                <div className="mt-3 p-3 rounded-lg bg-accent-500/5 border border-accent-500/20">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-accent-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-accent-300 font-medium mb-1">Why Vickrey?</p>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        In a Vickrey auction the winner pays the <span className="text-white">second-highest bid</span>, not their own.
                        This is game-theoretically optimal — bidders are incentivized to bid their true valuation
                        since overbidding never helps and underbidding risks losing.
                        The second-highest bid is tracked on-chain via Aleo's
                        <span className="font-mono text-accent-400"> second_highest_bids</span> mapping.
                        Requires ≥2 revealed bids to settle.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">Bidding Duration</label>
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

        {/* Mobile preview summary */}
        <div className="lg:hidden card border-accent-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-3.5 h-3.5 text-accent-400" />
            <span className="text-xs font-medium text-white">Preview</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-gray-500">Title: </span><span className="text-white truncate">{title.trim() || '—'}</span></div>
            <div><span className="text-gray-500">Mode: </span><span className="text-white">{modeLabel}</span></div>
            <div><span className="text-gray-500">Token: </span><span className="text-white">{tokenLabel}</span></div>
            <div><span className="text-gray-500">Reserve: </span><span className="text-white font-mono">{reservePrice || '—'}</span></div>
          </div>
        </div>

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

      {/* Right: Live Preview Panel */}
      <div className="hidden lg:block">
        <div className="sticky top-24">
          <div className="card border-accent-500/20">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4 text-accent-400" />
              <h3 className="text-sm font-semibold text-white">Live Preview</h3>
            </div>
            <p className="text-[10px] text-gray-600 mb-4">How bidders will see your auction</p>

            {/* Preview card mimicking AuctionCard */}
            <div className="bg-surface-800/60 border border-surface-700/50 rounded-xl p-4 relative overflow-hidden">
              {/* Top gradient bar */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-green-500/60 to-accent-500/40" />

              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-semibold text-sm truncate">
                    {title.trim() || 'Untitled Auction'}
                  </h4>
                  <p className="text-[10px] text-gray-600 font-mono mt-0.5">preview...id</p>
                </div>
                <span className="badge text-xs bg-green-500/20 text-green-400 border-green-500/30 ml-2">
                  Active
                </span>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-700/80 text-gray-400 text-xs">
                  <Tag className="w-3 h-3" /> {categoryLabel}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-700/80 text-gray-400 text-xs">
                  <Coins className="w-3 h-3" /> {tokenLabel}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs ${
                  auctionMode === AUCTION_MODE.VICKREY ? 'bg-brand-cyan/10 text-brand-cyan' : 'bg-surface-700/80 text-gray-400'
                }`}>
                  {modeLabel}
                </span>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-between pt-3 border-t border-surface-700/50">
                <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                  <Users className="w-3.5 h-3.5" />
                  <span>0 bids</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-gray-300 font-medium">{durationLabel}</span>
                </div>
              </div>
            </div>

            {/* Preview details */}
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Reserve</span>
                <span className="text-white font-mono">
                  {reservePrice ? `${reservePrice} ${tokenLabel}` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Mode</span>
                <span className="text-white">{modeLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="text-white">{durationLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Privacy</span>
                <span className="text-green-400">Reserve hashed · Bids sealed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
