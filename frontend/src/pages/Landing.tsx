import { Link } from 'react-router-dom'
import { motion, useInView, animate } from 'framer-motion'
import { useRef, useEffect, useState, useMemo } from 'react'
import { fadeInUp, staggerContainer, scaleIn } from '@/lib/animations'
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
  const isInView = useInView(ref, { once: true, margin: '-40px' })

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
  const isInView = useInView(ref, { once: true, margin: '-40px' })

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
  const isInView = useInView(ref, { once: true, margin: '-40px' })

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
          <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
            <span className="text-[9px] font-bold text-purple-400">B1</span>
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
        <div className="w-px h-5 bg-gradient-to-b from-purple-500/40 to-accent-500/60" />
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
  { label: 'Transitions', value: 17, detail: 'On-chain functions' },
  { label: 'Record Types', value: 4, detail: 'Private UTXO records' },
  { label: 'Private Mappings', value: 13, detail: 'Encrypted state' },
  { label: 'State Machine', value: 8, detail: 'Auction phases' },
  { label: 'Token Types', value: 2, detail: 'ALEO + USDCx' },
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
   ANIMATED COUNTER
   ───────────────────────────────────────────── */

function AnimatedCounter({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })
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
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 mb-8">
            {heroWords.map((word, i) => (
              <motion.span
                key={word}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={wordVariants}
                className="text-4xl sm:text-7xl lg:text-9xl font-extrabold tracking-tight text-white"
                style={{
                  textShadow: i === 0
                    ? '0 0 60px rgba(124, 58, 237, 0.3)'
                    : i === 1
                    ? '0 0 60px rgba(6, 182, 212, 0.3)'
                    : '0 0 60px rgba(168, 85, 247, 0.3)',
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
            className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            The first zero-knowledge Vickrey auction protocol on Aleo
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.2, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10"
          >
            <Link to="/browse" className="btn-primary flex items-center gap-2 text-base px-8 py-3.5">
              Enter the Auction House
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/docs" className="btn-secondary flex items-center gap-2 text-base px-8 py-3.5">
              Watch How It Works
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.6, duration: 0.5 }}
            className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl bg-surface-900/90 border border-surface-700/60 text-sm glow-sm"
          >
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 font-medium font-mono text-xs">obscura_v3.aleo</span>
            </span>
            <span className="text-surface-600">|</span>
            <a
              href="https://testnet.aleoscan.io/program?id=obscura_v3.aleo"
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
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-gray-400 max-w-lg mx-auto text-lg">Three phases. Zero trust required.</p>
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
              <h3 className="text-lg font-bold text-white mb-3 mt-5 tracking-wide">SEALED BIDS</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Every bid encrypted with BHP256 commitments. No one sees amounts until reveal.
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
              <h3 className="text-lg font-bold text-white mb-3 mt-5 tracking-wide">ZERO-KNOWLEDGE REVEAL</h3>
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
              style={{ boxShadow: '0 0 40px rgba(168, 85, 247, 0.1)' }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-sm font-bold text-gray-400 font-mono">3</div>
                <Gavel className="w-6 h-6 text-purple-400" />
              </div>
              <SettleVisual />
              <h3 className="text-lg font-bold text-white mb-3 mt-5 tracking-wide">VICKREY SETTLEMENT</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Winner pays second-highest price. Fair pricing guaranteed by protocol economics.
              </p>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          PRIVACY WALL
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

        <AnimatedSection className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.h2
            variants={fadeInUp}
            className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight"
          >
            This is what the
            <br />
            <span className="text-gradient-animated">blockchain sees.</span>
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-lg sm:text-xl text-gray-400 mb-10 max-w-xl mx-auto">
            Only you see the real data. That's zero-knowledge privacy.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Link to="/docs" className="btn-secondary inline-flex items-center gap-2 text-base px-8 py-3.5">
              See Privacy in Action
              <ArrowRight className="w-4 h-4" />
            </Link>
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
              <p className="text-sm text-gray-300 font-medium">{stat.label}</p>
              <p className="text-xs text-gray-600 mt-1">{stat.detail}</p>
            </motion.div>
          ))}
        </AnimatedSection>
      </section>

      {/* ═══════════════════════════════════════
          TECHNICAL DEPTH — 3 detailed cards
          ═══════════════════════════════════════ */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-32">
        <AnimatedSection>
          <motion.div variants={fadeInUp} className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Under the Hood</h2>
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
              <div className="flex justify-between"><span>Transitions</span><span className="text-white font-mono">17</span></div>
              <div className="flex justify-between"><span>Private Records</span><span className="text-white font-mono">4</span></div>
              <div className="flex justify-between"><span>Mappings</span><span className="text-white font-mono">13</span></div>
              <div className="flex justify-between"><span>State Machine</span><span className="text-white font-mono">8 states</span></div>
              <div className="flex justify-between"><span>ZK Primitives</span><span className="text-white font-mono">commit.bhp256</span></div>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="card">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-green-400" />
              <h3 className="text-white font-semibold text-sm">Security</h3>
            </div>
            <div className="space-y-2.5 text-xs text-gray-400">
              <div className="flex justify-between"><span>Bid Replay Protection</span><span className="text-green-400">BHP256</span></div>
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
              <div className="flex justify-between"><span>Tokens</span><span className="text-white">ALEO + USDCx</span></div>
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
              href="https://testnet.aleoscan.io/program?id=obscura_v3.aleo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-400/70 hover:text-accent-400 transition-colors"
            >
              obscura_v3.aleo
            </a>{' '}
            on Aleo Testnet · 17 transitions · commit.bhp256 · Full UTXO escrow
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
                    'Submit — your auction is created on-chain with a BHP256-hashed reserve',
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
                Contract: <span className="font-mono text-accent-400/70">obscura_v3.aleo</span> ·
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
                boxShadow: 'inset 0 0 80px rgba(124, 58, 237, 0.1), inset 0 0 120px rgba(6, 182, 212, 0.05)',
              }}
            />

            <div className="relative z-10 p-8 sm:p-12 text-center">
              <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4">
                Ready to experience private auctions?
              </h2>
              <p className="text-gray-400 mb-8 max-w-lg mx-auto">
                Connect your wallet and place your first sealed bid.
                No one sees your amount until you choose to reveal.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
                <Link to="/browse" className="btn-primary flex items-center gap-2 text-base px-8 py-3.5">
                  Connect Wallet
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
                  href="https://testnet.aleoscan.io/program?id=obscura_v3.aleo"
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
