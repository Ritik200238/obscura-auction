import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Gavel, Users, Clock, ShieldCheck, AlertCircle, ArrowRight, Scale, CheckCircle2, XCircle } from 'lucide-react'
import { fetchMapping } from '@/lib/aleo'

const DISPUTE_PROGRAM = 'obscura_dispute_v1.aleo'
const EXPLORER = 'https://testnet.explorer.provable.com'

const STATUS_LABELS: Record<number, { name: string; color: string; icon: typeof Clock }> = {
  1: { name: 'OPEN · jurors staking', color: 'text-amber-400', icon: Clock },
  2: { name: 'VOTING · commits closing', color: 'text-amber-400', icon: Clock },
  3: { name: 'REVEALING · jurors opening votes', color: 'text-brand-cyan', icon: Scale },
  4: { name: 'UPHELD · dispute won', color: 'text-emerald-400', icon: CheckCircle2 },
  5: { name: 'REJECTED · dispute lost', color: 'text-red-400', icon: XCircle },
  6: { name: 'EXPIRED', color: 'text-gray-500', icon: XCircle },
}

interface DisputeState {
  disputer_hash: string
  settlement_hash: string
  bond_pool: string
  status: number
  filed_at: number
  voting_ends: number
  reveal_ends: number
  jurors_staked: number
  votes_revealed: number
  votes_upheld: number
  votes_rejected: number
}

function parseDisputeState(raw: string): DisputeState | null {
  try {
    const clean = raw.replace(/\s+/g, '').replace(/[{}]/g, '')
    const fields: Record<string, string> = {}
    for (const pair of clean.split(',')) {
      const [k, v] = pair.split(':')
      if (k && v) fields[k] = v.replace(/u\d+|field/g, '')
    }
    return {
      disputer_hash: fields.disputer_hash ?? '',
      settlement_hash: fields.settlement_hash ?? '',
      bond_pool: fields.bond_pool ?? '0',
      status: Number(fields.status ?? 0),
      filed_at: Number(fields.filed_at ?? 0),
      voting_ends: Number(fields.voting_ends ?? 0),
      reveal_ends: Number(fields.reveal_ends ?? 0),
      jurors_staked: Number(fields.jurors_staked ?? 0),
      votes_revealed: Number(fields.votes_revealed ?? 0),
      votes_upheld: Number(fields.votes_upheld ?? 0),
      votes_rejected: Number(fields.votes_rejected ?? 0),
    }
  } catch {
    return null
  }
}

function microToAleo(micros: string | number): string {
  const n = Number(micros)
  return (n / 1_000_000).toFixed(2)
}

