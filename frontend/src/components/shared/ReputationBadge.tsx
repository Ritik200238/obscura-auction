import { useState, useEffect } from 'react'
import { Shield, Star, AlertTriangle } from 'lucide-react'
import { fetchMapping } from '@/lib/aleo'

interface ReputationBadgeProps {
  sellerHash: string
  size?: 'sm' | 'lg'
}

interface ReputationData {
  completed: number
  disputed: number
  rate: number
}

export default function ReputationBadge({ sellerHash, size = 'sm' }: ReputationBadgeProps) {
  const [rep, setRep] = useState<ReputationData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sellerHash || sellerHash === '0') {
      setLoading(false)
      return
    }

    const key = sellerHash.endsWith('field') ? sellerHash : `${sellerHash}field`

    Promise.all([
      fetchMapping('seller_completed', key),
      fetchMapping('seller_disputed', key),
    ]).then(([completedRaw, disputedRaw]) => {
      const completed = completedRaw
        ? parseInt(completedRaw.replace(/u64\s*$/, '').trim(), 10) || 0
        : 0
      const disputed = disputedRaw
        ? parseInt(disputedRaw.replace(/u64\s*$/, '').trim(), 10) || 0
        : 0
      const total = completed + disputed
      const rate = total > 0 ? (completed / total) * 100 : 100

      setRep({ completed, disputed, rate })
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [sellerHash])

  if (loading || !rep) return null

  const total = rep.completed + rep.disputed
  if (total === 0) return null

  const colorClass =
    rep.rate > 90 ? 'text-green-400 bg-green-500/10 border-green-500/20' :
    rep.rate >= 70 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
    'text-red-400 bg-red-500/10 border-red-500/20'

  const Icon = rep.rate > 90 ? Shield : rep.rate >= 70 ? Star : AlertTriangle

  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${colorClass}`}>
        <Icon className="w-2.5 h-2.5" />
        {Math.round(rep.rate)}%
      </span>
    )
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colorClass}`}>
      <Icon className="w-4 h-4" />
      <div>
        <span className="text-sm font-semibold">{Math.round(rep.rate)}%</span>
        <span className="text-xs ml-1 opacity-70">
          ({rep.completed}/{total})
        </span>
      </div>
    </div>
  )
}
