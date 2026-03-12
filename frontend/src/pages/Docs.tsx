import { useState } from 'react'
import { Shield, Lock, Eye, Scale, Award, ArrowDownLeft, AlertTriangle, BookOpen, Layers, Zap, ArrowRight, Wallet, Gavel, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Docs() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-accent-400" />
          Documentation
        </h1>
        <p className="text-gray-400">
          Technical documentation for the Obscura Auction protocol on Aleo.
        </p>
      </div>

      {/* Quick Start Guide */}
      <div className="glass-card p-6 mb-10 glow-sm">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent-400" />
          Quick Start
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { num: 1, icon: Wallet, title: 'Connect Wallet', desc: 'Install an Aleo wallet (Shield, Leo, Puzzle, Fox, or Soter) and connect to Testnet', link: null },
            { num: 2, icon: Gavel, title: 'Create Auction', desc: 'Set item, reserve price, mode, and duration', link: '/create' },
            { num: 3, icon: Lock, title: 'Place a Bid', desc: 'Browse auctions and place a sealed bid', link: '/browse' },
          ].map((step) => (
            <div key={step.num} className="flex items-start gap-3 p-3 rounded-lg bg-surface-800/60">
              <span className="w-7 h-7 rounded-full bg-accent-500/20 text-accent-400 text-xs font-bold flex items-center justify-center shrink-0">
                {step.num}
              </span>
              <div>
                <p className="text-sm font-medium text-white">{step.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
                {step.link && (
                  <Link to={step.link} className="text-[10px] text-accent-400 hover:text-accent-300 mt-1 inline-flex items-center gap-1">
                    Try it now <ArrowRight className="w-2.5 h-2.5" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        <NavCard href="#privacy" icon={Shield} label="Privacy Model" />
        <NavCard href="#architecture" icon={Layers} label="Architecture" />
        <NavCard href="#how-to-use" icon={BookOpen} label="How to Use" />
        <NavCard href="#faq" icon={AlertTriangle} label="FAQ" />
      </div>

      {/* Privacy Model */}
      <Section id="privacy" title="Privacy Model" icon={Shield}>
        <p className="text-gray-400 text-sm mb-4">
          Obscura uses Aleo's programmable privacy to ensure that sensitive auction data stays
          confidential. The table below shows exactly what is public on-chain vs what stays private.
        </p>

        <div className="overflow-x-auto rounded-xl border border-surface-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-800/80">
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Data</th>
                <th className="text-center py-3 px-4 text-green-400 font-medium">Private</th>
                <th className="text-center py-3 px-4 text-yellow-400 font-medium">Public</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <PrivacyRow data="Bid Amount" isPrivate notes="Stored in encrypted SealedBid record" />
              <PrivacyRow data="Bidder Identity" isPrivate notes="Only bidder_hash on-chain (no address)" />
              <PrivacyRow data="Reserve Price" isPrivate notes="Hashed on-chain; seller proves at settlement" />
              <PrivacyRow data="Item Title/Description" isPrivate notes="Stored off-chain encrypted only" />
              <PrivacyRow data="Bid Nonce" isPrivate notes="Random field for commitment binding" />
              <PrivacyRow data="Auction ID" isPrivate={false} notes="Public mapping key" />
              <PrivacyRow data="Status" isPrivate={false} notes="Needed for state machine transitions" />
              <PrivacyRow data="Bid Count" isPrivate={false} notes="Public counter (no amounts)" />
              <PrivacyRow data="Deadline" isPrivate={false} notes="Block height for timing" />
              <PrivacyRow data="Winning Bid (post-settle)" isPrivate={false} notes="Only after finalization" />
            </tbody>
          </table>
        </div>
      </Section>

      {/* Architecture */}
      <Section id="architecture" title="Architecture" icon={Layers}>
        <p className="text-gray-400 text-sm mb-4">
          The protocol is a single Leo program (obscura_v3.aleo) with 17 transitions including constructor,
          forming an 8-state machine. All sensitive operations happen off-chain in ZK circuits.
        </p>

        {/* Visual State Machine */}
        <div className="bg-surface-800/60 rounded-xl p-5 mb-6 border border-surface-700 overflow-x-auto">
          <div className="min-w-[500px]">
            {/* Main flow */}
            <div className="flex items-center gap-3 mb-4">
              <StateNode label="ACTIVE" color="green" active />
              <StateArrow label="close_bidding" />
              <StateNode label="REVEALING" color="amber" />
              <StateArrow label="finalize_auction" />
              <div className="flex flex-col gap-2">
                <StateNode label="SETTLED" color="blue" />
                <StateNode label="FAILED" color="red" />
              </div>
            </div>
            {/* Branch paths */}
            <div className="flex items-center gap-3 ml-0">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600 w-28 text-right">cancel (0 bids) →</span>
                  <StateNode label="CANCELLED" color="gray" small />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600 w-28 text-right">no bids expire →</span>
                  <StateNode label="EXPIRED" color="gray" small />
                </div>
              </div>
              <div className="ml-auto flex flex-col gap-2 text-right">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-blue-400">claim_win →</span>
                  <span className="text-[10px] text-gray-500 bg-surface-700 px-2 py-0.5 rounded">Winner + Seller paid</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-red-400">claim_refund →</span>
                  <span className="text-[10px] text-gray-500 bg-surface-700 px-2 py-0.5 rounded">Escrow returned</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-accent-400" />
          Record Lifecycle
        </h4>
        <div className="space-y-3 text-sm text-gray-400">
          <RecordDoc
            name="SealedBid"
            desc="Created when bidder calls place_bid. Contains encrypted bid amount and nonce. Consumed during reveal_bid when tokens are escrowed."
            color="accent"
          />
          <RecordDoc
            name="EscrowReceipt"
            desc="Created alongside SealedBid. Proves tokens are locked in escrow. Consumed during claim_refund or claim_win."
            color="green"
          />
          <RecordDoc
            name="WinnerCertificate"
            desc="Created when winner calls claim_win. Proof of ownership for the auctioned item."
            color="yellow"
          />
          <RecordDoc
            name="SellerReceipt"
            desc="Created during claim_win. Proves the seller received payment minus fees."
            color="cyan"
          />
        </div>
      </Section>

      {/* How to Use */}
      <Section id="how-to-use" title="How to Use" icon={BookOpen}>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
              <Scale className="w-4 h-4 text-accent-400" />
              For Sellers
            </h4>
            <div className="space-y-3 text-sm text-gray-400">
              <Step n={1} icon={Scale} text="Navigate to Create Auction. Set item title, category, reserve price, auction mode (First-Price or Vickrey), and duration." />
              <Step n={2} icon={Eye} text="Wait for the bidding period to end. The auction automatically moves to the reveal phase." />
              <Step n={3} icon={Lock} text="After reveal deadline passes, call Finalize Auction. Re-enter your reserve price to prove you know it." />
              <Step n={4} icon={Award} text="If the highest bid meets your reserve, the auction settles. The winner will claim and you receive a SellerReceipt with payment." />
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4 text-accent-400" />
              For Bidders
            </h4>
            <div className="space-y-3 text-sm text-gray-400">
              <Step n={1} icon={Lock} text="Browse active auctions and place a sealed bid. Your bid amount is encrypted in an Aleo record. Tokens are escrowed on-chain." />
              <Step n={2} icon={Eye} text="When the reveal phase starts, reveal your bid by submitting your SealedBid record. Unrevealed bids cannot win." />
              <Step n={3} icon={Award} text="If you win: call Claim Win with the seller's address. You receive a WinnerCertificate and the seller receives payment (minus 1% platform fee)." />
              <Step n={4} icon={ArrowDownLeft} text="If you lose: claim your escrowed tokens back via Claim Refund. If you never revealed, no tokens were escrowed — nothing to reclaim." />
            </div>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" title="FAQ" icon={AlertTriangle}>
        <div className="space-y-3">
          <FAQ
            q="What happens if I forget to reveal my bid?"
            a="Unrevealed bids cannot win the auction. In the current architecture, tokens are only escrowed at reveal time — so if you never reveal, no tokens were locked and no refund is needed."
          />
          <FAQ
            q="Can the seller see my bid before the reveal phase?"
            a="No. Bid amounts are stored as encrypted Aleo records. Only the bidder holds the decryption key. The on-chain mapping only tracks bid count and commitment hashes."
          />
          <FAQ
            q="How does the Vickrey auction work?"
            a="In Vickrey mode, the winner pays the second-highest bid, not their own. The protocol tracks second_highest_bids on-chain. At claim time, the winner calls claim_win_vickrey, receives a refund of (their_bid - second_price), and the seller receives second_price minus 1% fee. This is game-theoretically optimal — bidders are incentivized to bid their true valuation."
          />
          <FAQ
            q="What tokens can I use?"
            a="The protocol supports both ALEO Credits (credits.aleo) and USDCx stablecoin (test_usdcx_stablecoin.aleo). ALEO uses private record transfers for maximum privacy. USDCx uses public balance transfers (transfer_public_as_signer for deposit, transfer_public for payouts). The token type is chosen at auction creation time."
          />
          <FAQ
            q="What is the platform fee?"
            a="1% of the winning bid is collected as a platform fee. This is deducted from the seller's payout during the claim_win transition."
          />
          <FAQ
            q="What happens if nobody reveals their bid?"
            a="If no bids are revealed before the reveal deadline, the seller can call finalize_auction which sets the status to FAILED. Since tokens are only escrowed at reveal time, unrevealed bidders have no locked funds to reclaim."
          />
          <FAQ
            q="How does anti-sniping work?"
            a="If a bid is placed within the last ~10 minutes (40 blocks) of the deadline, the deadline automatically extends by another ~10 minutes. This prevents last-second 'sniping' where a bidder places a winning bid with no time for competitors to respond. The extension is enforced on-chain in the finalize block."
          />
          <FAQ
            q="Can the winner steal their escrow back after winning?"
            a="No. The claim_refund transition computes a BidCommitment hash from the EscrowReceipt and checks that it does NOT match the auction_winners entry. If you are the winner, the refund is cryptographically blocked. This was a critical bug (double-spend) that was identified and fixed."
          />
          <FAQ
            q="Is this the first Vickrey auction on Aleo?"
            a="Yes. Obscura is the first implementation of a Vickrey (second-price tracking) sealed-bid auction on the Aleo blockchain. The second_highest_bids mapping tracks the runner-up bid on-chain, which is a novel use of Aleo's public mapping system alongside private records."
          />
          <FAQ
            q="Which wallet should I use?"
            a="Obscura supports Shield, Leo, Puzzle, Fox, and Soter wallets. Shield Wallet (recommended) supports delegated proving for faster transactions. All wallets support auto-decryption of records on Aleo Testnet."
          />
        </div>
      </Section>
    </div>
  )
}

function NavCard({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <a
      href={href}
      className="card-hover flex items-center gap-2 p-3 group"
    >
      <Icon className="w-4 h-4 text-accent-400" />
      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{label}</span>
    </a>
  )
}

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <h2 className="text-xl font-bold text-white mb-5 flex items-center gap-2 border-b border-surface-800 pb-3">
        <Icon className="w-5 h-5 text-accent-400" />
        {title}
      </h2>
      {children}
    </section>
  )
}

function PrivacyRow({
  data,
  isPrivate,
  notes,
}: {
  data: string
  isPrivate: boolean
  notes: string
}) {
  return (
    <tr className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
      <td className="py-2.5 px-4 text-gray-300 font-medium">{data}</td>
      <td className="py-2.5 px-4 text-center">
        {isPrivate && <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400" />}
      </td>
      <td className="py-2.5 px-4 text-center">
        {!isPrivate && <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />}
      </td>
      <td className="py-2.5 px-4 text-gray-500 text-xs">{notes}</td>
    </tr>
  )
}

function RecordDoc({
  name,
  desc,
  color,
}: {
  name: string
  desc: string
  color: string
}) {
  const colorMap: Record<string, string> = {
    accent: 'border-accent-500/30 bg-accent-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    cyan: 'border-cyan-500/30 bg-cyan-500/5',
  }
  const textMap: Record<string, string> = {
    accent: 'text-accent-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    cyan: 'text-cyan-400',
  }

  return (
    <div className={`rounded-lg border p-3 ${colorMap[color] || ''}`}>
      <span className={`font-mono font-semibold text-sm ${textMap[color] || 'text-white'}`}>{name}</span>
      <span className="text-gray-400 ml-2">{desc}</span>
    </div>
  )
}

function Step({
  n,
  icon: Icon,
  text,
}: {
  n: number
  icon: React.ComponentType<{ className?: string }>
  text: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-6 h-6 rounded-full bg-accent-500/20 text-accent-400 text-xs font-bold flex items-center justify-center">
          {n}
        </span>
        <Icon className="w-3.5 h-3.5 text-gray-500" />
      </div>
      <span>{text}</span>
    </div>
  )
}

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card cursor-pointer" onClick={() => setOpen(!open)}>
      <div className="flex items-center justify-between">
        <h4 className="text-white font-medium text-sm">{q}</h4>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && (
        <p className="text-gray-400 text-sm leading-relaxed mt-3 pt-3 border-t border-surface-800">{a}</p>
      )}
    </div>
  )
}

function StateNode({ label, color, active, small }: { label: string; color: string; active?: boolean; small?: boolean }) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
    gray: 'bg-surface-700/50 text-gray-500 border-surface-600/50',
  }
  return (
    <div className={`${small ? 'px-2.5 py-1' : 'px-3 py-1.5'} rounded-lg border font-mono text-xs font-medium ${colorMap[color] || colorMap.gray} ${active ? 'ring-1 ring-green-400/30' : ''}`}>
      {label}
    </div>
  )
}

function StateArrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <span className="text-[9px] text-gray-600 whitespace-nowrap">{label}</span>
      <div className="w-12 h-px bg-surface-600 relative">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[4px] border-l-surface-600 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent" />
      </div>
    </div>
  )
}