export default function Dispute() {
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<DisputeState | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    const auctionKey = id.endsWith('field') ? id : `${id}field`
    setLoading(true)
    fetchMapping('disputes', auctionKey, DISPUTE_PROGRAM)
      .then(raw => {
        if (!raw) {
          setNotFound(true)
        } else {
          const parsed = parseDisputeState(raw)
          if (parsed) setState(parsed)
          else setNotFound(true)
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  const statusInfo = state ? STATUS_LABELS[state.status] : null
  const StatusIcon = statusInfo?.icon ?? Gavel

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-14 px-4 border-b border-surface-800">
        <div className="absolute inset-0 mesh-gradient opacity-40" />
        <div className="relative max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium mb-3">
                <Scale className="w-3 h-3" />
                Multi-voter dispute resolution · obscura_dispute_v1
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white font-display mb-2">
                Dispute Resolution
              </h1>
              <p className="text-gray-400 text-sm">
                Auction ID: <span className="font-mono text-xs text-gray-500 break-all">{id}</span>
              </p>
            </div>
            <a
              href={`${EXPLORER}/program/${DISPUTE_PROGRAM}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs flex items-center gap-1.5 whitespace-nowrap"
            >
              View Contract <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        {/* Status */}
        {loading ? (
          <div className="card text-center py-12">
            <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 text-sm mt-3">Loading dispute state...</p>
          </div>
        ) : notFound ? (
          <div className="card">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5" />
              <div>
                <h3 className="text-white font-semibold mb-1">No dispute filed yet</h3>
                <p className="text-gray-400 text-sm">
                  This auction has no active dispute. You can file one if the settlement was incorrect.
                </p>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-surface-900/60 border border-surface-800">
              <h4 className="text-white text-sm font-semibold mb-2">File a dispute</h4>
              <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                <li>Post a <strong className="text-amber-400">5+ ALEO bond</strong> (private credits record).</li>
                <li>Three independent jurors stake <strong className="text-amber-400">1+ ALEO each</strong> and commit votes.</li>
                <li>After an 8-hour voting + 4-hour reveal window, quorum resolves.</li>
                <li>Correct jurors split losing bonds + 5% treasury. Wrong jurors are slashed.</li>
              </ol>
              <Link
                to={`/auction/${id}`}
                className="btn-primary mt-4 inline-flex items-center gap-2 text-sm"
              >
                Back to auction
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : state && statusInfo ? (
          <>
            {/* Current status */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-surface-900 border border-surface-700 flex items-center justify-center">
                  <StatusIcon className={`w-5 h-5 ${statusInfo.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
                  <h3 className={`font-semibold ${statusInfo.color}`}>{statusInfo.name}</h3>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-800">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Bond pool</p>
                  <p className="text-white font-mono text-sm">{microToAleo(state.bond_pool)} ALEO</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-800">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Jurors staked</p>
                  <p className="text-white font-mono text-sm">{state.jurors_staked} / 3</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-800">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Votes revealed</p>
                  <p className="text-white font-mono text-sm">{state.votes_revealed} / {state.jurors_staked}</p>
                </div>
                <div className="p-3 rounded-lg bg-surface-900/60 border border-surface-800">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Tally</p>
                  <p className="text-white font-mono text-sm">
                    <span className="text-emerald-400">{state.votes_upheld}</span> ·{' '}
                    <span className="text-red-400">{state.votes_rejected}</span>
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Actions panel */}
            <div className="card">
              <h4 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-accent-400" />
                How to participate
              </h4>
              <div className="space-y-3 text-xs text-gray-400 leading-relaxed">
                {state.status === 1 && (
                  <>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                      <p>
                        <strong className="text-white">Become a juror</strong> — stake ≥1 ALEO in slot 0, 1, or 2 and commit your vote (upheld / rejected). Use Shield Wallet to sign <code className="text-accent-400 bg-surface-800 px-1 rounded">juror_stake</code>.
                      </p>
                    </div>
                    <p className="text-[10px] text-gray-600 italic">Voting window closes at block {state.voting_ends}. Open slots: {3 - state.jurors_staked}.</p>
                  </>
                )}
                {state.status === 3 && (
                  <>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-cyan/20 text-brand-cyan flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                      <p>
                        <strong className="text-white">Reveal your vote</strong> — jurors call <code className="text-accent-400 bg-surface-800 px-1 rounded">juror_reveal</code> opening the commitment with their nonce.
                      </p>
                    </div>
                    <p className="text-[10px] text-gray-600 italic">Reveal window closes at block {state.reveal_ends}.</p>
                  </>
                )}
                {(state.status === 4 || state.status === 5) && (
                  <>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                      <p>
                        <strong className="text-white">Quorum resolved.</strong> Correct jurors (voted {state.status === 4 ? 'UPHELD' : 'REJECTED'}) can claim their reward via <code className="text-accent-400 bg-surface-800 px-1 rounded">juror_claim</code>. Wrong jurors are slashed.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Privacy note */}
            <div className="card bg-accent-500/5 border-accent-500/20">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-accent-400 mt-0.5" />
                <div className="text-xs text-gray-300 leading-relaxed">
                  <p className="text-white font-semibold mb-1">Privacy in dispute resolution</p>
                  <p>
                    Disputer identity is hashed (BHP256), never plaintext. Juror votes are committed via BHP256
                    until the reveal phase. Bond payouts use private credit records — receivers not visible on-chain.
                    First auction protocol on Aleo with decentralized dispute economics.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
