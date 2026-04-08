import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { staggerContainer, fadeInUp } from '@/lib/animations'
import {
  FileText, Plus, RefreshCw, Clock, Users, Loader2,
  PackageOpen, X, AlertCircle, Send, CheckCircle, Coins
} from 'lucide-react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useBlockHeight } from '@/contexts/BlockHeightContext'
import { fetchMapping, truncateId, hashStringToField, generateNonce, toMicrocredits, blockHeightToTime, fetchBlockHeight, serializeRecordForTx, fetchCreditsRecord } from '@/lib/aleo'
import { config } from '@/lib/config'
import { TOKEN_TYPE, TOKEN_LABELS, CATEGORY_LABELS } from '@/types'
import toast from 'react-hot-toast'
import { ShimmerCard } from '@/components/shared/Shimmer'
import FaucetBanner from '@/components/shared/FaucetBanner'
import TransactionProgress from '@/components/shared/TransactionProgress'
import PlatformTabs from '@/components/shared/PlatformTabs'

interface RFQData {
  rfq_id: string
  buyer_hash: string
  category: number
  max_budget_hash: string
  description_hash: string
  deadline_block: number
  token_type: number
  is_active: boolean
  quote_count: number
}

function parseRFQ(raw: string, rfqId: string): RFQData | null {
  const extract = (field: string): string => {
    const regex = new RegExp(`${field}:\\s*([^,}]+)`)
    const match = raw.match(regex)
    return match ? match[1].trim() : ''
  }

  return {
    rfq_id: rfqId,
    buyer_hash: extract('buyer_hash').replace(/field\s*$/, '').trim(),
    category: parseInt(extract('category').replace(/u8\s*$/, '').trim(), 10) || 4,
    max_budget_hash: extract('max_budget_hash').replace(/field\s*$/, '').trim(),
    description_hash: extract('description_hash').replace(/field\s*$/, '').trim(),
    deadline_block: parseInt(extract('deadline_block').replace(/u32\s*$/, '').trim(), 10) || 0,
    token_type: parseInt(extract('token_type').replace(/u8\s*$/, '').trim(), 10) || 1,
    is_active: extract('is_active').replace(/u8\s*$/, '').trim() === '1',
    quote_count: 0,
  }
}

