import { useState, useEffect } from 'react'
import { fetchBlockHeight } from '@/lib/aleo'
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
 * Fetches current block height and estimates remaining time.
 * Auto-refreshes block height every 15 seconds, updates display every second.
 */
export function useCountdown(targetBlock: number, totalDuration?: number): CountdownResult {
  const [currentHeight, setCurrentHeight] = useState(0)
  const [now, setNow] = useState(Date.now())

  // Fetch block height on mount and every 15 seconds
  useEffect(() => {
    let mounted = true

    const fetchHeight = async () => {
      const height = await fetchBlockHeight()
      if (mounted && height > 0) {
        setCurrentHeight(height)
      }
    }

    fetchHeight()
    const interval = setInterval(fetchHeight, 15_000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

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
