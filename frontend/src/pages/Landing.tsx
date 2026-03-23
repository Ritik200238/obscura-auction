import { Link } from 'react-router-dom'
import { motion, useInView, animate } from 'framer-motion'
import { useRef, useEffect, useState, useMemo } from 'react'
import { fadeInUp, staggerContainer, scaleIn } from '@/lib/animations'
import { config } from '@/lib/config'
import {
  Shield,
  ArrowRight,
  Eye,
  Gavel,
  Layers,
  Globe,
  Zap,
  ShieldCheck,
  ExternalLink,
  Lock,
  Check,
  Coins,
  FileCheck,
} from 'lucide-react'

/* ─────────────────────────────────────────────
   HERO WORD ANIMATION
   ───────────────────────────────────────────── */

const heroWords = ['SEALED.', 'REVEALED.', 'SETTLED.']

const wordVariants = {
  hidden: { opacity: 0, filter: 'blur(12px)', y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    filter: 'blur(0px)',
    y: 0,
    transition: {
      delay: i * 0.5,
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
}

/* ─────────────────────────────────────────────
   CARD VISUALS — Animated SVG/icon scenes
   ───────────────────────────────────────────── */

/** Card 1: Envelope sealing — bid data lines get encrypted one by one, lock appears */
function SealVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.05 })

  const lines = [
    { label: 'bid_amount', value: '500000u128' },
    { label: 'bid_nonce', value: '7a3f91c2...' },
    { label: 'bidder', value: 'aleo1h7y...' },
  ]

  return (
    <div ref={ref} className="relative py-5 px-4 rounded-xl bg-surface-950/60 border border-surface-700/30 overflow-hidden">
      {/* Data lines that get encrypted */}
      <div className="space-y-2 font-mono text-xs">
        {lines.map((line, i) => (
          <div key={line.label} className="flex items-center gap-2">
            <span className="text-gray-600 w-20 shrink-0">{line.label}:</span>
            <div className="relative flex-1 overflow-hidden">
              {/* Visible value */}
              <motion.span
                initial={{ opacity: 1 }}
                animate={isInView ? { opacity: 0 } : {}}
                transition={{ delay: 0.8 + i * 0.3, duration: 0.3 }}
                className="text-gray-400"
              >
                {line.value}
              </motion.span>
              {/* Encrypted overlay */}
              <motion.span
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ delay: 1.0 + i * 0.3, duration: 0.3 }}
                className="absolute inset-0 text-emerald-500/70"
              >
                {'█'.repeat(12)}
              </motion.span>
            </div>
            {/* Lock icon appears */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 1.2 + i * 0.3, type: 'spring', stiffness: 300, damping: 20 }}
            >
              <Lock className="w-3 h-3 text-emerald-500/60" />
            </motion.div>
          </div>
        ))}
      </div>

      {/* Shield overlay fades in */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 2.2, duration: 0.5 }}
        className="absolute top-2 right-2"
      >
        <Shield className="w-5 h-5 text-emerald-400/30" />
      </motion.div>
    </div>
  )
}

