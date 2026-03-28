import { useState, useEffect } from 'react'
import { CalendarClock } from 'lucide-react'
import { fetchMapping, blockHeightToTime } from '@/lib/aleo'
import { useBlockHeight } from '@/contexts/BlockHeightContext'

interface ScheduledBannerProps {
  auctionId: string
}

export default function ScheduledBanner({ auctionId }: ScheduledBannerProps) {
  const { blockHeight } = useBlockHeight()
  const [startBlock, setStartBlock] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!auctionId) return
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`

    fetchMapping('scheduled_start', key).then((raw) => {
      if (raw) {
        const block = parseInt(raw.replace(/u64\s*$/, '').trim(), 10)
        if (block > 0) setStartBlock(block)
      }
      setChecked(true)
    }).catch(() => setChecked(true))
  }, [auctionId])

  if (!checked || startBlock === null) return null
  if (blockHeight > 0 && blockHeight >= startBlock) return null // Already started

  const timeUntil = blockHeightToTime(startBlock, blockHeight)

  return (
    <div className="card border-cyan-500/20 bg-cyan-500/5 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-cyan-300">Scheduled Auction</p>
          <p className="text-xs text-gray-400">
            Bidding opens at block #{startBlock.toLocaleString()} ({timeUntil})
          </p>
        </div>
      </div>
    </div>
  )
}
