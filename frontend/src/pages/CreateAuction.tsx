import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { TOKEN_TYPE, AUCTION_MODE, MODE_LABELS, MODE_DESCRIPTIONS, TOKEN_LABELS } from '@/types'
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
  CalendarClock,
  Lock,
  Percent,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import TransactionLink from '@/components/shared/TransactionLink'
import AuctionQR from '@/components/shared/AuctionQR'
import FaucetBanner from '@/components/shared/FaucetBanner'
import ShieldWalletBanner from '@/components/shared/ShieldWalletBanner'
import PrivacyScore from '@/components/shared/PrivacyScore'

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
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)
  const [startPrice, setStartPrice] = useState('')
  const [endPrice, setEndPrice] = useState('')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleBlocks, setScheduleBlocks] = useState('')
  const [timelockEnabled, setTimelockEnabled] = useState(false)
  const [timelockBlocks, setTimelockBlocks] = useState('')
  const [royaltyEnabled, setRoyaltyEnabled] = useState(false)
  const [royaltyPct, setRoyaltyPct] = useState(2.5)
  const [formError, setFormError] = useState<string | null>(null)
  const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null)
  const [onChainAuctionId, setOnChainAuctionId] = useState<string | null>(null)
  const [confirmedTxId, setConfirmedTxId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [idExtractionTimedOut, setIdExtractionTimedOut] = useState(false)
  const [backendNotice, setBackendNotice] = useState<string | null>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)
  const idTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Store form data at submit time for use in the txId-watching useEffect
  const submitDataRef = useRef<{
    title: string
    description: string
    seller: string
    tokenType: number
    deadlineHeight: number
  } | null>(null)

  // Auto-select template from URL params (e.g., /create?template=nft)
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const tpl = searchParams.get('template')
    if (tpl && !activeTemplate) {
      const templates: Record<string, { cat: number; dur: string; mode: number; reserve: string; token: number }> = {
        digital_assets: { cat: 1, dur: '24h', mode: AUCTION_MODE.VICKREY, reserve: '1', token: TOKEN_TYPE.ALEO },
        nft: { cat: 1, dur: '24h', mode: AUCTION_MODE.VICKREY, reserve: '1', token: TOKEN_TYPE.ALEO },
        token_sale: { cat: 4, dur: '12h', mode: AUCTION_MODE.DUTCH, reserve: '0.5', token: TOKEN_TYPE.ALEO },
        services: { cat: 3, dur: '3d', mode: AUCTION_MODE.FIRST_PRICE, reserve: '0.1', token: TOKEN_TYPE.ALEO },
        procurement: { cat: 3, dur: '3d', mode: AUCTION_MODE.FIRST_PRICE, reserve: '0.1', token: TOKEN_TYPE.ALEO },
      }
      const t = templates[tpl]
      if (t) {
        setActiveTemplate(tpl)
        setCategory(t.cat)
        setDuration(t.dur)
        setAuctionMode(t.mode)
        if (t.mode === AUCTION_MODE.DUTCH) {
          setStartPrice(String(parseFloat(t.reserve) * 10))
          setEndPrice(t.reserve)
          setReservePrice('')
        } else {
          setReservePrice(t.reserve)
        }
        setTokenType(t.token)
      }
    }
  }, [searchParams])

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Clipboard API unavailable (non-HTTPS or denied) — silent fail
    })
  }, [])

  // Cleanup polling and timeout on unmount
  useEffect(() => {
    return () => {
      pollCleanupRef.current?.()
      if (idTimeoutRef.current) clearTimeout(idTimeoutRef.current)
    }
  }, [])

  // If TX is confirmed but auction ID extraction is stuck, time out after 2 minutes
  useEffect(() => {
    if (txStatus === 'confirmed' && !onChainAuctionId && createdAuctionId) {
      idTimeoutRef.current = setTimeout(() => {
        if (!onChainAuctionId) {
          setIdExtractionTimedOut(true)
          pollCleanupRef.current?.()
        }
      }, 120_000) // 2 minutes
      return () => {
        if (idTimeoutRef.current) clearTimeout(idTimeoutRef.current)
      }
    }
    // Clear timeout if we get the ID
    if (onChainAuctionId && idTimeoutRef.current) {
      clearTimeout(idTimeoutRef.current)
      idTimeoutRef.current = null
    }
  }, [txStatus, onChainAuctionId, createdAuctionId])

  // Save auction to localStorage so Browse page can find it without backend
  const saveAuctionToLocalCache = useCallback((auctionId: string) => {
    try {
      const CACHE_KEY = 'obscura_auction_ids'
      const data = submitDataRef.current
      const entry = {
        auction_id: auctionId,
        title: data?.title || title.trim(),
        description: data?.description || description.trim(),
      }
      const cached = localStorage.getItem(CACHE_KEY)
      const list = cached ? JSON.parse(cached) : []
      // Don't duplicate
      if (!list.some((e: any) => e.auction_id === auctionId)) {
        list.unshift(entry)
        localStorage.setItem(CACHE_KEY, JSON.stringify(list))
        if (import.meta.env.DEV) console.log('[CreateAuction] Saved auction to local cache:', auctionId)
      }
    } catch { /* localStorage unavailable */ }
  }, [title, description])

  // Helper: register auction with backend (best-effort) + save to local cache
  const registerAuctionWithBackend = useCallback((auctionId: string, transactionId: string) => {
    // Always save locally so Browse works without backend
    saveAuctionToLocalCache(auctionId)

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
    }).catch(() => {
      setBackendNotice('Auction created on-chain! The indexer is currently unavailable, so it won\'t appear in Browse. Share the auction ID directly with bidders.')
    })
  }, [saveAuctionToLocalCache])

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
        try {
          const list = JSON.parse(localStorage.getItem('obscura_my_auctions') || '[]') as string[]
          if (!list.includes(realAuctionId)) { list.push(realAuctionId); localStorage.setItem('obscura_my_auctions', JSON.stringify(list)) }
        } catch { /* localStorage unavailable */ }
      }
    )
  }, [txId, createdAuctionId, onChainAuctionId, registerAuctionWithBackend])

  // Fire advanced option calls once we have the on-chain auction ID
  useEffect(() => {
    if (!onChainAuctionId) return
    const opts = (window as any).__obscura_advanced_opts
    if (!opts) return
    delete (window as any).__obscura_advanced_opts

    const auctionKey = onChainAuctionId.endsWith('field') ? onChainAuctionId : `${onChainAuctionId}field`

    const fireAdvancedCalls = async () => {
      const currentHeight = opts.currentHeight || await fetchBlockHeight()

      if (opts.scheduleEnabled && opts.scheduleBlocks) {
        const startBlock = currentHeight + parseInt(opts.scheduleBlocks, 10)
        try {
          await execute({
            functionName: 'set_auction_schedule',
            inputs: [auctionKey, `${startBlock}u64`],
          })
        } catch { /* non-critical */ }
      }

      if (opts.timelockEnabled && opts.timelockBlocks) {
        const revealBlock = currentHeight + parseInt(opts.timelockBlocks, 10) + durationToBlocks(duration) + 5000
        try {
          await execute({
            functionName: 'set_result_timelock',
            inputs: [auctionKey, `${revealBlock}u64`],
          })
        } catch { /* non-critical */ }
      }

      if (opts.royaltyEnabled && opts.royaltyPct > 0 && publicKey) {
        const bps = Math.round(opts.royaltyPct * 100)
        try {
          await execute({
            functionName: 'set_royalty',
            inputs: [auctionKey, publicKey, `${bps}u128`],
          })
        } catch { /* non-critical */ }
      }
    }

    fireAdvancedCalls()
  }, [onChainAuctionId])

  const validate = (): boolean => {
    if (!title.trim()) {
      setFormError('Item title is required')
      return false
    }
    if (auctionMode === AUCTION_MODE.DUTCH) {
      if (!startPrice || parseFloat(startPrice) <= 0) {
        setFormError('Starting price must be greater than 0')
        return false
      }
      if (!endPrice || parseFloat(endPrice) <= 0) {
        setFormError('Floor price must be greater than 0')
        return false
      }
      if (parseFloat(startPrice) <= parseFloat(endPrice)) {
        setFormError('Starting price must be higher than floor price')
        return false
      }
    } else {
      if (!reservePrice || parseFloat(reservePrice) <= 0) {
        setFormError('Reserve price must be greater than 0')
        return false
      }
      const micros = Math.floor(parseFloat(reservePrice) * 1_000_000)
      if (micros < 1000) {
        setFormError('Minimum reserve price is 0.001 (1000 microcredits)')
        return false
      }
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
      const nonce = generateNonce()
      const currentHeight = await fetchBlockHeight()
      const deadlineBlocks = durationToBlocks(duration)
      const deadlineHeight = currentHeight + deadlineBlocks + 20
      const startHeight = currentHeight

      const onChainVerify = async () => {
        const found = await scanBlocksForCreateAuction(startHeight, 20)
        if (found) {
          setOnChainAuctionId(found.auctionId)
          try { const l = JSON.parse(localStorage.getItem('obscura_my_auctions') || '[]'); if (!l.includes(found.auctionId)) { l.push(found.auctionId); localStorage.setItem('obscura_my_auctions', JSON.stringify(l)) } } catch {}
          setConfirmedTxId(found.txId)
          registerAuctionWithBackend(found.auctionId, found.txId)
          return true
        }
        return false
      }

      let result
      if (auctionMode === AUCTION_MODE.DUTCH) {
        const startMicros = Math.floor(parseFloat(startPrice) * 1_000_000)
        const endMicros = Math.floor(parseFloat(endPrice) * 1_000_000)
        result = await execute({
          functionName: 'create_dutch_auction',
          inputs: [
            itemHash,
            `${category}u8`,
            `${startMicros}u128`,
            `${endMicros}u128`,
            `${tokenType}u8`,
            nonce,
            `${deadlineHeight}u64`,
          ],
          onChainVerify,
        })
      } else {
        const reserveMicros = toMicrocredits(parseFloat(reservePrice))
        result = await execute({
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
          onChainVerify,
        })
      }

      if (result.transactionId) {
        setCreatedAuctionId(result.transactionId)

        submitDataRef.current = {
          title: title.trim(),
          description: description.trim(),
          seller: publicKey || '',
          tokenType,
          deadlineHeight,
        }

        // Queue advanced option calls (schedule, time-lock, royalty)
        // These will be called after the auction ID is available
        const advancedCallsRef = { scheduleEnabled, scheduleBlocks, timelockEnabled, timelockBlocks, royaltyEnabled, royaltyPct, currentHeight: startHeight }
        if (advancedCallsRef.scheduleEnabled || advancedCallsRef.timelockEnabled || advancedCallsRef.royaltyEnabled) {
          // Store for the onChainAuctionId effect to pick up
          ;(window as any).__obscura_advanced_opts = advancedCallsRef
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
              ? 'Confirmation timed out — the transaction may still confirm. Check the explorer link below.'
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
            ) : idExtractionTimedOut ? (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                <p className="text-xs text-yellow-300 mb-2">
                  Could not extract the auction ID automatically. This can happen with Shield Wallet's delegated proving.
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  Your auction <strong className="text-white">is created on-chain</strong>. To find the auction ID:
                </p>
                <ol className="text-xs text-gray-400 list-decimal list-inside space-y-1 mb-2">
                  <li>Open the transaction in the explorer (link above)</li>
                  <li>Look for the <code className="text-accent-400">create_auction</code> finalize output</li>
                  <li>The auction ID is the <code className="text-accent-400">field</code> value in the first output</li>
                </ol>
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

            {/* Seller address reminder */}
            {publicKey && (
              <div className="bg-accent-500/5 border border-accent-500/20 rounded-lg p-4">
                <p className="text-xs text-accent-300 font-medium mb-1">Important: Save Your Address</p>
                <p className="text-[11px] text-gray-400 mb-2">
                  The winner will need your address to claim their prize. Share it with them after settlement.
                </p>
                <div className="flex items-center gap-2 bg-surface-800 rounded p-2">
                  <p className="text-xs text-white font-mono break-all flex-1">{publicKey}</p>
                  <button
                    onClick={() => handleCopy(publicKey)}
                    className="shrink-0 px-2 py-1 rounded bg-surface-700 hover:bg-surface-600 text-[10px] text-gray-300 transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {backendNotice && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
              <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-300">{backendNotice}</p>
            </div>
          )}

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
  const modeLabel = MODE_LABELS[auctionMode] || 'Unknown'
  const tokenLabel = TOKEN_LABELS[tokenType] || 'ALEO'
  const durationLabel = durations.find(d => d.value === duration)?.label || duration

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <Shield className="w-7 h-7 text-accent-400" />
          Create Auction
        </h1>
        <p className="text-gray-400">
          {auctionMode === AUCTION_MODE.DUTCH
            ? 'Price descends from your starting price. The first buyer to accept wins instantly.'
            : auctionMode === AUCTION_MODE.ENGLISH
            ? 'Open ascending bids. Each bid must beat the current highest. Anti-sniping protection included.'
            : 'All bid amounts remain encrypted until the reveal phase.'}
        </p>
      </div>

      {/* Faucet banner for low balance */}
      <FaucetBanner />
      <ShieldWalletBanner />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {[
          { num: 1, label: 'Item Details', icon: Gavel, done: !!title.trim() },
          { num: 2, label: 'Auction Settings', icon: Info, done: auctionMode === AUCTION_MODE.DUTCH ? (!!startPrice && !!endPrice && parseFloat(startPrice) > 0 && parseFloat(endPrice) > 0) : (!!reservePrice && parseFloat(reservePrice) > 0) },
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
        {/* Use Case Templates */}
        <div className="card">
          <h3 className="text-white font-semibold mb-1 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-400" />
            What are you auctioning?
          </h3>
          <p className="text-[10px] text-gray-600 mb-3">Pick a template to pre-fill the form, or choose Custom for full control.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              {
                id: 'digital_assets',
                label: 'Digital Assets',
                emoji: '🖼️',
                desc: 'NFTs, collectibles, domain names, rare digital items — sealed bids ensure true price discovery',
                cat: 1, dur: '24h', mode: AUCTION_MODE.VICKREY, reserve: '1', token: TOKEN_TYPE.ALEO,
                color: 'border-cyan-500/30',
                activeColor: 'border-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-500/30',
              },
              {
                id: 'token_sale',
                label: 'Token Sales',
                emoji: '🪙',
                desc: 'IDOs, batch clearing, fair distribution — Dutch pricing finds market clearing price with no front-running',
                cat: 4, dur: '12h', mode: AUCTION_MODE.DUTCH, reserve: '0.5', token: TOKEN_TYPE.ALEO,
                color: 'border-orange-500/30',
                activeColor: 'border-orange-400 bg-orange-500/10 ring-1 ring-orange-500/30',
              },
              {
                id: 'services',
                label: 'Services & Contracts',
                emoji: '📋',
                desc: 'Procurement, freelance, DAO proposals, audit bids — suppliers compete privately without collusion',
                cat: 3, dur: '3d', mode: AUCTION_MODE.FIRST_PRICE, reserve: '0.1', token: TOKEN_TYPE.ALEO,
                color: 'border-green-500/30',
                activeColor: 'border-green-400 bg-green-500/10 ring-1 ring-green-500/30',
              },
              {
                id: 'custom',
                label: 'Custom',
                emoji: '⚙️',
                desc: 'Full control — choose any format, token, and duration for your use case',
                cat: 4, dur: '24h', mode: AUCTION_MODE.FIRST_PRICE, reserve: '', token: TOKEN_TYPE.ALEO,
                color: 'border-surface-600',
                activeColor: 'border-accent-400 bg-accent-500/10 ring-1 ring-accent-500/30',
              },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTemplate(t.id)
                  setCategory(t.cat)
                  setDuration(t.dur)
                  setAuctionMode(t.mode)
                  if (t.mode === AUCTION_MODE.DUTCH) {
                    setStartPrice(t.reserve ? String(parseFloat(t.reserve) * 10) : '5')
                    setEndPrice(t.reserve || '0.5')
                    setReservePrice('')
                  } else {
                    if (t.reserve) setReservePrice(t.reserve)
                    setStartPrice('')
                    setEndPrice('')
                  }
                  setTokenType(t.token)
                }}
                className={`p-3 rounded-xl border bg-surface-800/50 text-left transition-all ${
                  activeTemplate === t.id ? t.activeColor : `${t.color} hover:border-white/20 hover:bg-white/[0.02]`
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{t.emoji}</span>
                  <p className="text-sm font-medium text-white">{t.label}</p>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">{t.desc}</p>
                <p className="text-[9px] text-gray-600 mt-1.5 font-mono">
                  {MODE_LABELS[t.mode]?.split('(')[0]?.trim()} · {t.dur}
                </p>
              </button>
            ))}
          </div>

          {/* Template-specific extra fields */}
          {activeTemplate === 'digital_assets' && (
            <div className="mt-4 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/10 space-y-3">
              <p className="text-xs text-cyan-300 font-medium">Asset Details (optional — stored off-chain)</p>
              <input type="text" placeholder="Image URL (e.g., IPFS link)" className="input-field text-sm" onChange={(e) => setDescription(prev => `IMG:${e.target.value}|${prev.replace(/^IMG:[^|]*\|/, '')}`)} />
              <input type="text" placeholder="Asset / Collection Name" className="input-field text-sm" onChange={(e) => setTitle(e.target.value)} />
            </div>
          )}
          {activeTemplate === 'token_sale' && (
            <div className="mt-4 p-3 rounded-lg bg-orange-500/5 border border-orange-500/10 space-y-3">
              <p className="text-xs text-orange-300 font-medium">Token Sale Details</p>
              <input type="text" placeholder="Token Name (e.g., MyDAO Token)" className="input-field text-sm" onChange={(e) => setTitle(e.target.value)} />
              <p className="text-[10px] text-gray-500">Dutch mode: price starts at your reserve and drops over time. First buyer wins.</p>
            </div>
          )}
          {activeTemplate === 'services' && (
            <div className="mt-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10 space-y-3">
              <p className="text-xs text-green-300 font-medium">Procurement Details</p>
              <input type="text" placeholder="What do you need? (e.g., Smart contract audit)" className="input-field text-sm" onChange={(e) => setTitle(e.target.value)} />
              <textarea placeholder="Describe requirements for suppliers..." className="input-field text-sm min-h-[60px] resize-y" onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            </div>
          )}
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
                Stored as an encrypted hash on-chain. The original title is kept off-chain for privacy.
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
            {/* Price fields — mode-aware */}
            {auctionMode === AUCTION_MODE.DUTCH ? (
              <>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5 font-medium">Starting Price</label>
                  <div className="relative">
                    <input type="number" value={startPrice} onChange={(e) => setStartPrice(e.target.value)}
                      placeholder="0.00" min="0.001" step="0.001" className="input-field pr-20" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{tokenLabel}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">The highest price — auction starts here.</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5 font-medium">Floor Price</label>
                  <div className="relative">
                    <input type="number" value={endPrice} onChange={(e) => setEndPrice(e.target.value)}
                      placeholder="0.00" min="0.001" step="0.001" className="input-field pr-20" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{tokenLabel}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    The lowest price. Price drops linearly from starting to floor over the auction duration. First buyer to accept wins instantly.
                  </p>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">Reserve Price</label>
                <div className="relative">
                  <input type="number" value={reservePrice} onChange={(e) => setReservePrice(e.target.value)}
                    placeholder="0.00" min="0.001" step="0.001" className="input-field pr-20" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{tokenLabel}</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Stored encrypted on-chain. Disclosed only after all bids are revealed.
                </p>
              </div>
            )}

            {/* Token Type — options adapt to auction mode */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">Token</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  { type: TOKEN_TYPE.ALEO, label: 'ALEO Credits', desc: 'Private via credits.aleo records', always: true },
                  { type: TOKEN_TYPE.USDCX, label: 'USDCx Stablecoin', desc: 'Public balance stablecoin', always: true },
                  { type: TOKEN_TYPE.USAD, label: 'USAD Stablecoin', desc: 'Public balance stablecoin', always: false },
                ] as const).map((tok) => {
                  // USAD only available for sealed-bid modes (First-Price, Vickrey)
                  const usadAllowed = auctionMode === AUCTION_MODE.FIRST_PRICE || auctionMode === AUCTION_MODE.VICKREY
                  const available = tok.always || usadAllowed
                  if (!available) return null
                  return (
                    <button
                      key={tok.type}
                      type="button"
                      onClick={() => setTokenType(tok.type)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        tokenType === tok.type
                          ? 'border-accent-500 bg-accent-500/10'
                          : 'border-surface-700 bg-surface-800 hover:border-surface-600'
                      }`}
                    >
                      <p className={`text-sm font-medium ${
                        tokenType === tok.type ? 'text-accent-400' : 'text-gray-300'
                      }`}>{tok.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tok.desc}</p>
                    </button>
                  )
                })}
              </div>
              {(auctionMode === AUCTION_MODE.DUTCH || auctionMode === AUCTION_MODE.ENGLISH) && (
                <p className="text-[10px] text-gray-600 mt-1.5">USAD is available for Sealed Bid and Vickrey modes only.</p>
              )}
            </div>

            {/* Auction Mode — 4 formats */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-medium">Auction Format</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { mode: AUCTION_MODE.FIRST_PRICE, label: 'Sealed Bid', icon: '🔒', badge: null },
                  { mode: AUCTION_MODE.VICKREY, label: 'Vickrey', icon: '💡', badge: 'FIRST ON ALEO' },
                  { mode: AUCTION_MODE.DUTCH, label: 'Dutch', icon: '📉', badge: 'NEW' },
                  { mode: AUCTION_MODE.ENGLISH, label: 'English', icon: '📈', badge: 'NEW' },
                ] as const).map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => setAuctionMode(m.mode)}
                    className={`p-2.5 rounded-lg border text-left transition-all relative ${
                      auctionMode === m.mode
                        ? 'border-accent-500 bg-accent-500/10'
                        : 'border-surface-700 bg-surface-800 hover:border-surface-600'
                    }`}
                  >
                    {m.badge && (
                      <span className="absolute -top-1.5 right-1.5 text-[8px] font-bold text-accent-400 bg-accent-500/20 px-1.5 py-0.5 rounded-full">
                        {m.badge}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{m.icon}</span>
                      <p className={`text-xs font-medium ${
                        auctionMode === m.mode ? 'text-accent-400' : 'text-gray-300'
                      }`}>{m.label}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Mode description */}
              <div className="mt-2 p-2.5 rounded-lg bg-surface-800/60 border border-surface-700/50">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <span className="text-white font-medium">{MODE_LABELS[auctionMode]}: </span>
                  {MODE_DESCRIPTIONS[auctionMode]}
                </p>
              </div>
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

        {/* Advanced Options */}
        <div className="card">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-400" />
            3. Advanced Options
          </h3>
          <div className="space-y-4">
            {/* Schedule for later */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-800/40 border border-surface-700/50">
              <button
                type="button"
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className="mt-0.5 shrink-0"
              >
                {scheduleEnabled ? (
                  <ToggleRight className="w-6 h-6 text-accent-400" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-gray-600" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-3.5 h-3.5 text-cyan-400" />
                  <p className="text-sm font-medium text-white">Schedule for later</p>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">Auction is created now but bidding opens later.</p>
                {scheduleEnabled && (
                  <div className="mt-2">
                    <input
                      type="number"
                      min="1"
                      value={scheduleBlocks}
                      onChange={(e) => setScheduleBlocks(e.target.value)}
                      placeholder="Blocks from now (e.g., 240 = ~1 hour)"
                      className="input-field text-sm"
                    />
                    <p className="text-[10px] text-gray-600 mt-1">~{config.blockTime} seconds per block. 240 blocks = ~1 hour.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Time-lock results */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-800/40 border border-surface-700/50">
              <button
                type="button"
                onClick={() => setTimelockEnabled(!timelockEnabled)}
                className="mt-0.5 shrink-0"
              >
                {timelockEnabled ? (
                  <ToggleRight className="w-6 h-6 text-accent-400" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-gray-600" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <p className="text-sm font-medium text-white">Time-lock results</p>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">Keep the winning price private until a specified block.</p>
                {timelockEnabled && (
                  <div className="mt-2">
                    <input
                      type="number"
                      min="1"
                      value={timelockBlocks}
                      onChange={(e) => setTimelockBlocks(e.target.value)}
                      placeholder="Blocks after settlement (e.g., 480 = ~2 hours)"
                      className="input-field text-sm"
                    />
                    <p className="text-[10px] text-gray-600 mt-1">Result is revealed publicly after this delay.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Creator Royalty */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-800/40 border border-surface-700/50">
              <button
                type="button"
                onClick={() => setRoyaltyEnabled(!royaltyEnabled)}
                className="mt-0.5 shrink-0"
              >
                {royaltyEnabled ? (
                  <ToggleRight className="w-6 h-6 text-accent-400" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-gray-600" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Percent className="w-3.5 h-3.5 text-purple-400" />
                  <p className="text-sm font-medium text-white">Set creator royalty</p>
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">Creator receives a percentage on settlement.</p>
                {royaltyEnabled && (
                  <div className="mt-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={royaltyPct}
                        onChange={(e) => setRoyaltyPct(parseFloat(e.target.value))}
                        className="flex-1 accent-purple-500"
                      />
                      <span className="text-sm font-semibold text-purple-400 w-12 text-right">{royaltyPct}%</span>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">{(royaltyPct * 100).toFixed(0)} basis points. Max 10%.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="bg-accent-500/5 border border-accent-500/20 rounded-xl p-4">
          <p className="text-accent-400 text-sm font-medium mb-1">Privacy Guarantees</p>
          <ul className="text-xs text-gray-400 space-y-1">
            {auctionMode === AUCTION_MODE.DUTCH ? (
              <>
                <li>- Starting and floor prices set by you — buyer identity stays private</li>
                <li>- Settlement is instant and atomic — no reveal phase needed</li>
                <li>- Bidder identities are protected through hashed commitments</li>
              </>
            ) : auctionMode === AUCTION_MODE.ENGLISH ? (
              <>
                <li>- Bid amounts are visible (ascending auction format)</li>
                <li>- Bidder identities remain private through hashed commitments</li>
                <li>- Anti-sniping timer prevents last-second manipulation</li>
              </>
            ) : (
              <>
                <li>- Reserve price is hashed on-chain (only you know the exact amount)</li>
                <li>- All bid amounts are sealed in encrypted records</li>
                <li>- Bidder identities are never revealed to other participants</li>
              </>
            )}
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
            <div className="col-span-2 flex items-center gap-1.5">
              <span className="text-gray-500">Privacy: </span>
              <PrivacyScore auctionMode={auctionMode} tokenType={tokenType} size="sm" />
            </div>
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
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Privacy Grade</span>
                <PrivacyScore
                  auctionMode={auctionMode}
                  tokenType={tokenType}
                  size="sm"
                />
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
