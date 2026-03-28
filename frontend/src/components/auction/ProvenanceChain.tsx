import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import { fetchMapping, truncateId } from '@/lib/aleo'

interface ProvenanceChainProps {
  auctionId: string
}

interface ChainLink {
  id: string
  isOrigin: boolean
  isCurrent: boolean
}

export default function ProvenanceChain({ auctionId }: ProvenanceChainProps) {
  const [chain, setChain] = useState<ChainLink[]>([])
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!auctionId) return

    const buildChain = async () => {
      const links: ChainLink[] = []
      let currentId = auctionId
      const visited = new Set<string>()
      const MAX_DEPTH = 10

      // Walk backwards from current to origin
      while (links.length < MAX_DEPTH) {
        if (visited.has(currentId)) break
        visited.add(currentId)

        const key = currentId.endsWith('field') ? currentId : `${currentId}field`
        const prevRaw = await fetchMapping('provenance', key)

        if (!prevRaw) break

        const prevId = prevRaw.replace(/field\s*$/, '').replace(/"/g, '').trim()

        if (prevId === '0' || prevId === '') {
          // This is the origin
          links.unshift({ id: currentId, isOrigin: true, isCurrent: currentId === auctionId })
          break
        }

        links.unshift({ id: currentId, isOrigin: false, isCurrent: currentId === auctionId })
        currentId = prevId
      }

      // Add the first item if we traced back to a previous auction
      if (links.length > 0 && !links[0].isOrigin && currentId !== links[0].id) {
        links.unshift({ id: currentId, isOrigin: true, isCurrent: false })
      }

      setChain(links)
      setChecked(true)
    }

    buildChain()
  }, [auctionId])

  if (!checked || chain.length === 0) return null

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Link2 className="w-4 h-4 text-accent-400" />
        <h3 className="text-sm font-semibold text-white">Auction History</h3>
        <span className="text-[10px] text-gray-600">Provenance chain</span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {chain.map((link, i) => (
          <div key={link.id} className="flex items-center gap-1">
            {link.isCurrent ? (
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-accent-500/10 text-accent-400 border border-accent-500/20">
                {link.isOrigin ? 'Original' : `#${truncateId(link.id, 6)}`}
                {link.isCurrent && ' (Current)'}
              </span>
            ) : (
              <Link
                to={`/auction/${link.id}`}
                className="px-2 py-1 rounded-lg text-xs font-medium bg-surface-800/80 text-gray-400 hover:text-accent-400 hover:bg-accent-500/10 border border-surface-700/50 hover:border-accent-500/20 transition-all"
              >
                {link.isOrigin ? 'Original' : `#${truncateId(link.id, 6)}`}
              </Link>
            )}
            {i < chain.length - 1 && (
              <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
