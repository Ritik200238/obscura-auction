import { useState, useEffect } from 'react'
import { useBlockHeight } from '@/contexts/BlockHeightContext'
import { config } from '@/lib/config'

interface CountdownResult {
  blocksRemaining: number
  timeRemaining: string
  isExpired: boolean
  percentage: number
  currentHeight: number
}

/**
 * Block-based countdown hook.
 * Uses the shared BlockHeightProvider instead of polling independently.
 * Updates display every second for smooth countdown.
 */
export function useCountdown(targetBlock: number, totalDuration?: number): CountdownResult {
  const { blockHeight: currentHeight } = useBlockHeight()
  const [now, setNow] = useState(Date.now())

  // Tick every second for smooth countdown display
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const blocksRemaining = Math.max(0, targetBlock - currentHeight)
  const isExpired = currentHeight > 0 && blocksRemaining <= 0

  // Calculate time remaining
  const totalSeconds = blocksRemaining * config.blockTime
  let timeRemaining: string

  if (isExpired || currentHeight === 0) {
    timeRemaining = isExpired ? 'Expired' : 'Loading...'
  } else if (totalSeconds < 60) {
    timeRemaining = `${totalSeconds}s`
  } else if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    timeRemaining = `${m}m ${s}s`
  } else if (totalSeconds < 86400) {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    timeRemaining = `${h}h ${m}m`
  } else {
    const d = Math.floor(totalSeconds / 86400)
    const h = Math.floor((totalSeconds % 86400) / 3600)
    timeRemaining = `${d}d ${h}h`
  }

  // Calculate progress percentage
  const total = totalDuration || targetBlock
  const elapsed = total > 0 ? total - blocksRemaining : 0
  const percentage = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : (isExpired ? 100 : 0)

  // Reference `now` to keep the tick effect active
  void now

  return { blocksRemaining, timeRemaining, isExpired, percentage, currentHeight }
}
