import { useState, useEffect } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useRecords } from '@/hooks/useRecords'
import { motion } from 'framer-motion'
import { staggerContainer, fadeInUp } from '@/lib/animations'
import { Loader2, RefreshCw, Wallet, Lock, Receipt, Award, AlertCircle, ArrowUpRight, Search } from 'lucide-react'
import { formatAleoAmount, truncateId, shortenAddress, formatTokenAmount } from '@/lib/aleo'
import { TOKEN_TYPE } from '@/types'
import { ShimmerRow } from '@/components/shared/Shimmer'
import { Link } from 'react-router-dom'

export default function MyActivity() {
  const { connected, address: publicKey } = useWallet()
  const { refresh, sealedBids, escrowReceipts, winnerCerts, loading, error } = useRecords()
  const [activeTab, setActiveTab] = useState<'bids' | 'escrow' | 'certificates'>('bids')

  useEffect(() => {
    if (connected) {
      refresh()
    }
  }, [connected, refresh])

  if (!connected) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="card text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500/20 to-accent-600/10 flex items-center justify-center mx-auto mb-6">
            <Wallet className="w-8 h-8 text-accent-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-8">
            Connect your wallet to view your auction activity, sealed bids, escrow receipts, and winner certificates.
          </p>

          {/* What you'll see preview */}
          <div className="max-w-sm mx-auto">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-3">What you'll see</p>
            <div className="space-y-2">
              {[
                { icon: Lock, label: 'Sealed Bids', desc: 'Your encrypted bids across all auctions', color: 'text-accent-400' },
                { icon: Receipt, label: 'Escrow Receipts', desc: 'Funds locked during bid reveals', color: 'text-green-400' },
                { icon: Award, label: 'Winner Certificates', desc: 'Proof of won auctions', color: 'text-yellow-400' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-surface-800/60 text-left">
                  <item.icon className={`w-4 h-4 ${item.color} shrink-0`} />
                  <div>
                    <p className="text-xs text-white font-medium">{item.label}</p>
                    <p className="text-[10px] text-gray-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'bids' as const, label: 'Sealed Bids', icon: Lock, count: sealedBids.length },
    { id: 'escrow' as const, label: 'Escrow Receipts', icon: Receipt, count: escrowReceipts.length },
    { id: 'certificates' as const, label: 'Certificates', icon: Award, count: winnerCerts.length },
  ]

  const totalRecords = sealedBids.length + escrowReceipts.length + winnerCerts.length

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Dashboard Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2">My Activity</h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <Wallet className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                <span className="font-mono text-sm text-accent-400 truncate">{shortenAddress(publicKey || '')}</span>
              </div>
              <span className="text-surface-600">·</span>
              <span className="text-sm text-gray-500 shrink-0">{totalRecords} record{totalRecords !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <button onClick={refresh} disabled={loading} className="btn-secondary text-sm flex items-center gap-2 w-full sm:w-auto justify-center">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card py-3 px-4 text-center">
            <p className="text-2xl font-bold text-white font-mono">{sealedBids.length}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Active Bids</p>
          </div>
          <div className="card py-3 px-4 text-center">
            <p className="text-2xl font-bold text-green-400 font-mono">{escrowReceipts.length}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Escrowed</p>
          </div>
          <div className="card py-3 px-4 text-center">
            <p className="text-2xl font-bold text-yellow-400 font-mono">{winnerCerts.length}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Wins</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-6">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-surface-900 rounded-xl border border-surface-800 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex-1 justify-center whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-surface-800 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id
                  ? 'bg-accent-500/20 text-accent-400'
                  : 'bg-surface-800 text-gray-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <ShimmerRow key={i} />
          ))}
        </div>
      ) : (
        <motion.div
          className="space-y-3"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {activeTab === 'bids' && sealedBids.map((bid, i) => (
            <motion.div key={i} variants={fadeInUp}>
            <Link
              to={`/auction/${bid.auction_id}`}
              className="card-hover block group"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-accent-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium group-hover:text-accent-400 transition-colors">
                      Sealed Bid
                    </p>
                    <p className="text-xs text-gray-500 font-mono">{truncateId(bid.auction_id, 10)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-white font-semibold">{formatTokenAmount(bid.bid_amount, bid.token_type)}</p>
                    <p className="text-xs text-gray-500">Encrypted</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover:text-accent-400 transition-colors" />
                </div>
              </div>
            </Link>
            </motion.div>
          ))}

          {activeTab === 'escrow' && escrowReceipts.map((receipt, i) => (
            <motion.div key={i} variants={fadeInUp}>
            <Link
              to={`/auction/${receipt.auction_id}`}
              className="card-hover block group"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium group-hover:text-accent-400 transition-colors">
                      Escrow Receipt
                    </p>
                    <p className="text-xs text-gray-500 font-mono">{truncateId(receipt.auction_id, 10)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-green-400 font-semibold">{formatTokenAmount(receipt.escrowed_amount, receipt.token_type)}</p>
                    <p className="text-xs text-gray-500">Locked</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover:text-accent-400 transition-colors" />
                </div>
              </div>
            </Link>
            </motion.div>
          ))}

          {activeTab === 'certificates' && winnerCerts.map((cert, i) => (
            <motion.div key={i} variants={fadeInUp}>
            <Link
              to={`/auction/${cert.auction_id}`}
              className="card-hover block group border-yellow-500/20 hover:border-yellow-500/40"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-500/10 flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white font-medium group-hover:text-yellow-400 transition-colors">
                        Winner Certificate
                      </p>
                      <span className="text-[9px] font-bold text-yellow-400 bg-yellow-500/20 px-1.5 py-0.5 rounded-full">
                        WON
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono">{truncateId(cert.auction_id, 10)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-yellow-400 font-semibold">{formatTokenAmount(cert.winning_amount, cert.token_type)}</p>
                    <p className="text-xs text-gray-500">Winning Amount</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover:text-yellow-400 transition-colors" />
                </div>
              </div>
            </Link>
            </motion.div>
          ))}

          {/* Empty states — unique per tab */}
          {activeTab === 'bids' && sealedBids.length === 0 && (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-xl bg-accent-500/10 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-accent-400" />
              </div>
              <h3 className="text-white font-semibold mb-1">No Sealed Bids Yet</h3>
              <p className="text-gray-500 text-sm mb-4 max-w-xs mx-auto">
                Browse active auctions and place your first sealed bid. Your bid amount stays completely private until you choose to reveal.
              </p>
              <Link to="/browse" className="btn-primary text-sm inline-flex items-center gap-2">
                <Search className="w-3.5 h-3.5" />
                Browse Auctions
              </Link>
            </div>
          )}

          {activeTab === 'escrow' && escrowReceipts.length === 0 && (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <Receipt className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-white font-semibold mb-1">No Escrowed Funds</h3>
              <p className="text-gray-500 text-sm max-w-xs mx-auto">
                Escrow receipts are created when you reveal a bid. Your tokens are locked until the auction settles — then you can claim a refund if you didn't win.
              </p>
            </div>
          )}

          {activeTab === 'certificates' && winnerCerts.length === 0 && (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
                <Award className="w-6 h-6 text-yellow-400" />
              </div>
              <h3 className="text-white font-semibold mb-1">No Winner Certificates</h3>
              <p className="text-gray-500 text-sm max-w-xs mx-auto">
                Win an auction to earn your first certificate! In Vickrey mode, you pay the second-highest bid — game-theoretically optimal.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
