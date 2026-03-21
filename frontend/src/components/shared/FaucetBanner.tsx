import { ExternalLink, Coins } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'

/**
 * Always shows a compact faucet link when wallet is connected.
 * Urgent style when balance is low, subtle when balance is fine.
 */
export default function FaucetBanner() {
  const { connected, balance } = useWalletStore()

  if (!connected) return null

  const lowBalance = balance < 100_000n // less than 0.1 ALEO

  if (lowBalance) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 mb-4">
        <Coins className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-xs text-gray-400 flex-1">
          {balance === 0n ? 'Your wallet has no ALEO.' : 'Your ALEO balance is low.'}{' '}
          <a
            href="https://faucet.aleo.org"
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
      <Coins className="w-3 h-3 text-gray-600" />
      <a
        href="https://faucet.aleo.org"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors inline-flex items-center gap-1"
      >
        Need more testnet tokens? Aleo Faucet
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    </div>
  )
}
