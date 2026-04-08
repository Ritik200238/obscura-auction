import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { WalletMultiButton } from '@provablehq/aleo-wallet-adaptor-react-ui'
import {
  Search, Plus, Activity, BookOpen, Menu, X, BarChart3,
  Lightbulb, Radar, ChevronDown, MoreHorizontal,
  ShoppingBag, Landmark, FileText
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
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/my-activity', label: 'Activity', icon: Activity },
  { to: '/docs', label: 'Docs', icon: BookOpen },
  { to: '/explorer', label: 'Explorer', icon: Radar },
]

const moreNav = [
  { to: '/fixed-sales', label: 'Buy Now', icon: ShoppingBag },
  { to: '/token-sale', label: 'Token Sales', icon: Landmark },
  { to: '/rfq', label: 'Procurement', icon: FileText },
  { to: '/learn', label: 'Learn', icon: Lightbulb },
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

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <header className="sticky top-0 z-50 bg-surface-950/80 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <ObscuraLogo size={28} className="group-hover:opacity-90 transition-opacity duration-200" />
            <span className="text-base font-bold text-white tracking-tight">
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
                  className={`relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors duration-200 ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent-400 rounded-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </Link>
              )
            })}
            {/* More dropdown */}
            <MoreDropdown location={location} />
          </nav>

          {/* Wallet Button + Mobile Menu Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className={`shrink-0 max-w-[160px] sm:max-w-none overflow-hidden rounded-xl ${
              connected
                ? 'ring-1 ring-accent-500/30'
                : 'animate-wallet-pulse'
            } [&>button]:!px-2 [&>button]:!text-xs sm:[&>button]:!px-4 sm:[&>button]:!text-sm [&>button]:!rounded-xl [&>button]:!h-9`}>
              <WalletMultiButton />
            </div>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/[0.06] transition-colors duration-200"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav — slide-in drawer from right */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            {/* Drawer */}
            <motion.nav
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="fixed top-0 right-0 bottom-0 w-72 bg-surface-950 border-l border-white/[0.06] z-50 lg:hidden overflow-y-auto"
            >
              <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-white">Navigation</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors duration-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="py-3 px-3 space-y-0.5">
                {allNavLinks.map(({ to, label, icon: Icon }, i) => (
                  <motion.div
                    key={to}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Link
                      to={to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                        location.pathname === to
                          ? 'text-white bg-accent-500/10 border border-accent-500/20'
                          : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                      {location.pathname === to && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-400" />
                      )}
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
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
        className={`flex items-center gap-1 px-3 py-2 text-[13px] font-medium transition-colors duration-200 ${
          isMoreActive
            ? 'text-white'
            : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        More
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-full right-0 mt-2 w-44 bg-surface-900 border border-white/[0.06] rounded-xl shadow-xl overflow-hidden z-50"
          >
            {moreNav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  location.pathname === to
                    ? 'text-white bg-accent-500/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
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
