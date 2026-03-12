import { ExternalLink, Coins } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'

/**
 * Shows a faucet link when the connected wallet has zero balance.
 * Also always renders a subtle link for users who might need more tokens.
 */
export default function FaucetBanner() {
  const { connected, balance } = useWalletStore()

  // Only show when connected AND balance is zero (or very low)
  const lowBalance = balance < 100_000n // less than 0.1 ALEO

  if (!connected || !lowBalance) return null

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
          Get free testnet tokens from the Aleo Faucet
          <ExternalLink className="w-3 h-3" />
        </a>
      </p>
    </div>
  )
}
