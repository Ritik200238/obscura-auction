import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { staggerContainer, fadeInUp } from '@/lib/animations'
import {
  ShoppingBag, Plus, RefreshCw, Tag, Coins, CheckCircle,
  Loader2, PackageOpen, X, AlertCircle
} from 'lucide-react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useBlockHeight } from '@/contexts/BlockHeightContext'
import { fetchMapping, formatAleoAmount, truncateId, hashStringToField, generateNonce, toMicrocredits, serializeRecordForTx, fetchCreditsRecord } from '@/lib/aleo'
import { config } from '@/lib/config'
import { TOKEN_TYPE, TOKEN_LABELS } from '@/types'
import { ShimmerCard } from '@/components/shared/Shimmer'
import FaucetBanner from '@/components/shared/FaucetBanner'
import TransactionProgress from '@/components/shared/TransactionProgress'

interface FixedSaleData {
  sale_id: string
  seller_hash: string
  item_hash: string
  price: bigint
  token_type: number
  is_sold: boolean
  title?: string
}

function parseFixedSale(raw: string, saleId: string): FixedSaleData | null {
  const extract = (field: string): string => {
    const regex = new RegExp(`${field}:\\s*([^,}]+)`)
    const match = raw.match(regex)
    return match ? match[1].trim() : ''
  }

  const priceStr = extract('price').replace(/u128\s*$/, '').trim()
  const tokenTypeStr = extract('token_type').replace(/u8\s*$/, '').trim()
  const isSoldStr = extract('is_sold').replace(/u8\s*$/, '').trim()

  return {
    sale_id: saleId,
    seller_hash: extract('seller_hash').replace(/field\s*$/, '').trim(),
    item_hash: extract('item_hash').replace(/field\s*$/, '').trim(),
    price: BigInt(priceStr || '0'),
    token_type: parseInt(tokenTypeStr, 10) || 1,
    is_sold: isSoldStr === '1',
  }
}

const TOKEN_FILTERS = [
  { label: 'All', value: null },
  { label: 'ALEO', value: TOKEN_TYPE.ALEO },
  { label: 'USDCx', value: TOKEN_TYPE.USDCX },
  { label: 'USAD', value: TOKEN_TYPE.USAD },
]

const STATUS_FILTERS = [
  { label: 'All', value: null },
  { label: 'Available', value: 'available' },
  { label: 'Sold', value: 'sold' },
]

