import { useState, useEffect } from 'react'
import { AlertCircle, ExternalLink, Download } from 'lucide-react'
import { useWalletStore } from '@/stores/walletStore'

/**
 * Warning banner shown when Shield Wallet is not detected or a non-Shield wallet is connected.
 * Shield Wallet uses delegated proving (server-side), which is required for
 * obscura_v3.aleo's 18 transitions. Other wallets do local WASM proving and fail.
 */
export default function ShieldWalletBanner() {
  const { connected, walletType } = useWalletStore()
  const [shieldDetected, setShieldDetected] = useState(false)

  // Check if Shield Wallet extension is installed (window.shield exists)
  useEffect(() => {
    const check = () => setShieldDetected(!!(window as any).shield)
    check()
    // Re-check after a delay in case extension injects late
    const timer = setTimeout(check, 2000)
    return () => clearTimeout(timer)
  }, [])

  // If connected with Shield Wallet, everything is fine
  if (connected && walletType === 'shield') return null

  // Shield not installed at all — show install instructions
  if (!shieldDetected) {
    return (
      <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
        <Download className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-red-300 mb-1">
            Shield Wallet extension required
          </p>
          <p className="text-xs text-gray-400 leading-relaxed mb-3">
            Obscura requires <strong className="text-white">Shield Wallet</strong> for transactions.
            It uses delegated proving (server-side) to handle our complex on-chain program.
            Other wallets (Leo, Puzzle, Fox) try to prove locally in the browser and will fail.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href="https://chromewebstore.google.com/detail/shield-wallet/hhddpjpacfjaakjioinajgmhlbhfchao"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-500/20 text-accent-400 text-xs font-medium hover:bg-accent-500/30 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Install from Chrome Web Store
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://aleo.org/shield/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-700/80 text-gray-300 text-xs font-medium hover:bg-surface-700 transition-colors"
            >
              Visit shield.app
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            After installing, refresh this page and connect with Shield Wallet.
          </p>
        </div>
      </div>
    )
  }

  // Shield is installed but user connected with a different wallet
  if (connected && walletType !== 'shield') {
    return (
      <div className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-yellow-300 mb-1">
            Switch to Shield Wallet for transactions
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            You're connected with {walletType === 'leo' ? 'Leo' : walletType === 'puzzle' ? 'Puzzle' : walletType === 'fox' ? 'Fox' : 'another'} Wallet,
            which uses local proving and will fail for this program.
            Disconnect and reconnect with <strong className="text-white">Shield Wallet</strong> for reliable transactions.
          </p>
        </div>
      </div>
    )
  }

  return null
}
