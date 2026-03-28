import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { staggerContainer, fadeInUp } from '@/lib/animations'
import {
  Coins, Plus, RefreshCw, Clock, Loader2,
  PackageOpen, X, AlertCircle, TrendingUp, Zap
} from 'lucide-react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useTransaction } from '@/hooks/useTransaction'
import { useWalletStore } from '@/stores/walletStore'
import { useBlockHeight } from '@/contexts/BlockHeightContext'
import { fetchMapping, formatAleoAmount, truncateId, generateNonce, toMicrocredits, fetchBlockHeight, fetchCreditsRecord, serializeRecordForTx, blockHeightToTime } from '@/lib/aleo'
import { config } from '@/lib/config'
import { TOKEN_TYPE, TOKEN_LABELS } from '@/types'
import { ShimmerCard } from '@/components/shared/Shimmer'
import FaucetBanner from '@/components/shared/FaucetBanner'
import TransactionProgress from '@/components/shared/TransactionProgress'

interface TokenSaleData {
  sale_id: string
  seller_hash: string
  total_supply: bigint
  remaining_supply: bigint
  min_price_per_token: bigint
  token_type: number
  deadline_block: number
}

function parseTokenSale(raw: string, saleId: string): TokenSaleData | null {
  const extract = (field: string): string => {
    const regex = new RegExp(`${field}:\\s*([^,}]+)`)
    const match = raw.match(regex)
    return match ? match[1].trim() : ''
  }

  return {
    sale_id: saleId,
    seller_hash: extract('seller_hash').replace(/field\s*$/, '').trim(),
    total_supply: BigInt(extract('total_supply').replace(/u128\s*$/, '').trim() || '0'),
    remaining_supply: BigInt(extract('remaining_supply').replace(/u128\s*$/, '').trim() || '0'),
    min_price_per_token: BigInt(extract('min_price_per_token').replace(/u128\s*$/, '').trim() || '0'),
    token_type: parseInt(extract('token_type').replace(/u8\s*$/, '').trim(), 10) || 1,
    deadline_block: parseInt(extract('deadline_block').replace(/u32\s*$/, '').trim(), 10) || 0,
  }
}

