import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, AlertTriangle, ShieldCheck, ExternalLink } from 'lucide-react'
import { AUCTION_MODE, STATUS } from '@/types'

interface PublicComparisonProps {
  bidCount: number
  auctionMode: number
  highestBid?: number
  status: number
}

/** Generate a deterministic-looking fake ETH address from an index */
function fakeEthAddress(index: number): string {
  const seeds = [
    '7a3b', '9e1d', '4c8f', '2d6a', 'b5e3', 'f1c7', '8a4d', '3f9b',
    'c6e2', 'd7a1', 'e8b4', '5f2c', 'a3d9', '6b7e', '1c4f', '9d8a',
  ]
  const suffixes = [
    '4f2c', '8a5b', '1e3d', '7c9f', '2b6a', 'f4d8', '5a1c', '3e7b',
    '9f2d', '6c8a', 'b1e5', '4d7f', 'a2c6', '8e3b', '1f9d', '7a4c',
  ]
  const s = seeds[index % seeds.length]
  const e = suffixes[(index + 3) % suffixes.length]
  return `0x${s}...${e}`
}

/** Generate a fake bid amount near a range */
function fakeBidAmount(index: number, highest: number): string {
  const base = highest > 0 ? highest : 1000000
  const variance = [0.85, 0.92, 0.78, 1.05, 0.95, 0.88, 0.71, 0.99]
  const amount = base * variance[index % variance.length]
  // Format as a readable number
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)} ALEO`
  }
  return `${(amount / 1000000).toFixed(6)} ALEO`
}

const MODE_LABELS: Record<number, string> = {
  [AUCTION_MODE.FIRST_PRICE]: 'Sealed-Bid',
  [AUCTION_MODE.VICKREY]: 'Vickrey',
  [AUCTION_MODE.DUTCH]: 'Dutch',
  [AUCTION_MODE.ENGLISH]: 'English',
}

export default function PublicComparison({
  bidCount,
  auctionMode,
  highestBid = 0,
  status,
}: PublicComparisonProps) {
  const [showPublic, setShowPublic] = useState(false)

  const bidders = useMemo(() => {
    const count = Math.max(bidCount, 3) // Show at least 3 for impact
    return Array.from({ length: count }, (_, i) => ({
      address: fakeEthAddress(i),
      amount: fakeBidAmount(i, highestBid),
      ens: i === 0 ? 'alice.eth' : i === 1 ? 'trader42.eth' : null,
    }))
  }, [bidCount, highestBid])

  const modeLabel = MODE_LABELS[auctionMode] || 'Auction'
  const isActive = status === STATUS.ACTIVE
  const isSettled = status === STATUS.SETTLED

  return (
    <div className="rounded-xl overflow-hidden">
      {/* Toggle */}
      <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 backdrop-blur-sm rounded-t-xl">
        <div className="flex items-center gap-2">
          {showPublic ? (
            <Eye className="w-4 h-4 text-red-400" />
          ) : (
            <EyeOff className="w-4 h-4 text-accent-400" />
          )}
          <span className="text-sm font-medium text-white">
            {showPublic ? 'If this was on Ethereum...' : 'Privacy comparison'}
          </span>
        </div>

        {/* Toggle switch */}
        <button
          onClick={() => setShowPublic(!showPublic)}
          className="relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none min-h-[44px] min-w-[56px]"
          style={{
            backgroundColor: showPublic ? 'rgba(239, 68, 68, 0.3)' : 'rgba(6, 182, 212, 0.3)',
          }}
          aria-label={showPublic ? 'Show Obscura privacy view' : 'Show Ethereum public view'}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full transition-transform duration-300 ${
              showPublic ? 'translate-x-8 bg-red-400' : 'translate-x-1 bg-accent-400'
            }`}
          />
          <span className="sr-only">
            {showPublic ? 'Switch to Obscura view' : 'Switch to Ethereum view'}
          </span>
        </button>
      </div>

      {/* Content area */}
      <AnimatePresence mode="wait">
        {showPublic ? (
          <motion.div
            key="public"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="border border-red-500/20 border-t-0 rounded-b-xl bg-red-900/10 p-4 space-y-4"
          >
            {/* Warning banner */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300 leading-relaxed">
                On public blockchains, <span className="font-semibold">all this data is permanently visible</span> to anyone with an explorer.
              </p>
            </div>

            {/* Exposed data table */}
            <div className="space-y-2">
              <p className="text-[10px] text-red-400/80 uppercase tracking-wider font-medium">Exposed Bid Data</p>
              <div className="bg-black/30 rounded-lg p-3 space-y-2 font-mono text-xs">
                {bidders.map((bidder, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 border-b border-red-500/10 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-red-400/60 text-[10px] w-4">#{i + 1}</span>
                      <span className="text-red-300">{bidder.address}</span>
                      {bidder.ens && (
                        <span className="text-orange-400/80 text-[10px]">({bidder.ens})</span>
                      )}
                    </div>
                    <span className="text-red-200">{bidder.amount}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* MEV & surveillance warnings */}
            <div className="space-y-2">
              <p className="text-[10px] text-red-400/80 uppercase tracking-wider font-medium">Attack Vectors</p>
              <div className="space-y-1.5">
                <WarningLine text="MEV Bot detected: front-ran Bidder #3 by 2 blocks" />
                <WarningLine text={`All ${bidders.length} bidder addresses visible on Etherscan`} />
                {isSettled && (
                  <WarningLine text={`Winner identity: ${bidders[0].address} (linked to ENS: ${bidders[0].ens || 'unknown'})`} />
                )}
                <WarningLine text="Bid amounts leaked to competing bidders in real-time" />
                <WarningLine text="Transaction history reveals bidding strategy across auctions" />
              </div>
            </div>

            {/* Etherscan mockup footer */}
            <div className="flex items-center gap-2 pt-2 border-t border-red-500/10">
              <ExternalLink className="w-3 h-3 text-red-400/50" />
              <span className="text-[10px] text-red-400/50">
                etherscan.io/address/{bidders[0]?.address} — all transactions publicly indexed
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="private"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="border border-accent-500/20 border-t-0 rounded-b-xl bg-accent-900/5 p-4 space-y-4"
          >
            {/* Privacy badge */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-accent-500/10 border border-accent-500/20">
              <ShieldCheck className="w-4 h-4 text-accent-400 mt-0.5 shrink-0" />
              <p className="text-xs text-accent-300 leading-relaxed">
                Zero data leaked. Powered by Aleo ZK proofs.
              </p>
            </div>

            {/* Privacy summary */}
            <div className="bg-black/20 rounded-lg p-3 space-y-2.5">
              <PrivacyLine label="Sealed bids" value={`${bidCount} encrypted bids`} />
              <PrivacyLine label="Bid amounts" value="All amounts encrypted on-chain" />
              <PrivacyLine label="Bidder identities" value="Hidden behind ZK hashes" />
              <PrivacyLine
                label="Winner"
                value={isSettled ? 'Revealed only to seller (privately)' : 'Not determined yet'}
              />
              <PrivacyLine label="Auction type" value={`${modeLabel} format`} />
              <PrivacyLine label="MEV protection" value="Impossible on Aleo" />
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 pt-2 border-t border-accent-500/10">
              <ShieldCheck className="w-3 h-3 text-accent-400/50" />
              <span className="text-[10px] text-accent-400/50">
                obscura_core_v4.aleo — all bids sealed with encrypted commitments
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function WarningLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-red-500 text-xs mt-0.5 shrink-0">!</span>
      <span className="text-xs text-red-300/80 leading-relaxed">{text}</span>
    </div>
  )
}

function PrivacyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-white/5 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs text-accent-300 text-right">{value}</span>
    </div>
  )
}