/** Card 2: Envelope opening — encrypted data reveals and gets verified */
function RevealVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.05 })

  const lines = [
    { label: 'amount', encrypted: '████████████', revealed: '500000u128', delay: 0.6 },
    { label: 'commit', encrypted: '████████████', revealed: 'bhp256 ✓ match', delay: 1.0 },
    { label: 'proof', encrypted: '████████████', revealed: 'zk_valid: true', delay: 1.4 },
  ]

  return (
    <div ref={ref} className="relative py-5 px-4 rounded-xl bg-surface-950/60 border border-surface-700/30 overflow-hidden">
      <div className="space-y-2 font-mono text-xs">
        {lines.map((line) => (
          <div key={line.label} className="flex items-center gap-2">
            <span className="text-gray-600 w-14 shrink-0">{line.label}:</span>
            <div className="relative flex-1 overflow-hidden">
              {/* Encrypted */}
              <motion.span
                initial={{ opacity: 1 }}
                animate={isInView ? { opacity: 0 } : {}}
                transition={{ delay: line.delay, duration: 0.3 }}
                className="text-cyan-500/40"
              >
                {line.encrypted}
              </motion.span>
              {/* Revealed */}
              <motion.span
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ delay: line.delay + 0.2, duration: 0.4 }}
                className="absolute inset-0 text-cyan-400"
              >
                {line.revealed}
              </motion.span>
            </div>
            {/* Check icon */}
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: line.delay + 0.4, type: 'spring', stiffness: 300, damping: 20 }}
            >
              <Check className="w-3 h-3 text-cyan-400" />
            </motion.div>
          </div>
        ))}
      </div>

      {/* Eye overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 2.2, duration: 0.5 }}
        className="absolute top-2 right-2"
      >
        <Eye className="w-5 h-5 text-cyan-400/30" />
      </motion.div>
    </div>
  )
}

/** Card 3: Token flow — winner pays 2nd price, coins animate between parties */
function SettleVisual() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.05 })

  return (
    <div ref={ref} className="relative py-5 px-4 rounded-xl bg-surface-950/60 border border-surface-700/30 overflow-hidden">
      {/* Two bidders at top */}
      <div className="flex items-center justify-between mb-3">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex items-center gap-1.5"
        >
          <div className="w-6 h-6 rounded-full bg-accent-500/20 flex items-center justify-center">
            <span className="text-[9px] font-bold text-accent-400">B1</span>
          </div>
          <span className="text-[10px] font-mono text-gray-500">500k</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.8, duration: 0.4 }}
          className="text-[10px] text-gray-600 font-mono"
        >
          vs
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex items-center gap-1.5"
        >
          <span className="text-[10px] font-mono text-gray-500">300k</span>
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center">
            <span className="text-[9px] font-bold text-cyan-400">B2</span>
          </div>
        </motion.div>
      </div>

      {/* Arrow down + settlement */}
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={isInView ? { opacity: 1, scaleY: 1 } : {}}
        transition={{ delay: 1.0, duration: 0.4 }}
        className="flex justify-center mb-2"
        style={{ transformOrigin: 'top' }}
      >
        <div className="w-px h-5 bg-gradient-to-b from-accent-500/40 to-accent-500/60" />
      </motion.div>

      {/* Winner result */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ delay: 1.4, duration: 0.5 }}
        className="flex items-center justify-center gap-2 py-2 rounded-lg bg-accent-500/10 border border-accent-500/20"
      >
        <Coins className="w-3.5 h-3.5 text-accent-400" />
        <span className="text-xs font-mono text-accent-300">
          B1 wins → pays <span className="text-white font-semibold">300k</span>
        </span>
      </motion.div>

      {/* Label */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 1.8, duration: 0.4 }}
        className="text-center text-[10px] text-gray-600 mt-2"
      >
        2nd-price settlement
      </motion.p>

      {/* Gavel overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 2.0, duration: 0.5 }}
        className="absolute top-2 right-2"
      >
        <Gavel className="w-5 h-5 text-accent-400/30" />
      </motion.div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   STATS
   ───────────────────────────────────────────── */

const stats = [
  { label: 'Transitions', value: 28, detail: 'On-chain functions' },
  { label: 'Records', value: 5, detail: 'Private UTXO records' },
  { label: 'Mappings', value: 16, detail: 'On-chain state' },
  { label: 'Auction Formats', value: 4, detail: 'Sealed · Vickrey · Dutch · English' },
  { label: 'Token Types', value: 3, detail: 'ALEO + USDCx + USAD' },
]

/* ─────────────────────────────────────────────
   TECH CREDENTIALS
   ───────────────────────────────────────────── */

const techItems = [
  {
    icon: Globe,
    title: 'Built on Aleo',
    description: 'Zero-knowledge blockchain with programmable privacy',
  },
  {
    icon: Layers,
    title: 'Powered by Leo',
    description: 'Typed ZK language with record-based data model',
  },
  {
    icon: ShieldCheck,
    title: 'Shield Wallet Integration',
    description: 'Delegated proving for seamless UX',
  },
  {
    icon: Zap,
    title: 'Vickrey (1961, Nobel Prize)',
    description: 'Game-theoretically optimal auction mechanism',
  },
]

/* ─────────────────────────────────────────────
   PRIVACY WALL HASHES
   ───────────────────────────────────────────── */

const hashStrings = [
  '4829103846738291047382910473829104738291field',
  'commit.bhp256(bid_amount, nonce_scalar)',
  '6882928631484950133624464808745388159395field',
  'aleo1h7yz0n5qx9uwyaxsprspkm5j6leey9eyzmjvfield',
  '3847291047382910a73f829104e738291047382field',
  'bhp256_hash(seller_address || salt)',
  '9173829104738291047382f91047d382910473field',
  'record { owner: aleo1..., amount: private }',
  '1048573829104738291047382910473829104738field',
  'at1f3sxnlttr6spyvzgjhg7j9n40r088xuck04a9z',
]

/* ─────────────────────────────────────────────
   PRIVACY SPLIT — "Two Realities, One Auction"
   ───────────────────────────────────────────── */

const privacyStages = [
  {
    num: '01',
    label: 'CREATE',
    subtitle: 'Auction goes live',
    right: [
      { k: 'Item', v: 'Rare NFT Collection', icon: '🖼️' },
      { k: 'Reserve', v: '5.0 ALEO', icon: '🔒' },
      { k: 'Format', v: 'Vickrey (2nd-price)', icon: '⚡' },
      { k: 'Duration', v: '24 hours', icon: '⏱️' },
    ],
    left: [
      { k: 'auction_id', v: '38742918...field', redacted: false },
      { k: 'reserve', v: '██████████████', redacted: true },
      { k: 'seller', v: '██████████████', redacted: true },
      { k: 'mode', v: '2u8', redacted: false },
    ],
    accent: '#4ade80',
    accentName: 'green',
  },
  {
    num: '02',
    label: 'BID',
    subtitle: 'Your sealed bid',
    right: [
      { k: 'Your bid', v: '12.5 ALEO', icon: '💰' },
      { k: 'Status', v: 'Sealed on-chain', icon: '🔐' },
      { k: 'Tokens moved', v: 'Zero', icon: '✨' },
    ],
    left: [
      { k: 'commitment', v: '8f3a91c2...d4e7', redacted: false },
      { k: 'amount', v: '██████████████', redacted: true },
      { k: 'bidder', v: '██████████████', redacted: true },
    ],
    accent: '#22d3ee',
    accentName: 'cyan',
  },
  {
    num: '03',
    label: 'COMPETE',
    subtitle: '3 hidden bids',
    right: [
      { k: 'Sealed bids', v: '3 placed', icon: '📊' },
      { k: 'Amounts', v: 'All hidden', icon: '👁️‍🗨️' },
      { k: 'Leader', v: 'Nobody knows', icon: '❓' },
    ],
    left: [
      { k: 'bid_count', v: '3', redacted: false },
      { k: 'bids', v: '[hash₁, hash₂, hash₃]', redacted: false },
      { k: 'identities', v: '██ none stored ██', redacted: true },
    ],
    accent: '#a78bfa',
    accentName: 'purple',
  },
  {
    num: '04',
    label: 'SETTLE',
    subtitle: 'You won!',
    right: [
      { k: 'Result', v: '🏆 You won!', icon: '✅' },
      { k: 'You pay', v: '8.2 ALEO (2nd price)', icon: '💎' },
      { k: 'Status', v: 'Settled on-chain', icon: '🔗' },
    ],
    left: [
      { k: 'winner', v: 'bhp256(aleo1...)', redacted: false },
      { k: 'price', v: '8200000u128', redacted: false },
      { k: 'identity', v: '██████████████', redacted: true },
    ],
    accent: '#3b82f6',
    accentName: 'blue',
  },
  {
    num: '05',
    label: 'PROVE',
    subtitle: 'Zero-knowledge proof',
    right: [
      { k: 'Claim', v: '"I won this auction"', icon: '🏆' },
      { k: 'Bid amount', v: 'Still private', icon: '🔒' },
      { k: 'Proof', v: 'Verifiable by anyone', icon: '✨' },
    ],
    left: [
      { k: 'is_winner', v: 'true', redacted: false },
      { k: 'proof', v: 'VALID ✓', redacted: false },
      { k: 'amount', v: '██████████████', redacted: true },
    ],
    accent: '#8b5cf6',
    accentName: 'violet',
  },
]

function PrivacySplit() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.05 })
  const [stage, setStage] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    if (!isInView) return
    const interval = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setStage((s) => (s + 1) % privacyStages.length)
        setIsTransitioning(false)
      }, 400)
    }, 5000)
    return () => clearInterval(interval)
  }, [isInView])

  const current = privacyStages[stage]

  return (
    <div ref={ref} className="relative max-w-6xl mx-auto">
      {/* Stage indicator — large cinematic number */}
      <div className="flex items-center justify-center gap-6 mb-10">
        <motion.div
          key={`num-${stage}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
          className="flex items-center gap-4"
        >
          <span
            className="text-6xl sm:text-7xl font-black tracking-tighter font-display opacity-20"
            style={{ color: current.accent }}
          >
            {current.num}
          </span>
          <div>
            <p className="text-xl sm:text-2xl font-extrabold text-white tracking-tight font-display">
              {current.label}
            </p>
            <p className="text-sm text-gray-500">{current.subtitle}</p>
          </div>
        </motion.div>
      </div>

      {/* Main split view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 relative">

        {/* Glowing divider */}
        <div className="hidden lg:flex absolute left-1/2 top-0 bottom-0 w-px z-20 flex-col items-center justify-center">
          <motion.div
            className="w-px h-full relative"
            style={{ background: `linear-gradient(to bottom, transparent 10%, ${current.accent}40 50%, transparent 90%)` }}
          >
            {/* Traveling particle */}
            <motion.div
              key={`particle-${stage}`}
              initial={{ top: '20%', opacity: 0 }}
              animate={{ top: '80%', opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2, ease: 'easeInOut', delay: 0.5 }}
              className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full blur-sm"
              style={{ background: current.accent }}
            />
          </motion.div>
          {/* Center glow orb */}
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 w-20 h-20 rounded-full blur-2xl"
            animate={{ background: current.accent, opacity: 0.15 }}
            transition={{ duration: 0.8 }}
          />
          {/* Arrow icon */}
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center z-30 border"
            style={{ background: `${current.accent}15`, borderColor: `${current.accent}40` }}
          >
            <span className="text-xs" style={{ color: current.accent }}>→</span>
          </motion.div>
        </div>

        {/* RIGHT — Your reality */}
        <motion.div
          className="relative p-7 sm:p-10 rounded-2xl lg:rounded-l-none border order-1 lg:order-2"
          style={{ background: 'rgba(15, 23, 42, 0.6)', borderColor: `${current.accent}15` }}
          animate={{ borderColor: isTransitioning ? 'rgba(255,255,255,0.05)' : `${current.accent}20` }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <p className="text-[11px] uppercase tracking-[0.2em] text-green-400/80 font-semibold">Your View</p>
            </div>
            <span className="text-[10px] text-gray-600 font-mono">private</span>
          </div>
          <motion.div
            key={`right-${stage}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="space-y-4"
          >
            {current.right.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 * i + 0.2, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]"
              >
                <span className="text-lg shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider">{item.k}</p>
                  <p className="text-[15px] text-white font-semibold truncate">{item.v}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* LEFT — Network reality */}
        <motion.div
          className="relative p-7 sm:p-10 rounded-2xl lg:rounded-r-none border order-2 lg:order-1"
          style={{ background: 'rgba(0, 0, 0, 0.5)', borderColor: 'rgba(255,255,255,0.04)' }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400/60" />
              <p className="text-[11px] uppercase tracking-[0.2em] text-red-400/60 font-semibold">Network View</p>
            </div>
            <span className="text-[10px] text-gray-700 font-mono">on-chain</span>
          </div>
          <motion.div
            key={`left-${stage}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="space-y-4"
          >
            {current.left.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 * i + 0.5, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.015] border border-white/[0.03]"
              >
                <span className="text-[10px] text-gray-600 font-mono w-20 shrink-0 text-right">{item.k}</span>
                <div className="flex-1 min-w-0">
                  {item.redacted ? (
                    <div className="flex items-center gap-1.5">
                      <motion.div
                        className="h-4 rounded flex-1"
                        style={{ background: `linear-gradient(90deg, ${current.accent}10, ${current.accent}05)` }}
                        animate={{ opacity: [0.4, 0.7, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-mono tracking-wider"
                        style={{ color: `${current.accent}90`, background: `${current.accent}10` }}
                      >
                        ENCRYPTED
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 font-mono truncate">{item.v}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Stage navigation */}
      <div className="flex items-center justify-center gap-3 mt-8">
        {privacyStages.map((s, i) => (
          <button
            key={i}
            onClick={() => { setIsTransitioning(true); setTimeout(() => { setStage(i); setIsTransitioning(false) }, 200) }}
            className="group flex items-center gap-2 transition-all duration-300"
          >
            <span
              className={`block h-1 rounded-full transition-all duration-500 ${
                i === stage ? 'w-10' : 'w-3 group-hover:w-5'
              }`}
              style={{ background: i === stage ? current.accent : 'rgba(255,255,255,0.1)' }}
            />
            {i === stage && (
              <motion.span
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[10px] font-mono"
                style={{ color: current.accent }}
              >
                {s.label}
              </motion.span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   LIVE ACTIVITY BAR — fetches from backend
   ───────────────────────────────────────────── */

function LiveActivityBar() {
  const [data, setData] = useState<{ auctions: number; bids: number; settled: number } | null>(null)

  useEffect(() => {
    fetch(`${config.backendApi}/api/stats/overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData({ auctions: d.total_auctions, bids: d.total_bids, settled: d.settled_auctions }))
      .catch(() => {})
  }, [])

  if (!data || (data.auctions === 0 && data.bids === 0)) return null

  return (
    <section className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 py-4 px-6 rounded-2xl bg-surface-900/60 border border-surface-700/30">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-gray-400">Live on Aleo Testnet</span>
        </div>
        <div className="flex items-center gap-6 sm:gap-8">
          <div className="text-center">
            <p className="text-lg font-bold text-white font-mono">{data.auctions}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Auctions</p>
          </div>
          <div className="w-px h-8 bg-surface-700" />
          <div className="text-center">
            <p className="text-lg font-bold text-white font-mono">{data.bids}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Bids</p>
          </div>
          <div className="w-px h-8 bg-surface-700" />
          <div className="text-center">
            <p className="text-lg font-bold text-white font-mono">{data.settled}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Settled</p>
          </div>
        </div>
        <Link to="/explorer" className="text-xs text-accent-400 hover:text-accent-300">
          View Analytics →
        </Link>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
   ANIMATED COUNTER
   ───────────────────────────────────────────── */

function AnimatedCounter({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.05 })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!isInView) return
    const controls = animate(0, target, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [isInView, target])

  return <span ref={ref}>{display}</span>
}