export default function TokenSale() {
  const { connected } = useWalletStore()
  const { address: publicKey, requestRecords } = useWallet()
  const { execute, loading: txLoading, error: txError, txId, status: txStatus, reset: resetTx } = useTransaction()
  const { blockHeight } = useBlockHeight()
  const [sales, setSales] = useState<TokenSaleData[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [biddingSaleId, setBiddingSaleId] = useState<string | null>(null)
  const [bidQuantity, setBidQuantity] = useState('')
  const [bidPrice, setBidPrice] = useState('')

  // Create form
  const [supply, setSupply] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [saleTokenType, setSaleTokenType] = useState<number>(TOKEN_TYPE.ALEO)
  const [deadline, setDeadline] = useState('24h')
  const [createError, setCreateError] = useState<string | null>(null)

  const CACHE_KEY = 'obscura_token_sales'

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
          const raw = await fetchMapping('token_sales', key)
          if (!raw) return null
          return parseTokenSale(raw, saleId)
        })
      )

      const loaded = results
        .filter((r): r is PromiseFulfilledResult<TokenSaleData | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((v): v is TokenSaleData => v !== null)

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!connected) {
      setCreateError('Connect your wallet first')
      return
    }
    if (!supply || parseInt(supply, 10) <= 0) {
      setCreateError('Supply must be greater than 0')
      return
    }
    if (!minPrice || parseFloat(minPrice) <= 0) {
      setCreateError('Minimum price must be greater than 0')
      return
    }

    setCreateError(null)
    const nonce = generateNonce()
    const supplyMicros = toMicrocredits(parseInt(supply, 10))
    const priceMicros = toMicrocredits(parseFloat(minPrice))
    const currentHeight = await fetchBlockHeight()
    const deadlineHeight = currentHeight + durationToBlocks(deadline)

    const result = await execute({
      functionName: 'create_token_sale',
      inputs: [
        `${supplyMicros}u128`,
        `${priceMicros}u128`,
        `${saleTokenType}u8`,
        `${deadlineHeight}u64`,
        nonce,
      ],
    })

    if (result.transactionId) {
      saveSaleId(result.transactionId)
      setTimeout(() => loadSales(), 5000)
    }
  }

  const handleBid = async (sale: TokenSaleData) => {
    if (!connected || !publicKey || !requestRecords) return
    if (!bidQuantity || !bidPrice) return

    setBiddingSaleId(sale.sale_id)
    resetTx()

    const saleKey = sale.sale_id.endsWith('field') ? sale.sale_id : `${sale.sale_id}field`
    const quantityMicros = toMicrocredits(parseInt(bidQuantity, 10))
    const priceMicros = toMicrocredits(parseFloat(bidPrice))
    const nonce = generateNonce()

    try {
      if (sale.token_type === TOKEN_TYPE.ALEO) {
        const totalPayment = parseInt(bidQuantity, 10) * parseFloat(bidPrice)
        const totalMicros = Math.floor(totalPayment * 1_000_000)
        const creditsRecord = await fetchCreditsRecord(requestRecords, totalMicros)
        if (!creditsRecord) {
          setBiddingSaleId(null)
          return
        }
        await execute({
          functionName: 'bid_token_sale',
          inputs: [
            saleKey,
            `${quantityMicros}u128`,
            `${priceMicros}u128`,
            nonce,
            creditsRecord,
          ],
          recordIndices: [4],
        })
      } else {
        await execute({
          functionName: 'bid_token_sale_usdcx',
          inputs: [
            saleKey,
            `${quantityMicros}u128`,
            `${priceMicros}u128`,
            nonce,
          ],
        })
      }
    } catch {
      setBiddingSaleId(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <FaucetBanner />

      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Token Sales</h1>
          <p className="text-gray-400">
            Fair-launch token distributions. Participate in sales with fixed supply and minimum pricing.
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
            Launch Sale
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="card mb-6 glow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Launch Token Sale</h3>
            <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Total Supply</label>
                <input
                  type="number"
                  min="1"
                  value={supply}
                  onChange={(e) => setSupply(e.target.value)}
                  placeholder="1000"
                  className="input-field"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Min Price / Token</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="0.1"
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
              <div>
                <label className="text-xs text-gray-400 block mb-1">Deadline</label>
                <select
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
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
            </div>
            {createError && (
              <div className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {createError}
              </div>
            )}
            <TransactionProgress
              status={showCreate && !biddingSaleId ? txStatus : 'idle'}
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
                  Launching...
                </span>
              ) : (
                'Launch Token Sale'
              )}
            </button>
          </form>
        </motion.div>
      )}

      {/* Sales Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ShimmerCard key={i} />
          ))}
        </div>
      ) : sales.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-500/20 to-cyan-500/10 flex items-center justify-center mx-auto mb-5">
            <TrendingUp className="w-10 h-10 text-accent-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">No Token Sales Yet</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
            Launch a fair-distribution token sale with fixed supply and minimum pricing on Aleo.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary inline-flex items-center gap-2 text-sm px-6 py-3"
          >
            <Plus className="w-4 h-4" />
            Launch First Sale
          </button>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {sales.map((sale) => (
            <motion.div key={sale.sale_id} variants={fadeInUp}>
              <TokenSaleCard
                sale={sale}
                currentBlock={blockHeight}
                onBid={() => {
                  setBiddingSaleId(sale.sale_id)
                  setBidQuantity('')
                  setBidPrice(formatAleoAmount(sale.min_price_per_token))
                  resetTx()
                }}
                isBidding={biddingSaleId === sale.sale_id}
                bidQuantity={bidQuantity}
                bidPrice={bidPrice}
                onBidQuantityChange={setBidQuantity}
                onBidPriceChange={setBidPrice}
                onSubmitBid={() => handleBid(sale)}
                onCancelBid={() => setBiddingSaleId(null)}
                txLoading={biddingSaleId === sale.sale_id && txLoading}
                txStatus={biddingSaleId === sale.sale_id ? txStatus : 'idle'}
                txId={biddingSaleId === sale.sale_id ? txId : null}
                txError={biddingSaleId === sale.sale_id ? txError : null}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}

function TokenSaleCard({
  sale,
  currentBlock,
  onBid,
  isBidding,
  bidQuantity,
  bidPrice,
  onBidQuantityChange,
  onBidPriceChange,
  onSubmitBid,
  onCancelBid,
  txLoading,
  txStatus,
  txId,
  txError,
}: {
  sale: TokenSaleData
  currentBlock: number
  onBid: () => void
  isBidding: boolean
  bidQuantity: string
  bidPrice: string
  onBidQuantityChange: (v: string) => void
  onBidPriceChange: (v: string) => void
  onSubmitBid: () => void
  onCancelBid: () => void
  txLoading: boolean
  txStatus: string
  txId: string | null
  txError: string | null
}) {
  const tokenLabel = TOKEN_LABELS[sale.token_type] || 'ALEO'
  const timeLeft = currentBlock > 0 ? blockHeightToTime(sale.deadline_block, currentBlock) : '...'
  const isExpired = currentBlock > 0 && currentBlock >= sale.deadline_block
  const soldOut = sale.remaining_supply === 0n

  const progressPct = sale.total_supply > 0n
    ? Number(((sale.total_supply - sale.remaining_supply) * 100n) / sale.total_supply)
    : 0

  return (
    <div className="card relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${
        soldOut || isExpired
          ? 'from-gray-500/30 to-gray-600/20'
          : 'from-accent-500/60 to-cyan-500/40'
      }`} />

      {soldOut && (
        <div className="absolute top-3 right-3">
          <span className="badge bg-red-500/20 text-red-400 border-red-500/30">Sold Out</span>
        </div>
      )}

      <div className="mb-3">
        <h3 className="text-white font-semibold text-sm">
          Token Sale #{truncateId(sale.sale_id, 8)}
        </h3>
        <p className="text-xs text-gray-600 font-mono mt-0.5">
          {truncateId(sale.sale_id, 8)}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>Sold</span>
          <span>{progressPct}%</span>
        </div>
        <div className="w-full h-2.5 bg-surface-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-600 to-accent-400 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>{formatAleoAmount(sale.remaining_supply)} remaining</span>
          <span>{formatAleoAmount(sale.total_supply)} total</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800/80 text-gray-400 text-xs">
          <Coins className="w-3 h-3" />
          {tokenLabel}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-accent-500/10 text-accent-400 text-xs">
          <TrendingUp className="w-3 h-3" />
          Min {formatAleoAmount(sale.min_price_per_token)} / token
        </span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-surface-700/50 mb-4">
        {!isExpired && currentBlock > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span className="font-medium text-gray-300">{timeLeft}</span>
          </div>
        )}
        {isExpired && (
          <span className="text-xs text-red-400">Expired</span>
        )}
      </div>

      {!soldOut && !isExpired && !isBidding && (
        <button onClick={onBid} className="btn-primary w-full py-2.5 text-sm">
          <span className="flex items-center justify-center gap-2">
            <Zap className="w-3.5 h-3.5" />
            Participate
          </span>
        </button>
      )}

      {isBidding && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 mb-0.5 block">Quantity</label>
              <input
                type="number"
                min="1"
                value={bidQuantity}
                onChange={(e) => onBidQuantityChange(e.target.value)}
                placeholder="100"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 mb-0.5 block">Price / Token</label>
              <input
                type="number"
                step="0.001"
                value={bidPrice}
                onChange={(e) => onBidPriceChange(e.target.value)}
                placeholder="0.1"
                className="input-field text-sm"
              />
            </div>
          </div>
          {bidQuantity && bidPrice && (
            <p className="text-[10px] text-gray-500">
              Total: {(parseInt(bidQuantity, 10) * parseFloat(bidPrice)).toFixed(6)} {tokenLabel}
            </p>
          )}
          {txStatus !== 'idle' && (
            <TransactionProgress
              status={txStatus as any}
              txId={txId}
              error={txError}
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={onCancelBid}
              className="btn-secondary flex-1 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={onSubmitBid}
              disabled={txLoading || !bidQuantity || !bidPrice}
              className="btn-primary flex-1 py-2 text-xs"
            >
              {txLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
              ) : (
                'Buy Tokens'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
