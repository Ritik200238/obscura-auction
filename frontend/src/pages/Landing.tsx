import { Link } from 'react-router-dom'
import { motion, useInView, animate } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import { fadeInUp, staggerContainer, scaleIn } from '@/lib/animations'
import {
  Shield,
  TrendingDown,
  Clock,
  ArrowRight,
  Lock,
  Eye,
  Gavel,
  CheckCircle,
  Award,
  Zap,
  Globe,
  FileCheck,
  Layers,
  Fingerprint,
  ShieldCheck,
} from 'lucide-react'

const features = [
  {
    icon: Shield,
    title: 'Sealed Bids',
    description:
      'Every bid is encrypted on-chain using Aleo records. No one can see bid amounts until the reveal phase.',
    color: 'from-accent-500/20 to-accent-600/10',
    iconColor: 'text-accent-400',
  },
  {
    icon: TrendingDown,
    title: 'Vickrey Auctions',
    description:
      'Vickrey mode tracks the second-highest bid on-chain. Requires 2+ revealed bids to settle, promoting fair competition.',
    color: 'from-brand-cyan/20 to-brand-teal/10',
    iconColor: 'text-brand-cyan',
  },
  {
    icon: Clock,
    title: 'Anti-Sniping',
    description:
      'Block-height deadlines with automatic extensions prevent last-second bid manipulation.',
    color: 'from-amber-500/20 to-orange-500/10',
    iconColor: 'text-amber-400',
  },
]

const steps = [
  { icon: Gavel, label: 'Create', description: 'Set item, reserve price, and auction mode' },
  { icon: Lock, label: 'Bid', description: 'Place sealed commitment — no tokens locked, amounts fully private' },
  { icon: Eye, label: 'Reveal', description: 'Reveal bids after deadline passes' },
  { icon: CheckCircle, label: 'Settle', description: 'Finalize and determine the winner' },
  { icon: Award, label: 'Claim', description: 'Winner claims item, losers get refunds' },
]

const stats = [
  { label: 'Transitions', value: '17', numValue: 17, icon: Layers, detail: 'On-chain functions' },
  { label: 'Record Types', value: '4', numValue: 4, icon: Shield, detail: 'Private UTXO records' },
  { label: 'Tokens', value: 'ALEO + USDCx', numValue: null, icon: Globe, detail: 'Real asset support' },
  { label: 'Auction Modes', value: 'Vickrey + First', numValue: null, icon: Zap, detail: 'Game-theory optimal' },
]

/** Animated counter that counts up when scrolled into view */
function AnimatedCounter({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!isInView) return
    const controls = animate(0, target, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [isInView, target])

  return <span ref={ref}>{display}</span>
}

const privacyRows = [
  { data: 'Bid Amounts (during bidding)', isPrivate: true, detail: 'No transfer at bid time — zero amount leakage during sealed phase' },
  { data: 'Bidder Identity', isPrivate: true, detail: 'Never stored on-chain in any mapping' },
  { data: 'Reserve Price', isPrivate: true, detail: 'BHP256 hash only — plaintext never on-chain until settlement' },
  { data: 'Seller Address', isPrivate: true, detail: 'Hashed via BHP256 — only hash on-chain' },
  { data: 'Bid Amounts (after reveal)', isPrivate: false, detail: 'Intentionally public — the reveal phase makes amounts public' },
  { data: 'Auction Status', isPrivate: false, detail: 'Required for state machine transitions' },
  { data: 'Bid Count', isPrivate: false, detail: 'Counter only, no individual amounts' },
]

/** Wrapper that triggers children animation when scrolled into view */
function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
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