/* ─────────────────────────────────────────────
   ANIMATED SECTION (scroll-triggered)
   ───────────────────────────────────────────── */

function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.05 })
  // Safety: force visible after 3 seconds regardless of scroll
  const [forceVisible, setForceVisible] = useState(false)
  useEffect(() => { const t = setTimeout(() => setForceVisible(true), 3000); return () => clearTimeout(t) }, [])
  const show = isInView || forceVisible
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={show ? 'visible' : 'hidden'}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ─────────────────────────────────────────────
   LANDING PAGE
   ───────────────────────────────────────────── */

export default function Landing() {
  const tickerText = useMemo(() => {
    const base = hashStrings.join('  //  ')
    return `${base}  //  ${base}`
  }, [])

  return (
    <div className="relative overflow-hidden">

      {/* ═══════════════════════════════════════
          HERO SECTION — Full viewport
          ═══════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-surface-950 to-transparent" />

        <div className="relative z-10 text-center max-w-5xl mx-auto">
          {/* Staggered blur-to-sharp words */}
          <div className="flex flex-col items-center justify-center gap-1 sm:gap-2 mb-8">
            {heroWords.map((word, i) => (
              <motion.span
                key={word}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={wordVariants}
                className="text-5xl sm:text-8xl lg:text-9xl font-extrabold tracking-tighter text-white leading-none font-display"
                style={{
                  textShadow: i === 0
                    ? '0 0 80px rgba(74, 222, 128, 0.35), 0 0 30px rgba(74, 222, 128, 0.15)'
                    : i === 1
                    ? '0 0 80px rgba(34, 211, 238, 0.35), 0 0 30px rgba(34, 211, 238, 0.15)'
                    : '0 0 80px rgba(59, 130, 246, 0.35), 0 0 30px rgba(59, 130, 246, 0.15)',
                }}
              >
                {word}
              </motion.span>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed font-medium"
          >
            Private auctions on Aleo. Four formats. Three tokens. Zero data leaks.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.2, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10"
          >
            <Link to="/create" className="btn-primary flex items-center gap-2 text-lg px-10 py-4 font-semibold">
              Start Your First Auction
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="/browse" className="btn-secondary flex items-center gap-2 text-base px-8 py-3.5">
              Browse Auctions
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          {/* 3-step quick guide */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.5, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 mt-8 text-xs text-gray-500"
          >
            <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 flex items-center justify-center text-[10px] font-bold">1</span> Connect Wallet</span>
            <span className="hidden sm:block text-surface-600">→</span>
            <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 flex items-center justify-center text-[10px] font-bold">2</span> Get Test Tokens</span>
            <span className="hidden sm:block text-surface-600">→</span>
            <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 flex items-center justify-center text-[10px] font-bold">3</span> Create or Browse</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.6, duration: 0.5 }}
            className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl bg-surface-900/90 border border-surface-700/60 text-sm glow-sm"
          >
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 font-medium font-mono text-xs">obscura_v4.aleo</span>
            </span>
            <span className="text-surface-600">|</span>
            <a
              href="https://testnet.explorer.provable.com/program/obscura_v4.aleo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-400 hover:text-accent-300 transition-colors flex items-center gap-1 text-xs"
            >
              Live on Testnet
              <ExternalLink className="w-3 h-3" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          HOW IT WORKS — 3 Glassmorphism Cards
          ═══════════════════════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <AnimatedSection>
          <motion.div variants={fadeInUp} className="text-center mb-16">
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-4 font-display">How It Works</h2>
            <p className="text-gray-400 max-w-lg mx-auto text-lg font-medium">Three phases. Zero trust required.</p>
          </motion.div>
        </AnimatedSection>

        <AnimatedSection className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Sealed Bids */}
          <motion.div
            variants={scaleIn}
            whileHover={{ y: -6, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
            className="relative group"
          >
            <div
              className="h-full rounded-2xl p-6 sm:p-8 bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/[0.15] transition-all duration-500"
              style={{ boxShadow: '0 0 40px rgba(52, 211, 153, 0.1)' }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-sm font-bold text-gray-400 font-mono">1</div>
                <Shield className="w-6 h-6 text-emerald-400" />
              </div>
              <SealVisual />
              <h3 className="text-lg font-bold text-white mb-3 mt-5 tracking-tight">SEALED BIDS</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Every bid is encrypted. No one sees amounts until the reveal phase.
              </p>
            </div>
          </motion.div>

          {/* Card 2: Zero-Knowledge Reveal */}
          <motion.div
            variants={scaleIn}
            whileHover={{ y: -6, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
            className="relative group"
          >
            <div
              className="h-full rounded-2xl p-6 sm:p-8 bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/[0.15] transition-all duration-500"
              style={{ boxShadow: '0 0 40px rgba(6, 182, 212, 0.1)' }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-sm font-bold text-gray-400 font-mono">2</div>
                <Eye className="w-6 h-6 text-cyan-400" />
              </div>
              <RevealVisual />
              <h3 className="text-lg font-bold text-white mb-3 mt-5 tracking-tight">ZERO-KNOWLEDGE REVEAL</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Commitments verified cryptographically. Your bid proves itself without exposing others.
              </p>
            </div>
          </motion.div>

          {/* Card 3: Vickrey Settlement */}
          <motion.div
            variants={scaleIn}
            whileHover={{ y: -6, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
            className="relative group"
          >
            <div
              className="h-full rounded-2xl p-6 sm:p-8 bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/[0.15] transition-all duration-500"
              style={{ boxShadow: '0 0 40px rgba(8, 145, 178, 0.1)' }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-sm font-bold text-gray-400 font-mono">3</div>
                <Gavel className="w-6 h-6 text-accent-400" />
              </div>
              <SettleVisual />
              <h3 className="text-lg font-bold text-white mb-3 mt-5 tracking-tight">VICKREY SETTLEMENT</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Winner pays second-highest price. Fair pricing guaranteed by protocol economics.
              </p>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          PRIVACY SPLIT — Two Realities, One Auction
          ═══════════════════════════════════════ */}
      <section className="relative py-24 sm:py-32 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-accent-600/[0.06] rounded-full blur-[120px]" />
        </div>

        {/* Scrolling hash ticker top */}
        <div className="relative mb-12 overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-surface-950 to-transparent z-10" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-surface-950 to-transparent z-10" />
          <div className="hash-ticker whitespace-nowrap py-4">
            <span className="font-mono text-sm text-surface-700 tracking-wider">{tickerText}</span>
          </div>
        </div>

        <AnimatedSection className="relative z-10 px-4 sm:px-6 lg:px-8">
          <motion.div variants={fadeInUp} className="text-center mb-12">
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white mb-4 leading-tight font-display">
              Two Realities. One Auction.
            </h2>
            <p className="text-lg text-gray-400 max-w-xl mx-auto">
              Watch a full auction lifecycle. Left: what the blockchain stores. Right: what you actually see.
            </p>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <PrivacySplit />
          </motion.div>
        </AnimatedSection>

        {/* Scrolling hash ticker bottom — reversed */}
        <div className="relative mt-12 overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-surface-950 to-transparent z-10" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-surface-950 to-transparent z-10" />
          <div className="hash-ticker whitespace-nowrap py-4" style={{ animationDirection: 'reverse' }}>
            <span className="font-mono text-sm text-surface-700 tracking-wider">{tickerText}</span>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════
          STATS — Animated Counters
          ═══════════════════════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <AnimatedSection className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
          {stats.map((stat) => (
            <motion.div
              key={stat.label}
              variants={fadeInUp}
              className="text-center p-6 rounded-2xl bg-surface-900/60 border border-surface-700/40 hover:border-accent-500/30 transition-all duration-300"
            >
              <p className="text-3xl sm:text-5xl font-extrabold text-white font-mono mb-2">
                <AnimatedCounter target={stat.value} />
              </p>
              <p className="text-xs text-gray-300 font-medium uppercase tracking-wide">{stat.label}</p>
              <p className="text-[11px] text-gray-600 mt-1">{stat.detail}</p>
            </motion.div>
          ))}
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          LIVE PLATFORM ACTIVITY
          ═══════════════════════════════════════ */}
      <LiveActivityBar />

      {/* ═══════════════════════════════════════
          USE CASES — Who needs private auctions?
          ═══════════════════════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-32">
        <AnimatedSection>
          <motion.div variants={fadeInUp} className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3 font-display">Built for Real People</h2>
            <p className="text-gray-400 max-w-lg mx-auto">Every auction format solves a real problem. Pick the one that fits your use case.</p>
          </motion.div>
        </AnimatedSection>

        <AnimatedSection className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              emoji: '🖼️',
              title: 'NFT Creator',
              persona: 'You created a 1/1 artwork and want the fairest price without scaring off bidders.',
              description: 'Vickrey auctions: highest bidder wins but pays the second-highest price. Bidders bid their true value because overbidding never hurts them.',
              mode: 'Vickrey (2nd-Price)',
              link: '/create?template=nft',
              color: 'from-cyan-500/10 to-transparent border-cyan-500/20',
            },
            {
              emoji: '🏛️',
              title: 'DAO Treasury',
              persona: 'Your DAO needs to sell tokens without whales front-running the price.',
              description: 'Dutch auctions: the price starts high and drops every block. First buyer wins at the current price. No sniping, no collusion.',
              mode: 'Dutch (Descending)',
              link: '/create?template=token_sale',
              color: 'from-orange-500/10 to-transparent border-orange-500/20',
            },
            {
              emoji: '🔧',
              title: 'Service Provider',
              persona: 'You want to hire a contractor but need competitive bids without bid rigging.',
              description: 'First-price sealed bids: every supplier submits once, privately. Lowest bid wins. Nobody sees competitors\' offers.',
              mode: 'Sealed Bid (1st-Price)',
              link: '/create?template=procurement',
              color: 'from-green-500/10 to-transparent border-green-500/20',
            },
            {
              emoji: '⚡',
              title: 'Rare Collectible',
              persona: 'You have a rare item and want maximum price discovery with open competition.',
              description: 'English auctions: open ascending bids with anti-snipe protection. Last-minute bids automatically extend the deadline.',
              mode: 'English (Ascending)',
              link: '/create',
              color: 'from-purple-500/10 to-transparent border-purple-500/20',
            },
          ].map((uc) => (
            <motion.div key={uc.title} variants={fadeInUp}>
              <Link
                to={uc.link}
                className={`block h-full rounded-2xl p-5 bg-gradient-to-b ${uc.color} border hover:border-white/20 transition-all duration-300 group`}
              >
                <span className="text-2xl mb-3 block">{uc.emoji}</span>
                <h3 className="text-base font-bold text-white mb-1">{uc.title}</h3>
                <p className="text-xs text-accent-400/80 italic mb-2">&ldquo;{uc.persona}&rdquo;</p>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">{uc.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 font-mono">{uc.mode}</span>
                  <span className="text-xs text-accent-400 group-hover:text-accent-300 flex items-center gap-1">
                    Try it <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          PROVE YOU WON — Selective Disclosure Feature
          ═══════════════════════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-32">
        <AnimatedSection>
          <motion.div variants={fadeInUp} className="relative rounded-2xl overflow-hidden border border-accent-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-500/5 via-transparent to-brand-cyan/5" />
            <div className="relative p-8 sm:p-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-400 text-xs font-medium mb-4">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Only on Obscura
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 font-display">
                    Prove You Won. Reveal Nothing Else.
                  </h2>
                  <p className="text-gray-400 leading-relaxed mb-6">
                    Won an auction? Generate a zero-knowledge proof that verifies your win to anyone — a lender,
                    a marketplace, an insurance provider — without revealing what you paid, who else bid, or any
                    other auction details. Selective disclosure, powered by Aleo.
                  </p>
                  <div className="space-y-3">
                    {[
                      { label: 'Prove ownership to marketplaces', detail: 'without exposing your purchase price' },
                      { label: 'Verify to lenders for collateralized loans', detail: 'without revealing auction history' },
                      { label: 'Share proof with insurers', detail: 'without leaking bidder identities' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-gray-300">
                          {item.label} <span className="text-gray-500">{item.detail}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-surface-950/80 rounded-xl p-5 border border-surface-700/50 font-mono text-xs space-y-3">
                  <div className="flex items-center gap-2 text-gray-500 mb-4">
                    <Shield className="w-4 h-4 text-accent-400" />
                    <span className="text-accent-400 font-semibold">prove_won_auction</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3 h-3 text-red-400" />
                      <span className="text-gray-500">auction_id:</span>
                      <span className="text-red-400">hidden</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Lock className="w-3 h-3 text-red-400" />
                      <span className="text-gray-500">winning_price:</span>
                      <span className="text-red-400">hidden</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Lock className="w-3 h-3 text-red-400" />
                      <span className="text-gray-500">other_bids:</span>
                      <span className="text-red-400">hidden</span>
                    </div>
                    <div className="h-px bg-surface-700/50 my-3" />
                    <div className="flex items-center gap-2">
                      <Check className="w-3 h-3 text-green-400" />
                      <span className="text-gray-500">is_winner:</span>
                      <span className="text-green-400">true (verified by ZK proof)</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-4 pt-3 border-t border-surface-700/50">
                    Third parties verify the proof on-chain. No trust required.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          PRIVACY COMPARISON TABLE
          ═══════════════════════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-32">
        <AnimatedSection>
          <motion.div variants={fadeInUp} className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 font-display">Why Private Auctions Matter</h2>
            <p className="text-gray-400 max-w-lg mx-auto">Traditional auctions leak everything. Obscura leaks nothing.</p>
          </motion.div>
        </AnimatedSection>
        <AnimatedSection>
          <motion.div variants={fadeInUp} className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-surface-700">
                  <th className="text-left text-gray-400 font-medium py-3 px-4 min-w-[180px]">Feature</th>
                  <th className="text-center text-gray-500 font-medium py-3 px-4">Traditional Auctions</th>
                  <th className="text-center text-accent-400 font-medium py-3 px-4">Obscura</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {[
                  { feature: 'Bid amounts visible to others?', trad: 'Yes — everyone sees', obs: 'No — sealed until you choose to reveal' },
                  { feature: 'Bidder identity exposed?', trad: 'Yes — wallet address on-chain', obs: 'No — hashed, never stored in clear' },
                  { feature: 'Front-running possible?', trad: 'Yes — bots watch mempool', obs: 'No — zero-transfer at bid time' },
                  { feature: 'Fair pricing guaranteed?', trad: 'No — winner\'s curse', obs: 'Yes — Vickrey 2nd-price mechanism' },
                  { feature: 'Dispute resolution?', trad: 'None', obs: 'Bond-based on-chain arbitration' },
                  { feature: 'Selective disclosure?', trad: 'Not possible', obs: 'ZK proof: prove you won without revealing price' },
                ].map((row) => (
                  <tr key={row.feature} className="border-b border-surface-800/50">
                    <td className="py-3 px-4 text-gray-300 font-medium">{row.feature}</td>
                    <td className="py-3 px-4 text-center text-red-400/70">{row.trad}</td>
                    <td className="py-3 px-4 text-center text-green-400">{row.obs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
          <motion.p variants={fadeInUp} className="text-center text-xs text-gray-600 mt-4 italic">
            The first Vickrey (second-price sealed-bid) auction protocol on Aleo — with 4 formats, 3 tokens, and dispute resolution.
          </motion.p>
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          TECHNICAL DEPTH — 3 detailed cards
          ═══════════════════════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-32">
        <AnimatedSection>
          <motion.div variants={fadeInUp} className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3 font-display">Under the Hood</h2>
            <p className="text-gray-400">Real architecture. Real security. Real token flow.</p>
          </motion.div>
        </AnimatedSection>

        <AnimatedSection className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <motion.div variants={fadeInUp} className="card">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-accent-400" />
              <h3 className="text-white font-semibold text-sm">Smart Contract</h3>
            </div>
            <div className="space-y-2.5 text-xs text-gray-400">
              <div className="flex justify-between"><span>Transitions</span><span className="text-white font-mono">28</span></div>
              <div className="flex justify-between"><span>Private Records</span><span className="text-white font-mono">5</span></div>
              <div className="flex justify-between"><span>Mappings</span><span className="text-white font-mono">16</span></div>
              <div className="flex justify-between"><span>Auction Formats</span><span className="text-white font-mono">4 modes</span></div>
              <div className="flex justify-between"><span>Dispute Resolution</span><span className="text-white font-mono">Bond + Admin</span></div>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="card">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-green-400" />
              <h3 className="text-white font-semibold text-sm">Security</h3>
            </div>
            <div className="space-y-2.5 text-xs text-gray-400">
              <div className="flex justify-between"><span>Bid Replay Protection</span><span className="text-green-400">Encrypted</span></div>
              <div className="flex justify-between"><span>Double-Settlement Guard</span><span className="text-green-400">Mapping</span></div>
              <div className="flex justify-between"><span>Anti-Sniping</span><span className="text-green-400">40 blocks</span></div>
              <div className="flex justify-between"><span>Escrow Model</span><span className="text-green-400">Full UTXO</span></div>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="card">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-brand-cyan" />
              <h3 className="text-white font-semibold text-sm">Token Flow</h3>
            </div>
            <div className="space-y-2.5 text-xs text-gray-400">
              <div className="flex justify-between"><span>Deposit</span><span className="text-white font-mono text-[10px]">private_to_public</span></div>
              <div className="flex justify-between"><span>Payout</span><span className="text-white font-mono text-[10px]">public_to_private</span></div>
              <div className="flex justify-between"><span>Fee</span><span className="text-white font-mono">1% (100 BPS)</span></div>
              <div className="flex justify-between"><span>Tokens</span><span className="text-white">ALEO + USDCx + USAD</span></div>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          TECH CREDENTIALS — 4 cards
          ═══════════════════════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-32">
        <AnimatedSection className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {techItems.map((item) => (
            <motion.div
              key={item.title}
              variants={fadeInUp}
              className="card group hover:border-accent-500/30 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500/20 to-brand-cyan/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <item.icon className="w-5 h-5 text-accent-400" />
              </div>
              <h3 className="text-white font-semibold mb-1">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </AnimatedSection>

        <AnimatedSection className="mt-8">
          <motion.p variants={fadeInUp} className="text-center text-xs text-gray-600 font-mono">
            Deployed as{' '}
            <a
              href="https://testnet.explorer.provable.com/program/obscura_v4.aleo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-400/70 hover:text-accent-400 transition-colors"
            >
              obscura_v4.aleo
            </a>{' '}
            on Aleo Testnet · 28 transitions · 4 auction formats · Full escrow
          </motion.p>
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          E2E TEST GUIDE — Seller & Bidder flows
          ═══════════════════════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-32">
        <AnimatedSection>
          <motion.div variants={fadeInUp} className="card border-accent-500/20 bg-accent-500/[0.02]">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-accent-500/20 flex items-center justify-center">
                <FileCheck className="w-5 h-5 text-accent-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Test the Full E2E Flow</h2>
                <p className="text-gray-500 text-sm">Real transactions on Aleo Testnet. No mock data.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-accent-400 font-medium text-sm mb-3 flex items-center gap-2">
                  <Gavel className="w-3.5 h-3.5" />
                  As Seller
                </h4>
                <ol className="space-y-2.5 text-sm text-gray-400">
                  {[
                    'Connect your Aleo wallet (get testnet ALEO from faucet if needed)',
                    'Go to Create Auction → enter a title, reserve price 0.001, pick Vickrey mode, 1h duration',
                    'Submit — your auction is created on-chain with an encrypted reserve price',
                    'After bidding closes, go to your auction → Finalize (re-enter your reserve price)',
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h4 className="text-accent-400 font-medium text-sm mb-3 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  As Bidder
                </h4>
                <ol className="space-y-2.5 text-sm text-gray-400">
                  {[
                    'Browse to any active auction or look up by on-chain ID',
                    'Place a sealed bid — commitment stored on-chain, NO token transfer yet',
                    'When reveal phase opens, reveal your bid — tokens locked here (intentionally public)',
                    'If you win: Claim Win → get WinnerCertificate. If you lose: Claim Refund',
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-surface-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-gray-600">
                Contract: <span className="font-mono text-accent-400/70">obscura_v4.aleo</span> ·
                Deploy TX: <span className="font-mono text-gray-500">at1f3sxnl...928a</span>
              </p>
              <Link to="/create" className="btn-primary text-sm flex items-center gap-2">
                Start Testing
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          FOOTER CTA
          ═══════════════════════════════════════ */}
      <section className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-32">
        <AnimatedSection>
          <motion.div variants={scaleIn} className="relative rounded-3xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-600/20 via-surface-900 to-brand-cyan/10" />
            <div
              className="absolute inset-0"
              style={{
                boxShadow: 'inset 0 0 80px rgba(6, 182, 212, 0.1), inset 0 0 120px rgba(20, 184, 166, 0.05)',
              }}
            />

            <div className="relative z-10 p-8 sm:p-12 text-center">
              <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4 font-display">
                Ready to experience private auctions?
              </h2>
              <p className="text-gray-400 mb-8 max-w-lg mx-auto">
                Connect your wallet and place your first sealed bid.
                No one sees your amount until you choose to reveal.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
                <Link to="/browse" className="btn-primary flex items-center gap-2 text-base px-8 py-3.5">
                  Enter the Auction House
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
                <Link to="/docs" className="hover:text-gray-300 transition-colors">Docs</Link>
                <a
                  href="https://github.com/Ritik200238/obscura-auction"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-300 transition-colors flex items-center gap-1"
                >
                  GitHub
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="https://testnet.explorer.provable.com/program/obscura_v4.aleo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-300 transition-colors flex items-center gap-1"
                >
                  Aleo Explorer
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>
    </div>
  )
}
