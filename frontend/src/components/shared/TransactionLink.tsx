import { ExternalLink } from 'lucide-react'
import { config } from '@/lib/config'

interface TransactionLinkProps {
  txId: string
  label?: string
  className?: string
}

export default function TransactionLink({ txId, label, className = '' }: TransactionLinkProps) {
  const explorerUrl = `${config.explorerUrl}/${config.network}/transaction/${txId}`
  const displayLabel = label || `${txId.slice(0, 12)}...${txId.slice(-6)}`

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
