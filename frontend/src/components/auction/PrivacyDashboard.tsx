import { Shield, Lock, Eye, EyeOff, Hash, Globe } from 'lucide-react'
import { STATUS } from '@/types'

interface PrivacyDashboardProps {
  status: number
  auctionMode: number
}

interface PrivacyItem {
  label: string
  icon: typeof Lock
  getState: (status: number) => { level: 'private' | 'public' | 'hashed'; text: string }
}

const privacyItems: PrivacyItem[] = [
  {
    label: 'Bid Amounts',
    icon: Lock,
    getState: (s) => {
      if (s === STATUS.ACTIVE || s === STATUS.CLOSED)
        return { level: 'private', text: 'SEALED — encrypted in Aleo records' }
      if (s === STATUS.REVEALING)
        return { level: 'public', text: 'REVEALING — amounts disclosed on reveal' }
      return { level: 'public', text: 'PUBLIC — revealed during settlement' }
    },
  },
  {
    label: 'Bidder Identity',
    icon: EyeOff,
    getState: () => ({ level: 'private', text: 'HIDDEN — never stored on-chain' }),
  },
  {
    label: 'Reserve Price',
    icon: Hash,
    getState: (s) => {
      if (s === STATUS.SETTLED)
        return { level: 'public', text: 'DISCLOSED — revealed at settlement' }
      return { level: 'hashed', text: 'BHP256 HASH — plaintext never on-chain' }
    },
  },
  {
    label: 'Seller Address',
    icon: EyeOff,
    getState: () => ({ level: 'hashed', text: 'BHP256 HASH — only hash stored' }),
  },
  {
    label: 'Winner',
    icon: Eye,
    getState: (s) => {
      if (s === STATUS.SETTLED)
        return { level: 'public', text: 'REVEALED — winner hash published' }
      return { level: 'private', text: 'HIDDEN — unknown until settlement' }
    },
  },
  {
    label: 'Escrow Balance',
    icon: Globe,
    getState: (s) => {
      if (s === STATUS.ACTIVE || s === STATUS.CLOSED)
        return { level: 'private', text: 'NONE — no tokens locked during bidding' }
      return { level: 'public', text: 'PUBLIC — required for on-chain settlement' }
    },
  },
]

const phaseExplainers: Record<number, string> = {
  [STATUS.ACTIVE]: 'All bid amounts are encrypted in Aleo records. Zero information leakage during sealed bidding phase.',
  [STATUS.CLOSED]: 'Bidding is closed. Bids remain sealed until the reveal phase begins.',
  [STATUS.REVEALING]: 'Bidders are revealing their bids. Amounts become public when revealed — this is intentional and required for fair settlement.',
  [STATUS.SETTLED]: 'Auction settled. Winner determined. Settlement and payment proofs are verifiable on-chain.',
  [STATUS.FAILED]: 'Auction failed — insufficient revealed bids or reserve not met. All escrowed funds are refundable.',
  [STATUS.CANCELLED]: 'Auction was cancelled before settlement.',
  [STATUS.EXPIRED]: 'Auction expired with no valid bids.',
}

export default function PrivacyDashboard({ status, auctionMode }: PrivacyDashboardProps) {
  const explainer = phaseExplainers[status] || 'Auction state unknown.'
  const privateCount = privacyItems.filter(i => i.getState(status).level === 'private').length
  const hashedCount = privacyItems.filter(i => i.getState(status).level === 'hashed').length

  return (
    <div className="card border-accent-500/20 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-green-500 via-accent-500 to-brand-cyan" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Privacy Dashboard</h3>
            <p className="text-[10px] text-gray-600">Real-time privacy status for this auction</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-green-400 font-medium bg-green-500/10 px-2 py-0.5 rounded-full">
            {privateCount + hashedCount}/{privacyItems.length} private
          </span>
        </div>
      </div>

      {/* Privacy items grid */}
      <div className="space-y-2 mb-4">
        {privacyItems.map((item) => {
          const state = item.getState(status)
          const Icon = item.icon
          return (
            <div key={item.label} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-lg bg-surface-800/60">
              <Icon className={`w-3.5 h-3.5 shrink-0 ${
                state.level === 'private' ? 'text-green-400' :
                state.level === 'hashed' ? 'text-amber-400' :
                'text-gray-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{item.label}</p>
              </div>
              {/* Privacy bar */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <div className={`h-1.5 w-10 sm:w-16 rounded-full overflow-hidden ${
                  state.level === 'private' ? 'bg-green-500/20' :
                  state.level === 'hashed' ? 'bg-amber-500/20' :
                  'bg-gray-500/20'
                }`}>
                  <div className={`h-full rounded-full ${
                    state.level === 'private' ? 'bg-green-400 w-full' :
                    state.level === 'hashed' ? 'bg-amber-400 w-3/4' :
                    'bg-gray-400 w-1/4'
                  }`} />
                </div>
                <span className={`text-[10px] font-medium whitespace-nowrap ${
                  state.level === 'private' ? 'text-green-400' :
                  state.level === 'hashed' ? 'text-amber-400' :
                  'text-gray-500'
                }`}>
                  {state.level === 'private' ? 'Private' : state.level === 'hashed' ? 'Hashed' : 'Public'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Phase explainer */}
      <div className="p-3 rounded-lg bg-accent-500/5 border border-accent-500/10">
        <p className="text-xs text-gray-400 leading-relaxed">
          <span className="text-accent-400 font-medium">Current Phase: </span>
          {explainer}
        </p>
      </div>
    </div>
  )
}
