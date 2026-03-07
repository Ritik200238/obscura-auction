import { Clock, AlertTriangle } from 'lucide-react'
import { useCountdown } from '@/hooks/useCountdown'

interface CountdownTimerProps {
  targetBlock: number
  totalDuration?: number
}

export default function CountdownTimer({ targetBlock, totalDuration }: CountdownTimerProps) {
  const { timeRemaining, isExpired, percentage } = useCountdown(targetBlock, totalDuration)

  const urgency = percentage > 90 ? 'critical' : percentage > 70 ? 'warning' : 'normal'

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {isExpired ? (
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
        ) : (
          <Clock className={`w-4 h-4 ${
            urgency === 'critical' ? 'text-red-400 animate-pulse' :
            urgency === 'warning' ? 'text-amber-400' :
            'text-accent-400'
          }`} />
        )}
        <span className={`text-xl font-bold tabular-nums ${
          isExpired ? 'text-gray-500' :
          urgency === 'critical' ? 'text-red-400' :
          urgency === 'warning' ? 'text-amber-400' :
          'text-white'
        }`}>
          {timeRemaining}
        </span>
      </div>
      <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            isExpired ? 'bg-gray-600' :
            urgency === 'critical' ? 'bg-gradient-to-r from-red-500 to-red-400' :
            urgency === 'warning' ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
            'bg-gradient-to-r from-accent-600 to-accent-400'
          }`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
      <p className="text-xs text-gray-600 mt-1.5 font-mono">
        Block #{targetBlock.toLocaleString()}
      </p>
    </div>
  )
}
