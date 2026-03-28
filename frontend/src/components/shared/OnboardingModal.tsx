import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Coins, Gavel, ArrowRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'

const STORAGE_KEY = 'obscura_onboarded'

const steps = [
  {
    icon: Wallet,
    title: 'Connect Your Wallet',
    description: 'Use Shield Wallet (recommended) for the best experience. Click the wallet button in the top-right corner.',
    color: 'text-accent-400 bg-accent-500/20',
  },
  {
    icon: Coins,
    title: 'Get Test Tokens',
    description: 'Visit the Aleo Faucet to get free testnet ALEO. You\'ll need tokens to create auctions or place bids.',
    color: 'text-green-400 bg-green-500/20',
  },
  {
    icon: Gavel,
    title: 'Create or Browse',
    description: 'Create your own auction, browse listings, or buy instantly. 7 market types including fixed-price sales and procurement.',
    color: 'text-cyan-400 bg-cyan-500/20',
  },
]

export default function OnboardingModal() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const timer = setTimeout(() => setShow(true), 1500)
        return () => clearTimeout(timer)
      }
    } catch { /* localStorage unavailable */ }
  }, [])

  const dismiss = () => {
    setShow(false)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* noop */ }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.3 }}
            className="relative w-full max-w-md bg-surface-900 border border-surface-700 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-white mb-1">Welcome to Obscura</h2>
            <p className="text-sm text-gray-400 mb-6">Private auctions on Aleo. Here's how to get started:</p>

            <div className="space-y-4 mb-6">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${step.color}`}>
                    <step.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{`${i + 1}. ${step.title}`}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/browse"
                onClick={dismiss}
                className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm py-2.5"
              >
                Browse Auctions <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={dismiss}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors whitespace-nowrap"
              >
                Skip
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
