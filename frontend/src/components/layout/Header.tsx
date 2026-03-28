import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui'
import {
  Search, Plus, Activity, BookOpen, Menu, X, BarChart3,
  Lightbulb, Radar, ShoppingBag, TrendingUp, FileText,
  ChevronDown, MoreHorizontal
} from 'lucide-react'
import ObscuraLogo from '@/components/shared/ObscuraLogo'
import { useEffect, useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { useWalletStore } from '@/stores/walletStore'
import { fetchMapping } from '@/lib/aleo'

const primaryNav = [
  { to: '/browse', label: 'Browse', icon: Search },
  { to: '/create', label: 'Create', icon: Plus },
  { to: '/fixed-sales', label: 'Buy Now', icon: ShoppingBag },
  { to: '/token-sale', label: 'Token Sales', icon: TrendingUp },
  { to: '/rfq', label: 'Procurement', icon: FileText },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
]

const moreNav = [
  { to: '/my-activity', label: 'Activity', icon: Activity },
  { to: '/docs', label: 'Docs', icon: BookOpen },
  { to: '/learn', label: 'Learn', icon: Lightbulb },
  { to: '/explorer', label: 'Explorer', icon: Radar },
]

// All nav for mobile
const allNavLinks = [...primaryNav, ...moreNav]

export default function Header() {
  const location = useLocation()
  const { address: publicKey, wallet, connected } = useWallet()
  const { setWallet, disconnect: clearStore, setBalance } = useWalletStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const prevConnected = useRef(connected)

  // Fetch public ALEO balance from credits.aleo/account mapping
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const raw = await fetchMapping('account', address, 'credits.aleo')
      if (raw) {
        const cleaned = raw.replace(/u64\s*$/, '').replace(/"/g, '').trim()
        setBalance(BigInt(cleaned))
      }
    } catch { /* explorer unavailable */ }
  }, [setBalance])

  useEffect(() => {
    if (connected && publicKey) {
      setWallet(publicKey, wallet?.adapter?.name || 'unknown')
      refreshBalance(publicKey)
      if (!prevConnected.current) {
        toast.success('Wallet connected')
      }
    } else if (!connected) {
      if (prevConnected.current) {
        toast('Wallet disconnected', { icon: '\uD83D\uDC4B' })
      }
      clearStore()
    }
    prevConnected.current = connected
  }, [connected, publicKey, wallet, setWallet, clearStore, refreshBalance])

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <header className="sticky top-0 z-50 glass border-b border-surface-700/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <ObscuraLogo size={32} className="group-hover:opacity-90 transition-opacity duration-300" />
            <span className="text-lg font-bold text-white tracking-tight">
              Obscura
            </span>
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent-500/10 text-accent-400 border border-accent-500/20">
              Testnet
            </span>
          </Link>

          {/* Nav Links - Desktop */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {primaryNav.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={`relative flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'text-accent-400 bg-accent-500/10'
                      : 'text-gray-400 hover:text-white hover:bg-surface-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-gradient-to-r from-accent-500 to-accent-400 rounded-full" />
                  )}
                </Link>
              )
            })}
            {/* More dropdown */}
            <MoreDropdown location={location} />
          </nav>

          {/* Wallet Button + Mobile Menu Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className={`shrink-0 max-w-[160px] sm:max-w-none overflow-hidden ${!connected ? 'animate-wallet-pulse rounded-xl' : ''} [&>button]:!px-2 [&>button]:!text-xs sm:[&>button]:!px-4 sm:[&>button]:!text-sm`}>
              <WalletMultiButton />
            </div>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-surface-800/60 transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav — animated slide-in */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="lg:hidden overflow-hidden border-t border-surface-700/30 mt-2"
            >
              <div className="pb-4 pt-3 space-y-1">
                {allNavLinks.map(({ to, label, icon: Icon }, i) => (
                  <motion.div
                    key={to}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                  >
                    <Link
                      to={to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                        location.pathname === to
                          ? 'text-accent-400 bg-accent-500/10'
                          : 'text-gray-400 hover:text-white hover:bg-surface-800/60'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}

function MoreDropdown({ location }: { location: { pathname: string } }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isMoreActive = moreNav.some(n => n.to === location.pathname)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
          isMoreActive
            ? 'text-accent-400 bg-accent-500/10'
            : 'text-gray-400 hover:text-white hover:bg-surface-800/60'
        }`}
      >
        <MoreHorizontal className="w-4 h-4" />
        More
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-full right-0 mt-1 w-44 bg-surface-900 border border-surface-700/50 rounded-xl shadow-xl overflow-hidden z-50"
          >
            {moreNav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-all ${
                  location.pathname === to
                    ? 'text-accent-400 bg-accent-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-surface-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
