import { Coins } from 'lucide-react'
import { TOKEN_TYPE, TOKEN_LABELS } from '@/types'

interface TokenBadgeProps {
  tokenType: number
}

const tokenColors: Record<number, string> = {
  [TOKEN_TYPE.ALEO]: 'bg-accent-500/10 text-accent-400 border-accent-500/20',
  [TOKEN_TYPE.USDCX]: 'bg-green-500/10 text-green-400 border-green-500/20',
  [TOKEN_TYPE.USAD]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

export default function TokenBadge({ tokenType }: TokenBadgeProps) {
  const color = tokenColors[tokenType] ?? tokenColors[TOKEN_TYPE.ALEO]
  const label = TOKEN_LABELS[tokenType] ?? 'ALEO'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      <Coins className="w-3 h-3" />
      {label}
    </span>
  )
}