export default function Procurement() {
  const { connected } = useWalletStore()
  const { address: publicKey, requestRecords } = useWallet()
  const { execute, loading: txLoading, error: txError, txId, status: txStatus, reset: resetTx } = useTransaction()
  const { blockHeight } = useBlockHeight()
  const [rfqs, setRfqs] = useState<RFQData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'open' | 'my'>('open')
  const [showCreate, setShowCreate] = useState(false)
  const [quotingRfqId, setQuotingRfqId] = useState<string | null>(null)
  const [quoteAmount, setQuoteAmount] = useState('')

  // Create form
  const [rfqCategory, setRfqCategory] = useState(3)
  const [rfqDescription, setRfqDescription] = useState('')
  const [rfqBudget, setRfqBudget] = useState('')
  const [rfqDeadline, setRfqDeadline] = useState('24h')
  const [rfqTokenType, setRfqTokenType] = useState<number>(TOKEN_TYPE.ALEO)
  const [createError, setCreateError] = useState<string | null>(null)

  const CACHE_KEY = 'obscura_rfqs'

  const loadRfqs = useCallback(async () => {
    setLoading(true)
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      const ids: string[] = cached ? JSON.parse(cached) : []

      if (ids.length === 0) {
        setRfqs([])
        setLoading(false)
        return
      }

      const results = await Promise.allSettled(
        ids.map(async (rfqId) => {
          const key = rfqId.endsWith('field') ? rfqId : `${rfqId}field`
          const [raw, countRaw] = await Promise.all([
            fetchMapping('rfq_configs', key, config.marketProgramId),
            fetchMapping('rfq_quote_count', key, config.marketProgramId),
          ])
          if (!raw) return null
          const parsed = parseRFQ(raw, rfqId)
          if (!parsed) return null
          parsed.quote_count = countRaw
            ? parseInt(countRaw.replace(/u64\s*$/, '').trim(), 10) || 0
            : 0
          return parsed
        })
      )

      const loaded = results
        .filter((r): r is PromiseFulfilledResult<RFQData | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((v): v is RFQData => v !== null)

      setRfqs(loaded)
    } catch {
      // silent fail
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadRfqs()
  }, [loadRfqs])

  const saveRfqId = (rfqId: string) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      const ids: string[] = cached ? JSON.parse(cached) : []
      if (!ids.includes(rfqId)) {
        ids.unshift(rfqId)
        localStorage.setItem(CACHE_KEY, JSON.stringify(ids))
      }
    } catch { /* localStorage unavailable */ }
  }

  const durationToBlocks = (dur: string): number => {
    const map: Record<string, number> = {
      '1h': config.blocksPerHour,
      '6h': config.blocksPerHour * 6,
      '12h': config.blocksPerHour * 12,
      '24h': config.blocksPerHour * 24,
      '3d': config.blocksPerHour * 72,
      '7d': config.blocksPerHour * 168,
    }
    return map[dur] || config.blocksPerHour * 24
  }

  const handleCreateRfq = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!connected) {
      setCreateError('Connect your wallet first')
      return
    }
    if (!rfqDescription.trim()) {
      setCreateError('Description is required')
      return
    }
    if (!rfqBudget || parseFloat(rfqBudget) <= 0) {
      setCreateError('Budget must be greater than 0')
      return
    }

    setCreateError(null)
    const descHash = hashStringToField(rfqDescription.trim())
    const nonce = generateNonce()
    const budgetMicros = toMicrocredits(parseFloat(rfqBudget))
    const currentHeight = await fetchBlockHeight()
    const deadlineHeight = currentHeight + durationToBlocks(rfqDeadline)

    const result = await execute({
      program: 'obscura_market_v2.aleo',
      functionName: 'create_rfq',
      inputs: [
        `${rfqCategory}u8`,
        descHash,
        `${budgetMicros}u128`,
        `${deadlineHeight}u64`,
        `${rfqTokenType}u8`,
        nonce,
      ],
    })

    if (result.transactionId) {
      saveRfqId(result.transactionId)
      setTimeout(() => loadRfqs(), 5000)
    }
  }

  const handleSubmitQuote = async (rfqId: string) => {
    if (!connected) {
      toast.error('Connect your wallet first')
      return
    }
    if (!quoteAmount || parseFloat(quoteAmount) <= 0) return

    const nonce = generateNonce()
    const amountMicros = toMicrocredits(parseFloat(quoteAmount))
    const key = rfqId.endsWith('field') ? rfqId : `${rfqId}field`

    await execute({
      program: 'obscura_market_v2.aleo',
      functionName: 'submit_quote',
      inputs: [
        key,
        `${amountMicros}u128`,
        nonce,
      ],
    })

    setQuotingRfqId(null)
    setQuoteAmount('')
    setTimeout(() => loadRfqs(), 5000)
  }

  const openRfqs = rfqs.filter(r => r.is_active)
  const displayed = activeTab === 'open' ? openRfqs : rfqs

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Marketplace</h1>
          <p className="text-sm text-gray-500 mt-1">
            Private auctions, fixed sales, and token offerings on Aleo.
          </p>
        </div>
      </div>

      <PlatformTabs />

      <FaucetBanner />

      {/* Section header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Procurement</h2>
          <p className="text-sm text-gray-500 mt-1">
            Post requests for quotes. Sellers compete to offer the best price privately.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadRfqs}
            disabled={loading}
            className="btn-secondary text-xs inline-flex items-center gap-2 py-2.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              if (!connected) { toast.error('Connect your wallet first'); return }
              setShowCreate(!showCreate)
            }}
            className="btn-primary text-xs inline-flex items-center gap-2 py-2.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Post Request
          </button>
        </div>
      </div>

      {/* Create RFQ Form */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="card mb-6 glow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Post a Request for Quotes</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreateRfq} className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">What do you need?</label>
              <input
                type="text"
                value={rfqDescription}
                onChange={(e) => setRfqDescription(e.target.value)}
                placeholder="e.g. Smart contract audit for DeFi protocol"
                className="input-field"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Category</label>
                <select
                  value={rfqCategory}
                  onChange={(e) => setRfqCategory(Number(e.target.value))}
                  className="input-field"
                >
                  <option value={1}>Art</option>
                  <option value={2}>Collectible</option>
                  <option value={3}>Service</option>
                  <option value={4}>Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Max Budget</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={rfqBudget}
                  onChange={(e) => setRfqBudget(e.target.value)}
                  placeholder="10"
                  className="input-field"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Deadline</label>
                <select
                  value={rfqDeadline}
                  onChange={(e) => setRfqDeadline(e.target.value)}
                  className="input-field"
                >
                  <option value="1h">1 Hour</option>
                  <option value="6h">6 Hours</option>
                  <option value="12h">12 Hours</option>
                  <option value="24h">24 Hours</option>
                  <option value="3d">3 Days</option>
                  <option value="7d">7 Days</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Token</label>
                <select
                  value={rfqTokenType}
                  onChange={(e) => setRfqTokenType(Number(e.target.value))}
                  className="input-field"
                >
                  <option value={TOKEN_TYPE.ALEO}>ALEO</option>
                  <option value={TOKEN_TYPE.USDCX}>USDCx</option>
                  <option value={TOKEN_TYPE.USAD}>USAD</option>
                </select>
              </div>
            </div>
            {createError && (
              <div className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {createError}
              </div>
            )}
            <TransactionProgress
              status={showCreate && !quotingRfqId ? txStatus : 'idle'}
              txId={txId}
              error={txError}
              onRetry={resetTx}
            />
            <button
              type="submit"
              disabled={txLoading || !connected}
              className="btn-primary w-full py-3 text-sm"
            >
              {txLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Posting Request...
                </span>
              ) : (
                'Post Request for Quotes'
              )}
            </button>
          </form>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {(['open', 'my'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-accent-500/10 text-accent-400'
                : 'text-gray-400 hover:text-white hover:bg-surface-800/60'
            }`}
          >
            {tab === 'open' ? 'Open Requests' : 'All Requests'}
          </button>
        ))}
      </div>

      {/* RFQ Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ShimmerCard key={i} />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-accent-600/10 flex items-center justify-center mx-auto mb-5">
            <FileText className="w-10 h-10 text-cyan-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">
            {activeTab === 'open' ? 'No Open Requests' : 'No Requests Yet'}
          </h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
            Post a request for quotes and let sellers compete to offer you the best price privately.
          </p>
          <button
            onClick={() => {
              if (!connected) { toast.error('Connect your wallet first'); return }
              setShowCreate(true)
            }}
            className="btn-primary inline-flex items-center gap-2 text-sm px-6 py-3"
          >
            <Plus className="w-4 h-4" />
            Post First Request
          </button>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {displayed.map((rfq) => (
            <motion.div key={rfq.rfq_id} variants={fadeInUp}>
              <RFQCard
                rfq={rfq}
                currentBlock={blockHeight}
                onQuote={() => {
                  if (!connected) { toast.error('Connect your wallet first'); return }
                  setQuotingRfqId(rfq.rfq_id)
                  setQuoteAmount('')
                  resetTx()
                }}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Quote Modal */}
      <AnimatePresence>
        {quotingRfqId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setQuotingRfqId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="card w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Submit Quote</h3>
                <button onClick={() => setQuotingRfqId(null)} className="text-gray-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Your quote is submitted privately. The buyer will only see the amount if they accept.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Your Quote Amount</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    placeholder="5.0"
                    className="input-field"
                    autoFocus
                  />
                </div>
                <TransactionProgress
                  status={quotingRfqId ? txStatus : 'idle'}
                  txId={txId}
                  error={txError}
                  onRetry={resetTx}
                />
                <button
                  onClick={() => handleSubmitQuote(quotingRfqId)}
                  disabled={txLoading || !quoteAmount}
                  className="btn-primary w-full py-3 text-sm"
                >
                  {txLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Send className="w-4 h-4" />
                      Submit Quote
                    </span>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RFQCard({
  rfq,
  currentBlock,
  onQuote,
}: {
  rfq: RFQData
  currentBlock: number
  onQuote: () => void
}) {
  const categoryLabel = CATEGORY_LABELS[rfq.category] || 'Other'
  const tokenLabel = TOKEN_LABELS[rfq.token_type] || 'ALEO'
  const timeLeft = currentBlock > 0 ? blockHeightToTime(rfq.deadline_block, currentBlock) : '...'
  const isExpired = currentBlock > 0 && currentBlock >= rfq.deadline_block

  return (
    <div className="card relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${
        rfq.is_active && !isExpired
          ? 'from-cyan-500/60 to-accent-500/40'
          : 'from-gray-500/30 to-gray-600/20'
      }`} />

      {!rfq.is_active && (
        <div className="absolute top-3 right-3">
          <span className="badge bg-blue-500/20 text-blue-400 border-blue-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Accepted
          </span>
        </div>
      )}

      <div className="mb-3">
        <p className="text-xs text-gray-600 font-mono">
          RFQ #{truncateId(rfq.rfq_id, 8)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800/80 text-gray-400 text-xs">
          <FileText className="w-3 h-3" />
          {categoryLabel}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800/80 text-gray-400 text-xs">
          <Coins className="w-3 h-3" />
          {tokenLabel}
        </span>
        {rfq.is_active && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs ${
            isExpired ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
          }`}>
            {isExpired ? 'Expired' : 'Open'}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-surface-700/50 mb-4">
        <div className="flex items-center gap-1.5 text-gray-400 text-xs">
          <Users className="w-3.5 h-3.5" />
          <span>{rfq.quote_count} quote{rfq.quote_count !== 1 ? 's' : ''}</span>
        </div>
        {rfq.is_active && !isExpired && currentBlock > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span className="font-medium text-gray-300">{timeLeft}</span>
          </div>
        )}
      </div>

      {rfq.is_active && !isExpired && (
        <button
          onClick={onQuote}
          className="btn-primary w-full py-2.5 text-sm"
        >
          <span className="flex items-center justify-center gap-2">
            <Send className="w-3.5 h-3.5" />
            Submit Quote
          </span>
        </button>
      )}
    </div>
  )
}
