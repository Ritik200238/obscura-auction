import { Coins } from 'lucide-react'
import { TOKEN_TYPE } from '@/types'

interface TokenBadgeProps {
  tokenType: number
}

export default function TokenBadge({ tokenType }: TokenBadgeProps) {
  const isUsdcx = tokenType === TOKEN_TYPE.USDCX
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${
      isUsdcx
        ? 'bg-green-500/10 text-green-400 border-green-500/20'
        : 'bg-accent-500/10 text-accent-400 border-accent-500/20'
    }`}>
      <Coins className="w-3 h-3" />
      {isUsdcx ? 'USDCx' : 'ALEO'}
    </span>
  )
}
