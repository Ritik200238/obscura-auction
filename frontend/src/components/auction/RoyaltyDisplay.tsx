import { useState, useEffect } from 'react'
import { Percent } from 'lucide-react'
import { fetchMapping, formatAleoAmount } from '@/lib/aleo'
import { TOKEN_LABELS } from '@/types'

interface RoyaltyDisplayProps {
  auctionId: string
  tokenType: number
}

export default function RoyaltyDisplay({ auctionId, tokenType }: RoyaltyDisplayProps) {
  const [bps, setBps] = useState<number | null>(null)
  const [balance, setBalance] = useState<bigint | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!auctionId) return
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`

    Promise.all([
      fetchMapping('royalty_bps', key),
      fetchMapping('royalty_balances', key),
    ]).then(([bpsRaw, balRaw]) => {
      if (bpsRaw) {
        const val = parseInt(bpsRaw.replace(/u128\s*$/, '').trim(), 10)
        if (val > 0) setBps(val)
      }
      if (balRaw) {
        const cleaned = balRaw.replace(/u128\s*$/, '').trim()
        try {
          const b = BigInt(cleaned)
          if (b > 0n) setBalance(b)
        } catch { /* invalid */ }
      }
      setChecked(true)
    }).catch(() => setChecked(true))
  }, [auctionId])

  if (!checked || bps === null) return null

  const pct = (bps / 100).toFixed(1)
  const tokenLabel = TOKEN_LABELS[tokenType] || 'ALEO'

  return (
    <div className="card border-purple-500/10 bg-purple-500/5">
      <div className="flex items-center gap-2 mb-2">
        <Percent className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-semibold text-purple-300">Creator Royalty</h3>
      </div>
      <p className="text-xs text-gray-400">
        The original creator receives <span className="text-white font-semibold">{pct}%</span> on settlement.
      </p>
      {balance !== null && balance > 0n && (
        <p className="text-xs text-gray-400 mt-1">
          Unclaimed royalty: <span className="text-purple-400 font-semibold">{formatAleoAmount(balance)} {tokenLabel}</span>
        </p>
      )}
    </div>
  )
}