export default function Landing() {
  return (
    <div className="relative">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-accent-500/[0.07] rounded-full blur-[120px]" />
        <div className="absolute top-[30%] right-0 w-[500px] h-[500px] bg-brand-cyan/[0.04] rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent-600/[0.05] rounded-full blur-[100px]" />
        <div className="absolute inset-0 dot-grid opacity-40" />
      </div>

      {/* Hero */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-32 pb-20 sm:pb-32">
        <div className="text-center max-w-4xl mx-auto animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-400 text-sm font-medium mb-8">
            <Shield className="w-3.5 h-3.5" />
            <span>Powered by Aleo Zero-Knowledge Proofs</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-8xl font-extrabold text-white leading-[1.05] tracking-tight mb-6">
            First Vickrey Auction
            <br />
            <span className="text-gradient-animated">on Aleo</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Sealed-bid auctions where bid amounts are completely private until reveal.
            Winner pays the second-highest bid — the game-theoretically optimal mechanism.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link to="/create" className="btn-primary flex items-center gap-2 text-base px-8 py-3.5">
              Create Auction
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/browse" className="btn-secondary flex items-center gap-2 text-base px-8 py-3.5">
              Browse Auctions
            </Link>
          </div>

          {/* Live contract callout */}
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl bg-surface-900/90 border border-surface-700/60 text-sm glow-sm">
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
              <ArrowRight className="w-3 h-3" />
            </a>
            <span className="text-surface-600">|</span>
            <span className="text-gray-500 text-xs">Fee: 1%</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <AnimatedSection className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={fadeInUp}
              whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
              className="card-hover group"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </AnimatedSection>
      </section>

      {/* How It Works */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">How It Works</h2>
          <p className="text-gray-400 max-w-lg mx-auto">
            Five phases enforced entirely by zero-knowledge proofs on Aleo.
          </p>
        </div>

        <AnimatedSection className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          {steps.map((step, i) => (
            <motion.div key={step.label} variants={fadeInUp} className="relative">
              <div className="card text-center h-full hover:border-accent-500/20 transition-all duration-300">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500/30 to-accent-600/20 text-accent-400 text-sm font-bold flex items-center justify-center mx-auto mb-3">
                  {i + 1}
                </div>
                <div className="w-10 h-10 rounded-lg bg-surface-800/80 flex items-center justify-center mx-auto mb-3">
                  <step.icon className="w-5 h-5 text-gray-300" />
                </div>
                <h4 className="text-white font-semibold mb-1 text-sm">{step.label}</h4>
                <p className="text-gray-500 text-xs leading-relaxed">
                  {step.description}
                </p>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden sm:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                  <ArrowRight className="w-4 h-4 text-surface-600" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatedSection>
      </section>

      {/* Privacy Wall — differentiator */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <div className="glass-card p-4 sm:p-6 lg:p-8 glow">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent-500/20 flex items-center justify-center">
              <Fingerprint className="w-5 h-5 text-accent-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Privacy Wall</h2>
              <p className="text-gray-500 text-sm">What stays private vs what's public on-chain</p>
            </div>
          </div>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {privacyRows.map((row) => (
              <motion.div
                key={row.data}
                variants={fadeInUp}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  row.isPrivate
                    ? 'bg-green-500/[0.03] border-green-500/10'
                    : 'bg-yellow-500/[0.03] border-yellow-500/10'
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  row.isPrivate ? 'bg-green-400' : 'bg-yellow-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{row.data}</p>
                  <p className="text-xs text-gray-500">{row.detail}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  row.isPrivate
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-yellow-500/10 text-yellow-400'
                }`}>
                  {row.isPrivate ? 'Private' : 'Public'}
                </span>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Architecture Stats */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <AnimatedSection className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <motion.div key={stat.label} variants={fadeInUp} className="card text-center group hover:border-accent-500/30 transition-all duration-300">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500/20 to-accent-600/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                <stat.icon className="w-5 h-5 text-accent-400" />
              </div>
              <p className="text-white font-bold text-2xl font-mono">
                {stat.numValue !== null ? <AnimatedCounter target={stat.numValue} /> : stat.value}
              </p>
              <p className="text-gray-500 text-xs mt-1">{stat.label}</p>
              <p className="text-gray-600 text-[10px] mt-0.5">{stat.detail}</p>
            </motion.div>
          ))}
        </AnimatedSection>
      </section>

      {/* Technical Depth */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <AnimatedSection className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <motion.div variants={fadeInUp} className="card">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-accent-400" />
              <h3 className="text-white font-semibold text-sm">Smart Contract</h3>
            </div>
            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex justify-between"><span>Transitions</span><span className="text-white font-mono">17</span></div>
              <div className="flex justify-between"><span>Private Records</span><span className="text-white font-mono">4</span></div>
              <div className="flex justify-between"><span>Mappings</span><span className="text-white font-mono">13</span></div>
              <div className="flex justify-between"><span>State Machine</span><span className="text-white font-mono">8 states</span></div>
              <div className="flex justify-between"><span>ZK Primitives</span><span className="text-white font-mono">commit.bhp256</span></div>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="card">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-green-400" />
              <h3 className="text-white font-semibold text-sm">Security</h3>
            </div>
            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex justify-between"><span>Bid Replay Protection</span><span className="text-green-400">BHP256</span></div>
              <div className="flex justify-between"><span>Double-Settlement Guard</span><span className="text-green-400">Mapping</span></div>
              <div className="flex justify-between"><span>Anti-Sniping</span><span className="text-green-400">40 blocks</span></div>
              <div className="flex justify-between"><span>Escrow Model</span><span className="text-green-400">Full UTXO</span></div>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="card">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-brand-cyan" />
              <h3 className="text-white font-semibold text-sm">Token Flow</h3>
            </div>
            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex justify-between"><span>Deposit</span><span className="text-white font-mono text-[10px]">private_to_public</span></div>
              <div className="flex justify-between"><span>Payout</span><span className="text-white font-mono text-[10px]">public_to_private</span></div>
              <div className="flex justify-between"><span>Fee</span><span className="text-white font-mono">1% (100 BPS)</span></div>
              <div className="flex justify-between"><span>Tokens</span><span className="text-white">ALEO + USDCx</span></div>
            </div>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* CTA */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <div className="card border-accent-500/20 bg-gradient-to-br from-surface-900 to-surface-800/50 glow">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-2">
                Privacy First, Always
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Bid amounts are stored as encrypted Aleo records. The commit-reveal pattern
                ensures no one can front-run or peek at bids. Even after settlement,
                individual bid amounts remain private.
              </p>
            </div>
            <Link
              to="/docs"
              className="btn-secondary text-sm whitespace-nowrap flex items-center gap-2"
            >
              Read Privacy Model
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Test It — concrete E2E guide without fake data */}
      <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="card border-accent-500/20 bg-accent-500/[0.02]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent-500/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-accent-400" />
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
                    <span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
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
                    <span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
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
        </div>
      </section>
    </div>
  )
}
