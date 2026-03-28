import { ExternalLink, Coins } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'

const FAUCET_URL = 'https://faucet.provable.com'

/**
 * Always shows a faucet link — visible even when wallet is not connected.
 * Urgent style when connected with low balance, subtle otherwise.
 */
export default function FaucetBanner() {
  const { connected, balance } = useWalletStore()

  const lowBalance = connected && balance < 100_000n // less than 0.1 ALEO

  if (lowBalance) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 mb-4">
        <Coins className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-xs text-gray-400 flex-1">
          {balance === 0n ? 'Your wallet has no ALEO.' : 'Your ALEO balance is low.'}{' '}
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-400 hover:text-accent-300 transition-colors inline-flex items-center gap-1"
          >
            Get free testnet tokens
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 mb-3">
      <Coins className="w-3 h-3 text-gray-500" />
      <a
        href={FAUCET_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1"
      >
        {connected ? 'Need more testnet tokens?' : 'Get free testnet ALEO'} Faucet
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    </div>
  )
}
