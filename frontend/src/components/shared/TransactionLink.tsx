import { ExternalLink, Clock } from 'lucide-react'
import { config } from '@/lib/config'

interface TransactionLinkProps {
  txId: string
  label?: string
  className?: string
}

/**
 * Shield Wallet returns temporary IDs like "shield_17733..." that are NOT
 * real on-chain transaction IDs. Only real Aleo TX IDs (starting with "at1")
 * can be looked up on the explorer.
 */
function isTemporaryId(txId: string): boolean {
  return txId.startsWith('shield_') || (!txId.startsWith('at1') && !txId.startsWith('au1'))
}

export default function TransactionLink({ txId, label, className = '' }: TransactionLinkProps) {
  const displayLabel = label || `${txId.slice(0, 12)}...${txId.slice(-6)}`

  if (isTemporaryId(txId)) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-gray-400 text-sm font-mono ${className}`}>
        <Clock className="w-3 h-3 text-yellow-400 animate-pulse" />
        {displayLabel}
        <span className="text-[10px] text-gray-600 font-sans">(proving...)</span>
      </span>
    )
  }

  const explorerUrl = `${config.explorerUrl}/${config.network}/transaction/${txId}`

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-accent-400 hover:text-accent-300 transition-colors text-sm font-mono group ${className}`}
    >
      {displayLabel}
      <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
    </a>
  )
}
