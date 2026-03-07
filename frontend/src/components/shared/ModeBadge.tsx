import { AUCTION_MODE } from '@/types'

interface ModeBadgeProps {
  mode: number
}

export default function ModeBadge({ mode }: ModeBadgeProps) {
  const isVickrey = mode === AUCTION_MODE.VICKREY
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
        isVickrey
          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
          : 'bg-surface-800 text-gray-300 border-surface-700'
      }`}
    >
      {isVickrey && (
        <span className="w-1 h-1 rounded-full bg-cyan-400" />
      )}
      {isVickrey ? 'Vickrey' : 'First-Price'}
    </span>
  )
}
