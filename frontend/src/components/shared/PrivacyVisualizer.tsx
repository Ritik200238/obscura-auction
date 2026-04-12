import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, Lock, Unlock, ChevronRight } from 'lucide-react'

type Phase = 'bid' | 'reveal' | 'settle' | 'post'

interface FieldDef {
  key: string
  public: boolean
  label: string
  stored: string
  note?: string
}

interface PhaseDef {
  key: Phase
  name: string
  summary: string
  observer_learns: string
  observer_does_not_learn: string
  fields: FieldDef[]
  token_flow?: string
}

const PHASES: PhaseDef[] = [
  {
    key: 'bid',
    name: 'Phase 1 — Sealed Bid',
    summary: 'Zero tokens move. Amount cryptographically hidden.',
    observer_learns: 'An auction exists. Bid count incremented by 1.',
    observer_does_not_learn: 'Bid amount. Bidder identity. Which bid this is.',
    token_flow: 'NONE — zero token transfer',
    fields: [
      { key: 'bid_amount', public: false, label: 'bid_amount', stored: 'Encrypted in SealedBid record (owned by bidder only)' },
      { key: 'bidder', public: false, label: 'bidder address', stored: 'Record owner field, never on-chain mapping' },
      { key: 'bid_hash', public: true, label: 'bid_hash', stored: 'BHP256(bidder, auction_id, amount, nonce) in bid_commitments[bid_hash] = true', note: 'Hash only — cannot reverse' },
      { key: 'nullifier', public: true, label: 'nullifier', stored: 'BHP256(bid_nonce) in bid_nullifiers mapping', note: 'Prevents replay, reveals nothing' },
    ],
  },
  {
    key: 'reveal',
    name: 'Phase 2 — Reveal (v6)',
    summary: 'Bidder consumes SealedBid. Running max tracked temporarily.',
    observer_learns: 'A bid was revealed (bool flag). Running max visible DURING reveal window only.',
    observer_does_not_learn: 'Amount (committed in bid_hash). Bidder identity. Mapping from bidder → specific bid.',
    token_flow: 'transfer_private_to_public — amount visible on credits.aleo (inherent Aleo constraint)',
    fields: [
      { key: 'revealed', public: true, label: 'revealed_bids[bid_hash]', stored: '= true (v6: bool flag, NOT amount)', note: 'Amount committed in bid_hash key' },
      { key: 'highest', public: true, label: 'highest_bids[auction_id]', stored: 'u128 plaintext (TEMPORARY — deleted post-settle)', note: 'Only visible during reveal window' },
      { key: 'pop', public: false, label: 'BidderParticipationProof', stored: 'New private record emitted to bidder', note: 'Non-transferable "I bid" proof' },
    ],
  },
  {
    key: 'settle',
    name: 'Phase 3 — Settle (v6)',
    summary: 'Winner claims. Running max deleted. Price hidden in commit.',
    observer_learns: 'Settlement hash. Winner bid hash. settled_at block.',
    observer_does_not_learn: 'Final price (commit-only). Fee amount. Winner address.',
    token_flow: 'transfer_public_to_private — recipient hidden on ALEO path',
    fields: [
      { key: 'settlement_commit', public: true, label: 'settlements[id].price_commit', stored: 'BHP256(price, fee, nonce, settled_at) — hiding', note: 'Only parties with (price, salt) can open' },
      { key: 'running_max', public: false, label: 'highest_bids[auction_id]', stored: 'DELETED via Mapping::remove', note: 'Post-settle cleanup' },
      { key: 'completion_proof', public: false, label: 'AuctionCompletionProof', stored: 'New private record emitted to seller', note: 'Portable seller reputation, NO competitor has this' },
      { key: 'winner_cert', public: false, label: 'WinnerCertificate', stored: 'Private record owned by winner', note: 'Usable for prove_won_auction selective disclosure' },
    ],
  },
  {
    key: 'post',
    name: 'Phase 4 — Post-Settle',
    summary: 'Only hashes remain on-chain. Winner can selectively disclose.',
    observer_learns: 'Settlement hash exists. That\'s it.',
    observer_does_not_learn: 'Who won. What they paid. Who bid. Anything else.',
    fields: [
      { key: 'settlement', public: true, label: 'settlement_proofs[id]', stored: 'BHP256 hash — tamper-evident, info-revealing nothing' },
      { key: 'claim_proof', public: false, label: 'prove_won_auction ZK proof', stored: 'On-demand: winner generates selectively', note: 'Shareable with lender/compliance without leaking price' },
    ],
  },
]

