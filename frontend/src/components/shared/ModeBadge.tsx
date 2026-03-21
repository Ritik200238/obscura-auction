import { AUCTION_MODE } from '@/types'

interface ModeBadgeProps {
  mode: number
}

const modeConfig: Record<number, { label: string; shortLabel: string; color: string; dot: boolean }> = {
  [AUCTION_MODE.FIRST_PRICE]: {
    label: 'Sealed Bid',
    shortLabel: 'Sealed',
    color: 'bg-surface-800 text-gray-300 border-surface-700',
    dot: false,
  },
  [AUCTION_MODE.VICKREY]: {
    label: 'Vickrey (2nd Price)',
    shortLabel: 'Vickrey',
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    dot: true,
  },
  [AUCTION_MODE.DUTCH]: {
    label: 'Dutch (Descending)',
    shortLabel: 'Dutch',
    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    dot: true,
  },
  [AUCTION_MODE.ENGLISH]: {
    label: 'English (Ascending)',
    shortLabel: 'English',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    dot: true,
  },
}

export default function ModeBadge({ mode }: ModeBadgeProps) {
  const cfg = modeConfig[mode] ?? modeConfig[AUCTION_MODE.FIRST_PRICE]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${cfg.color}`}>
      {cfg.dot && <span className="w-1 h-1 rounded-full bg-current" />}
      <span className="hidden sm:inline">{cfg.label}</span>
      <span className="sm:hidden">{cfg.shortLabel}</span>
    </span>
  )
}