export default function FixedSales() {
  const { connected } = useWalletStore()
  const { address: publicKey, requestRecords } = useWallet()
  const { execute, loading: txLoading, error: txError, txId, status: txStatus, reset: resetTx } = useTransaction()
  const [sales, setSales] = useState<FixedSaleData[]>([])
  const [loading, setLoading] = useState(true)
  const [tokenFilter, setTokenFilter] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [buyingSaleId, setBuyingSaleId] = useState<string | null>(null)

  // Create form state
  const [itemName, setItemName] = useState('')
  const [price, setPrice] = useState('')
  const [saleTokenType, setSaleTokenType] = useState<number>(TOKEN_TYPE.ALEO)
  const [createError, setCreateError] = useState<string | null>(null)

  // Load cached sale IDs from localStorage
  const CACHE_KEY = 'obscura_fixed_sales'

  const loadSales = useCallback(async () => {
    setLoading(true)
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      const ids: string[] = cached ? JSON.parse(cached) : []

      if (ids.length === 0) {
        setSales([])
        setLoading(false)
        return
      }

      const results = await Promise.allSettled(
        ids.map(async (saleId) => {
          const key = saleId.endsWith('field') ? saleId : `${saleId}field`
          const raw = await fetchMapping('fixed_sales', key)
          if (!raw) return null
          return parseFixedSale(raw, saleId)
        })
      )

      const loaded = results
        .filter((r): r is PromiseFulfilledResult<FixedSaleData | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((v): v is FixedSaleData => v !== null)

      setSales(loaded)
    } catch {
      // silent fail
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSales()
  }, [loadSales])

  const saveSaleId = (saleId: string) => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      const ids: string[] = cached ? JSON.parse(cached) : []
      if (!ids.includes(saleId)) {
        ids.unshift(saleId)
        localStorage.setItem(CACHE_KEY, JSON.stringify(ids))
      }
    } catch { /* localStorage unavailable */ }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!connected || !publicKey) {
      setCreateError('Connect your wallet first')
      return
    }
    if (!itemName.trim()) {
      setCreateError('Item name is required')
      return
    }
    if (!price || parseFloat(price) <= 0) {
      setCreateError('Price must be greater than 0')
      return
    }

    setCreateError(null)
    const itemHash = hashStringToField(itemName.trim())
    const nonce = generateNonce()
    const priceMicros = toMicrocredits(parseFloat(price))

    const result = await execute({
      functionName: 'create_fixed_sale',
      inputs: [
        itemHash,
        `${priceMicros}u128`,
        `${saleTokenType}u8`,
        nonce,
      ],
    })

    if (result.transactionId) {
      // Save metadata locally
      setTimeout(() => {
        // Attempt to find sale_id from localStorage after some time
        saveSaleId(result.transactionId!)
        loadSales()
      }, 5000)
    }
  }

  const handleBuy = async (sale: FixedSaleData) => {
    if (!connected || !publicKey || !requestRecords) return
    setBuyingSaleId(sale.sale_id)
    resetTx()

    const saleKey = sale.sale_id.endsWith('field') ? sale.sale_id : `${sale.sale_id}field`
    const priceStr = sale.price.toString()

    try {
      if (sale.token_type === TOKEN_TYPE.ALEO) {
        const creditsRecord = await fetchCreditsRecord(requestRecords, Number(sale.price))
        if (!creditsRecord) {
          setBuyingSaleId(null)
          return
        }
        await execute({
          functionName: 'buy_fixed_sale',
          inputs: [
            saleKey,
            creditsRecord,
            `${priceStr}u128`,
          ],
          recordIndices: [1],
        })
      } else if (sale.token_type === TOKEN_TYPE.USDCX) {
        await execute({
          functionName: 'buy_fixed_sale_usdcx',
          inputs: [
            saleKey,
            publicKey,
            `${priceStr}u128`,
          ],
        })
      } else {
        await execute({
          functionName: 'buy_fixed_sale_usad',
          inputs: [
            saleKey,
            publicKey,
            `${priceStr}u128`,
          ],
        })
      }
    } catch {
      setBuyingSaleId(null)
    }
  }

  const filtered = sales.filter((s) => {
    if (tokenFilter !== null && s.token_type !== tokenFilter) return false
    if (statusFilter === 'available' && s.is_sold) return false
    if (statusFilter === 'sold' && !s.is_sold) return false
    return true
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <FaucetBanner />

      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Buy Now</h1>
          <p className="text-gray-400">
            Fixed-price private sales. No bidding, no waiting -- pay the listed price and it is yours.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadSales}
            disabled={loading}
            className="btn-secondary text-xs inline-flex items-center gap-2 py-2.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="btn-primary text-xs inline-flex items-center gap-2 py-2.5"
          >
            <Plus className="w-3.5 h-3.5" />
            List Item
          </button>
        </div>
      </div>

      {/* Create Sale Form */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="card mb-6 glow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Create Fixed-Price Sale</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Item Name</label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Rare NFT #42"
                className="input-field"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Price</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="1.5"
                  className="input-field"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Token</label>
                <select
                  value={saleTokenType}
                  onChange={(e) => setSaleTokenType(Number(e.target.value))}
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
              status={showCreate && !buyingSaleId ? txStatus : 'idle'}
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
                  Creating Sale...
                </span>
              ) : (
                'List for Sale'
              )}
            </button>
          </form>
        </motion.div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex rounded-lg overflow-hidden border border-surface-700">
            {TOKEN_FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setTokenFilter(f.value)}
                className={`px-3 py-2 text-xs font-medium transition-colors min-h-[36px] ${
                  tokenFilter === f.value
                    ? 'bg-accent-500 text-white'
                    : 'bg-surface-800 text-gray-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg overflow-hidden border border-surface-700">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-2 text-xs font-medium transition-colors min-h-[36px] ${
                  statusFilter === f.value
                    ? 'bg-accent-500 text-white'
                    : 'bg-surface-800 text-gray-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sales Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ShimmerCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-accent-600/10 flex items-center justify-center mx-auto mb-5">
            <PackageOpen className="w-10 h-10 text-purple-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">No Fixed Sales Yet</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
            List your first item for a fixed price. Buyers can purchase instantly with no bidding required.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary inline-flex items-center gap-2 text-sm px-6 py-3"
          >
            <Plus className="w-4 h-4" />
            List Item for Sale
          </button>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {filtered.map((sale) => (
            <motion.div key={sale.sale_id} variants={fadeInUp}>
              <FixedSaleCard
                sale={sale}
                onBuy={() => handleBuy(sale)}
                buying={buyingSaleId === sale.sale_id && txLoading}
                txStatus={buyingSaleId === sale.sale_id ? txStatus : 'idle'}
                txId={buyingSaleId === sale.sale_id ? txId : null}
                txError={buyingSaleId === sale.sale_id ? txError : null}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {filtered.length > 0 && (
        <p className="text-center text-gray-600 text-xs mt-6">
          Showing {filtered.length} of {sales.length} sale{sales.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

function FixedSaleCard({
  sale,
  onBuy,
  buying,
  txStatus,
  txId,
  txError,
}: {
  sale: FixedSaleData
  onBuy: () => void
  buying: boolean
  txStatus: string
  txId: string | null
  txError: string | null
}) {
  const tokenLabel = TOKEN_LABELS[sale.token_type] || 'ALEO'

  return (
    <div className="card relative overflow-hidden">
      {/* Top accent */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${
        sale.is_sold
          ? 'from-gray-500/30 to-gray-600/20'
          : 'from-purple-500/60 to-accent-500/40'
      }`} />

      {/* Sold badge */}
      {sale.is_sold && (
        <div className="absolute top-3 right-3">
          <span className="badge bg-gray-500/20 text-gray-400 border-gray-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            SOLD
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-white font-semibold text-sm">
          {sale.title || `Sale #${truncateId(sale.sale_id, 8)}`}
        </h3>
        <p className="text-xs text-gray-600 font-mono mt-0.5">
          {truncateId(sale.sale_id, 8)}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800/80 text-gray-400 text-xs">
          <Coins className="w-3 h-3" />
          {tokenLabel}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800/80 text-gray-400 text-xs">
          <Tag className="w-3 h-3" />
          Fixed Price
        </span>
      </div>

      <div className="flex items-baseline gap-1 mb-4">
        <span className="text-2xl font-bold text-white">
          {formatAleoAmount(sale.price)}
        </span>
        <span className="text-sm text-gray-400">{tokenLabel}</span>
      </div>

      {!sale.is_sold && (
        <>
          <button
            onClick={onBuy}
            disabled={buying}
            className="btn-primary w-full py-3 text-sm"
          >
            {buying ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                Buy Now
              </span>
            )}
          </button>
          {txStatus !== 'idle' && (
            <div className="mt-3">
              <TransactionProgress
                status={txStatus as any}
                txId={txId}
                error={txError}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