export default function PrivacyVisualizer() {
  const [active, setActive] = useState<Phase>('bid')
  const phase = PHASES.find(p => p.key === active)!

  return (
    <div className="relative rounded-2xl overflow-hidden border border-accent-500/20 bg-surface-950/40 backdrop-blur-sm">
      <div className="absolute inset-0 bg-gradient-to-br from-accent-500/5 via-transparent to-brand-cyan/5 pointer-events-none" />

      <div className="relative p-6 sm:p-8">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/10 border border-accent-500/30 text-accent-400 text-xs font-medium mb-3">
            <Lock className="w-3 h-3" />
            Interactive · No competitor has this
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 font-display">
            What Does the Observer Learn?
          </h2>
          <p className="text-gray-400 text-sm max-w-lg mx-auto">
            Click each phase to see exactly what's stored on-chain vs kept private.
            Honest accounting — including inherent Aleo limits.
          </p>
        </div>

        {/* Phase tabs */}
        <div className="flex flex-wrap gap-2 mb-6 justify-center">
          {PHASES.map((p, i) => (
            <button
              key={p.key}
              onClick={() => setActive(p.key)}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${
                active === p.key
                  ? 'bg-accent-500/20 border border-accent-500/50 text-accent-300'
                  : 'bg-surface-900/60 border border-surface-700 text-gray-400 hover:border-surface-600'
              }`}
            >
              <span className="opacity-60 mr-1">{i + 1}.</span>
              {p.name.split('—')[1]?.trim() ?? p.name}
            </button>
          ))}
        </div>

        {/* Active phase content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phase.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {/* Phase summary */}
            <div className="mb-5 p-4 rounded-xl bg-surface-900/60 border border-surface-800">
              <div className="flex items-start gap-3">
                <ChevronRight className="w-4 h-4 text-accent-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1">{phase.name}</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{phase.summary}</p>
                </div>
              </div>
            </div>

            {/* What observer learns / doesn't learn */}
            <div className="grid md:grid-cols-2 gap-3 mb-5">
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-red-400" />
                  <span className="text-red-300 text-xs font-semibold uppercase tracking-wider">Observer learns</span>
                </div>
                <p className="text-sm text-gray-300">{phase.observer_learns}</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <EyeOff className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300 text-xs font-semibold uppercase tracking-wider">Observer does NOT learn</span>
                </div>
                <p className="text-sm text-gray-300">{phase.observer_does_not_learn}</p>
              </div>
            </div>

            {/* Field-level breakdown */}
            <div className="space-y-2 mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Field-level breakdown</h4>
              {phase.fields.map(field => (
                <div
                  key={field.key}
                  className={`p-3 rounded-lg border ${
                    field.public
                      ? 'bg-red-500/5 border-red-500/20'
                      : 'bg-emerald-500/5 border-emerald-500/20'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {field.public ? (
                      <Unlock className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono text-white">{field.label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${
                          field.public
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {field.public ? 'Public' : 'Private'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{field.stored}</p>
                      {field.note && (
                        <p className="text-[10px] text-gray-500 mt-1 italic">→ {field.note}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {phase.token_flow && (
              <div className="p-3 rounded-lg bg-surface-900/80 border border-surface-700">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Token flow this phase</p>
                <p className="text-xs text-gray-300 font-mono">{phase.token_flow}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
