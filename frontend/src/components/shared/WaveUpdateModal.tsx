import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Lock, Gavel, BarChart3, Layers, X, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const STORAGE_KEY = 'obscura_wave4_seen'

const features = [
  { icon: Gavel, label: '4 Auction Formats', desc: 'Sealed-Bid, Vickrey, Dutch, English — each with privacy controls', color: 'text-cyan-400' },
  { icon: Lock, label: 'Triple Token Escrow', desc: 'ALEO Credits + USDCx + USAD with private record transfers', color: 'text-green-400' },
  { icon: Shield, label: 'Dispute Resolution', desc: 'Bond-based challenges with 10% stake and admin resolution', color: 'text-accent-400' },
  { icon: BarChart3, label: 'Auction Intelligence', desc: 'Real-time price tracking, anti-sniping alerts, settlement proofs', color: 'text-blue-400' },
  { icon: Layers, label: 'Use Case Templates', desc: 'NFTs, token sales, procurement — one-click auction creation', color: 'text-purple-400' },
]

export default function WaveUpdateModal() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = setTimeout(() => setShow(true), 2000)
        return () => clearTimeout(t)
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
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/20 shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #0F172A 0%, #0B1120 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Glow effects */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />

            {/* Close */}
            <button onClick={dismiss} className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors z-10">
              <X className="w-4 h-4" />
            </button>

            <div className="relative p-6">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto mb-3">
                  <Shield className="w-6 h-6 text-cyan-400" />
                </div>
                <p className="text-[10px] text-cyan-400/60 uppercase tracking-[0.3em] font-mono mb-1">Obscura</p>
                <h2 className="text-xl font-bold text-white">Wave 4 is Live</h2>
              </div>

              {/* Feature list */}
              <div className="space-y-3 mb-6">
                {features.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i + 0.2 }}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                  >
                    <f.icon className={`w-4 h-4 shrink-0 ${f.color}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium">{f.label}</p>
                      <p className="text-[10px] text-gray-500 truncate">{f.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* CTA */}
              <Link
                to="/browse"
                onClick={dismiss}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'linear-gradient(135deg, #06B6D4, #0891B2)', color: 'white' }}
              >
                Explore Wave 4
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
