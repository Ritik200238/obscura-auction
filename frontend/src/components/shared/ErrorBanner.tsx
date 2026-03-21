import { AlertCircle, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'

interface ErrorBannerProps {
  error: string | null
  onRetry?: () => void
  onDismiss?: () => void
}

const friendlyMessages: Record<string, string> = {
  'insufficient': 'Not enough tokens. Get testnet ALEO from the faucet.',
  'rejected': 'Transaction rejected. The auction state may have changed — try refreshing.',
  'abort': 'Transaction was aborted by the network.',
  'timeout': 'Request timed out. The network may be busy — try again.',
  'user denied': 'You cancelled the transaction in your wallet.',
  'assert': 'On-chain validation failed. The auction state may have changed (e.g., deadline passed or someone bid first).',
}

function simplifyError(raw: string): string {
  const lower = raw.toLowerCase()
  for (const [key, message] of Object.entries(friendlyMessages)) {
    if (lower.includes(key)) return message
  }
  if (raw.length > 150) return raw.slice(0, 150) + '...'
  return raw
}

export default function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (!error || dismissed) return null

  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
      <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-red-400">{simplifyError(error)}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-xs text-red-300 hover:text-white flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Try Again
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={() => { setDismissed(true); onDismiss() }}
          className="text-gray-600 hover:text-gray-400 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
