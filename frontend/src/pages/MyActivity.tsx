import { useState, useEffect } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { useRecords } from '@/hooks/useRecords'
import { Loader2, RefreshCw, Wallet, Lock, Receipt, Award, AlertCircle, ArrowUpRight, Shield } from 'lucide-react'
import { formatAleoAmount, truncateId, shortenAddress } from '@/lib/aleo'
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
        <div className="card text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-6">
            <Wallet className="w-8 h-8 text-gray-600" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Connect your Shield Wallet to view your auction activity, sealed bids, escrow receipts, and winner certificates.
          </p>
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">My Activity</h1>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">
              <span className="font-mono text-accent-400">{shortenAddress(publicKey || '')}</span>
            </span>
            <span className="text-gray-700">|</span>
            <span className="text-sm text-gray-500">{totalRecords} record{totalRecords !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-6">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-surface-900 rounded-xl border border-surface-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-surface-800 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
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
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-accent-400 animate-spin mb-4" />
          <p className="text-gray-400">Decrypting your records...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTab === 'bids' && sealedBids.map((bid, i) => (
            <Link
              key={i}
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
                    <p className="text-sm text-white font-semibold">{formatAleoAmount(bid.bid_amount)} ALEO</p>
                    <p className="text-xs text-gray-500">Encrypted</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover:text-accent-400 transition-colors" />
                </div>
              </div>
            </Link>
          ))}

          {activeTab === 'escrow' && escrowReceipts.map((receipt, i) => (
            <Link
              key={i}
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
                    <p className="text-sm text-green-400 font-semibold">{formatAleoAmount(receipt.escrowed_amount)} ALEO</p>
                    <p className="text-xs text-gray-500">Locked</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover:text-accent-400 transition-colors" />
                </div>
              </div>
            </Link>
          ))}

          {activeTab === 'certificates' && winnerCerts.map((cert, i) => (
            <Link
              key={i}
              to={`/auction/${cert.auction_id}`}
              className="card-hover block group"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium group-hover:text-accent-400 transition-colors">
                      Winner Certificate
                    </p>
                    <p className="text-xs text-gray-500 font-mono">{truncateId(cert.auction_id, 10)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-yellow-400 font-semibold">{formatAleoAmount(cert.winning_amount)} ALEO</p>
                    <p className="text-xs text-gray-500">Won</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover:text-accent-400 transition-colors" />
                </div>
              </div>
            </Link>
          ))}

          {/* Empty state */}
          {((activeTab === 'bids' && sealedBids.length === 0) ||
            (activeTab === 'escrow' && escrowReceipts.length === 0) ||
            (activeTab === 'certificates' && winnerCerts.length === 0)) && (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-xl bg-surface-800 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-5 h-5 text-gray-600" />
              </div>
              <p className="text-gray-500 text-sm mb-1">No records found</p>
              <p className="text-gray-600 text-xs">
                {activeTab === 'bids' && 'Place a sealed bid on an auction to see it here.'}
                {activeTab === 'escrow' && 'Escrow receipts appear when you place a bid.'}
                {activeTab === 'certificates' && 'Win an auction and claim to receive a certificate.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
