import { Coins } from 'lucide-react'

interface TokenBadgeProps {
  tokenType: number
}

export default function TokenBadge({ tokenType: _tokenType }: TokenBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-accent-500/10 text-accent-400 border border-accent-500/20">
      <Coins className="w-3 h-3" />
      ALEO
    </span>
  )
}
