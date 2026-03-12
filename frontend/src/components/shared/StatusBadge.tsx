import { STATUS, STATUS_LABELS, STATUS_COLORS } from '@/types'

/** Glow shadow styles keyed by status — color-matched to phase */
const STATUS_GLOW: Record<number, string> = {
  [STATUS.ACTIVE]: '0 0 12px rgba(34, 197, 94, 0.25)',
  [STATUS.CLOSED]: '0 0 12px rgba(245, 158, 11, 0.2)',
  [STATUS.REVEALING]: '0 0 12px rgba(245, 158, 11, 0.25)',
  [STATUS.SETTLED]: '0 0 12px rgba(59, 130, 246, 0.25)',
  [STATUS.CANCELLED]: '0 0 8px rgba(239, 68, 68, 0.15)',
  [STATUS.FAILED]: '0 0 8px rgba(239, 68, 68, 0.15)',
  [STATUS.DISPUTED]: '0 0 10px rgba(249, 115, 22, 0.2)',
  [STATUS.EXPIRED]: 'none',
}

/** Dot color for animated indicator */
const DOT_COLOR: Record<number, string> = {
  [STATUS.ACTIVE]: 'bg-green-400',
  [STATUS.REVEALING]: 'bg-amber-400',
}

interface StatusBadgeProps {
  status: number
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] || 'Unknown'
  const color = STATUS_COLORS[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  const glow = STATUS_GLOW[status] || 'none'
  const dotColor = DOT_COLOR[status]
  const isAnimated = status === STATUS.ACTIVE || status === STATUS.REVEALING

  return (
    <span
      className={`badge ${color} transition-shadow duration-300`}
      style={{ boxShadow: glow }}
    >
      {isAnimated && dotColor && (
        <span className="relative mr-1.5 flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-50 ${dotColor}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
        </span>
      )}
      {label}
    </span>
  )
}
