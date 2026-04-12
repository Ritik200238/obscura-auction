import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { Package, Lock, Eye, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'

const ITEMS = [
  { id: 1, label: 'Item A', mask: 0b0001, hint: 'Logo design' },
  { id: 2, label: 'Item B', mask: 0b0010, hint: 'Brand guide' },
  { id: 3, label: 'Item C', mask: 0b0100, hint: 'Social assets' },
  { id: 4, label: 'Item D', mask: 0b1000, hint: 'Launch copy' },
]

const SAMPLE_BIDS = [
  { bidder: 'Alice', mask: 0b0011, label: 'A+B', amount: 450, strategy: 'Wants matching design + brand only' },
  { bidder: 'Bob', mask: 0b1100, label: 'C+D', amount: 380, strategy: 'Focuses on marketing deliverables' },
  { bidder: 'Carol', mask: 0b1111, label: 'A+B+C+D', amount: 700, strategy: 'Full package — single owner' },
  { bidder: 'Dan', mask: 0b0101, label: 'A+C', amount: 300, strategy: 'Logo + social only' },
]

function bitmaskString(mask: number) {
  return mask.toString(2).padStart(4, '0')
}

function labelFromMask(mask: number) {
  return ITEMS.filter(i => (mask & i.mask) !== 0).map(i => i.label.split(' ')[1]).join('+') || '—'
}

function overlaps(a: number, b: number) {
  return (a & b) !== 0
}

function findMaxRevenueAllocation(): { chosen: number[]; total: number } {
  // Greedy over combinations of up to 3 non-overlapping bids
  let best = { chosen: [] as number[], total: 0 }
  const n = SAMPLE_BIDS.length
  for (let i = 0; i < n; i++) {
    // Single bid
    if (SAMPLE_BIDS[i].amount > best.total) best = { chosen: [i], total: SAMPLE_BIDS[i].amount }
    for (let j = i + 1; j < n; j++) {
      if (overlaps(SAMPLE_BIDS[i].mask, SAMPLE_BIDS[j].mask)) continue
      const two = SAMPLE_BIDS[i].amount + SAMPLE_BIDS[j].amount
      if (two > best.total) best = { chosen: [i, j], total: two }
      for (let k = j + 1; k < n; k++) {
        if (overlaps(SAMPLE_BIDS[i].mask | SAMPLE_BIDS[j].mask, SAMPLE_BIDS[k].mask)) continue
        const three = two + SAMPLE_BIDS[k].amount
        if (three > best.total) best = { chosen: [i, j, k], total: three }
      }
    }
  }
  return best
}

export default function Combinatorial() {
  const [selected, setSelected] = useState<number[]>([])
  const [sampleAmount, setSampleAmount] = useState(500)

  const mask = selected.reduce((acc, id) => {
    const item = ITEMS.find(i => i.id === id)
    return item ? acc | item.mask : acc
  }, 0)

  const allocation = findMaxRevenueAllocation()
  const chosenBids = allocation.chosen.map(i => SAMPLE_BIDS[i])

  const toggle = (id: number) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 mesh-gradient opacity-50" />
        <div className="relative max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/30 text-xs text-accent-400 font-medium mb-6"
          >
            <Sparkles className="w-3 h-3" />
            First combinatorial auction on Aleo
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-6xl font-extrabold text-white mb-6 font-display tracking-tight"
          >
            Combinatorial<br /><span className="text-accent-400">Subset Bidding</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed"
          >
            Bid on <span className="text-white">any combination</span> of items in a bundle. The protocol
            picks the revenue-maximizing allocation where no two winners claim the same item.
            Your bid amount AND which items you want both stay private until you reveal.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 justify-center mt-8"
          >
            <Link to="/create" className="btn-primary flex items-center justify-center gap-2 px-6 py-3">
              Create Bundle Auction
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/browse?mode=5" className="btn-secondary flex items-center justify-center gap-2 px-6 py-3">
              Browse Live Bundles
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Try it yourself */}
      <section className="py-16 px-4 border-t border-surface-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3 font-display">Try the Bitmask</h2>
            <p className="text-gray-400">Select items you'd want. See the cryptographic commitment structure.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Item selector */}
            <div className="card">
              <h3 className="text-white font-semibold mb-4 text-sm">Select your subset</h3>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {ITEMS.map(item => {
                  const active = selected.includes(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      className={`p-4 rounded-xl border text-left transition ${active
                        ? 'border-accent-500/60 bg-accent-500/10'
                        : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-semibold text-sm ${active ? 'text-accent-300' : 'text-gray-300'}`}>
                          {item.label}
                        </span>
                        {active && <CheckCircle2 className="w-4 h-4 text-accent-400" />}
                      </div>
                      <div className="text-[10px] text-gray-500">{item.hint}</div>
                      <div className="mt-2 text-[10px] font-mono text-gray-600">mask {bitmaskString(item.mask)}</div>
                    </button>
                  )
                })}
              </div>
              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1 block">Your bid amount (ALEO)</label>
                <input
                  type="number"
                  value={sampleAmount}
                  onChange={e => setSampleAmount(Number(e.target.value) || 0)}
                  className="input-field w-full"
                  min={1}
                />
              </div>
            </div>

            {/* Commitment structure */}
            <div className="card bg-surface-900">
              <h3 className="text-white font-semibold mb-4 text-sm flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                What goes on-chain
              </h3>
              <div className="space-y-3 text-xs font-mono">
                <div className="p-3 rounded-lg bg-surface-950/80 border border-surface-700/50">
                  <div className="text-gray-500 mb-1">Subset bitmask (u8)</div>
                  <div className="text-emerald-400 text-base">
                    {bitmaskString(mask)}<sub className="text-gray-500 ml-2 text-xs">= {mask}u8</sub>
                  </div>
                  <div className="text-gray-600 mt-1 text-[10px]">
                    {labelFromMask(mask) || 'no items selected'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-surface-950/80 border border-surface-700/50">
                  <div className="text-gray-500 mb-1">bid_hash = BHP256(...)</div>
                  <div className="text-brand-cyan break-all">
                    {mask ? 'field.private (never on-chain in plaintext)' : '—'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-surface-950/80 border border-surface-700/50">
                  <div className="text-gray-500 mb-1">Bid amount</div>
                  <div className="text-gray-400">
                    {sampleAmount > 0 ? 'SEALED — private input only, never in mapping' : '—'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <div className="flex items-start gap-2">
                    <Eye className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                    <p className="text-emerald-300 text-[11px] leading-relaxed font-sans">
                      Observer sees: "A subset bid was placed on auction X." They don't learn which items,
                      what amount, or who you are.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Allocation algorithm */}
      <section className="py-16 px-4 border-t border-surface-800 bg-surface-950/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3 font-display">Revenue-Maximizing Allocation</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              After reveal, the contract solves: pick non-overlapping subsets that maximize total revenue.
              Winners get their items. Losers get full refunds.
            </p>
          </div>

          <div className="card">
            <div className="text-sm text-gray-400 mb-4">Example: 4 revealed bids</div>
            <div className="space-y-2 mb-6">
              {SAMPLE_BIDS.map((bid, i) => {
                const won = allocation.chosen.includes(i)
                return (
                  <div key={i} className={`flex items-center gap-4 p-3 rounded-lg border transition ${won
                    ? 'border-accent-500/40 bg-accent-500/5'
                    : 'border-surface-800 bg-surface-900/50'
                    }`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${won ? 'bg-accent-500/30 text-accent-300' : 'bg-surface-800 text-gray-500'
                      }`}>
                      {bid.bidder[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className={`font-semibold text-sm ${won ? 'text-white' : 'text-gray-400'}`}>{bid.bidder}</span>
                        <span className="text-xs font-mono text-gray-500">{bitmaskString(bid.mask)}</span>
                        <span className="text-xs text-gray-500">{bid.label}</span>
                      </div>
                      <div className="text-[10px] text-gray-600">{bid.strategy}</div>
                    </div>
                    <div className={`text-sm font-mono ${won ? 'text-accent-300' : 'text-gray-500'}`}>
                      {bid.amount} ALEO
                    </div>
                    <div className={`text-xs w-16 text-right ${won ? 'text-accent-400' : 'text-gray-600'}`}>
                      {won ? 'WON' : 'REFUND'}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-surface-800">
              <div>
                <div className="text-xs text-gray-500 mb-1">Winning allocation</div>
                <div className="text-white font-semibold">
                  {chosenBids.map(b => b.bidder).join(' + ')}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Items covered</div>
                <div className="text-white font-semibold font-mono text-sm">
                  {bitmaskString(chosenBids.reduce((m, b) => m | b.mask, 0))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Seller revenue</div>
                <div className="text-accent-400 font-semibold text-lg font-mono">
                  {allocation.total} ALEO
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 p-5 rounded-xl bg-surface-900/60 border border-surface-800">
            <div className="flex items-start gap-3">
              <Package className="w-4 h-4 text-accent-400 mt-0.5" />
              <div className="text-sm text-gray-300 leading-relaxed">
                <p className="mb-2">
                  <span className="text-white font-semibold">Why this matters:</span> Carol bids 700 ALEO for everything,
                  but Alice (450) + Bob (380) = 830 ALEO for a disjoint partition. Combinatorial auctions let the seller
                  capture that extra 130 ALEO instead of leaving it on the table.
                </p>
                <p className="text-gray-400 text-xs">
                  The contract enforces non-overlap via bitwise AND on revealed bitmasks. ZK proofs ensure
                  the allocation solver honored all constraints without the seller seeing individual bidder strategies.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-16 px-4 border-t border-surface-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-3 font-display">Real-World Use Cases</h2>
            <p className="text-gray-400">Where combinatorial bidding beats a standard auction.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { title: 'NFT Collections', desc: 'Sell a 4-piece art collection where buyers prefer matched pairs over isolated pieces.' },
              { title: 'Ad Slot Packages', desc: 'Advertisers bid on combinations of impressions across time slots and regions.' },
              { title: 'Service Bundles', desc: 'Agencies pick up related scopes (logo + brand + social) from a procurement buyer.' },
            ].map(c => (
              <div key={c.title} className="card">
                <div className="text-white font-semibold text-sm mb-2">{c.title}</div>
                <p className="text-xs text-gray-400 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 border-t border-surface-800 text-center">
        <div className="max-w-2xl mx-auto">
          <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4 font-display">
            Ready to run a combinatorial auction?
          </h3>
          <p className="text-gray-400 mb-6">
            Set up 4 items, configure reserve prices, and let bidders submit subsets privately.
          </p>
          <Link to="/create" className="btn-primary inline-flex items-center gap-2 px-8 py-3">
            Create Bundle Auction
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
