import { STATUS, STATUS_LABELS, STATUS_COLORS } from '@/types'

interface StatusBadgeProps {
  status: number
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] || 'Unknown'
  const color = STATUS_COLORS[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  const isLive = status === STATUS.ACTIVE

  return (
    <span className={`badge ${color}`}>
      {isLive && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1.5" />
      )}
      {label}
    </span>
  )
}
