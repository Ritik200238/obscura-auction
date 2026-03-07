import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { Shield, Search, Plus, Activity, BookOpen, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useWalletStore } from '@/stores/walletStore'

const navLinks = [
  { to: '/browse', label: 'Browse', icon: Search },
  { to: '/create', label: 'Create', icon: Plus },
  { to: '/my-activity', label: 'My Activity', icon: Activity },
  { to: '/docs', label: 'Docs', icon: BookOpen },
]

export default function Header() {
  const location = useLocation()
  const { address: publicKey, wallet, connected } = useWallet()
  const { setWallet, disconnect: clearStore } = useWalletStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (connected && publicKey) {
      setWallet(publicKey, wallet?.adapter?.name || 'unknown')
    } else if (!connected) {
      clearStore()
    }
  }, [connected, publicKey, wallet, setWallet, clearStore])

  return (
    <header className="sticky top-0 z-50 glass border-b border-surface-700/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-500/30 to-accent-600/20 flex items-center justify-center group-hover:from-accent-500/40 group-hover:to-accent-600/30 transition-all duration-300">
              <Shield className="w-4 h-4 text-accent-400" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              Obscura
            </span>
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-500/10 text-accent-400 border border-accent-500/20">
              Testnet
            </span>
          </Link>

          {/* Nav Links - Desktop */}
          <nav className="hidden md:flex items-center gap-0.5">
            {navLinks.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'text-accent-400 bg-accent-500/10'
                      : 'text-gray-400 hover:text-white hover:bg-surface-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Wallet Button + Mobile Menu Toggle */}
          <div className="flex items-center gap-3">
            <WalletMultiButton />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-surface-800/60 transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <nav className="md:hidden pb-4 border-t border-surface-700/30 mt-2 pt-3 space-y-1 animate-fade-in">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  location.pathname === to
                    ? 'text-accent-400 bg-accent-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-surface-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}
