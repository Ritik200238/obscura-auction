import { Shield, Lock, Eye, Scale, Award, ArrowDownLeft, AlertTriangle, BookOpen, Layers, Zap } from 'lucide-react'

export default function Docs() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <BookOpen className="w-7 h-7 text-accent-400" />
          Documentation
        </h1>
        <p className="text-gray-400">
          Technical documentation for the Obscura Auction protocol on Aleo.
        </p>
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
          The protocol is a single Leo program (obscura_auction.aleo) with 10 transitions including constructor,
          forming an 8-state machine. All sensitive operations happen off-chain in ZK circuits.
        </p>

        <div className="bg-surface-800 rounded-xl p-5 font-mono text-xs text-gray-400 mb-6 overflow-x-auto border border-surface-700">
          <pre className="leading-relaxed">{`State Machine:

  ACTIVE ──[close_bidding]──> REVEALING
    |                              |
    |── [cancel] ──> CANCELLED   [reveal_bid] x N
    |                              |
    |── [no bids] ──> EXPIRED   [finalize_auction]
                                   |
                              ┌────┴────┐
                              |         |
                           SETTLED   FAILED
                              |         |
                        [claim_win]  [claim_refund]`}</pre>
        </div>

        <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-accent-400" />
          Record Lifecycle
        </h4>
        <div className="space-y-3 text-sm text-gray-400">
          <RecordDoc
            name="SealedBid"
            desc="Created when bidder calls place_bid. Contains encrypted bid amount and nonce. Consumed during reveal_bid or claim_unrevealed_refund."
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
              <Step n={4} icon={ArrowDownLeft} text="If you lose: claim your escrowed tokens back via Claim Refund. If you forgot to reveal, use Claim Unrevealed Refund." />
            </div>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" title="FAQ" icon={AlertTriangle}>
        <div className="space-y-3">
          <FAQ
            q="What happens if I forget to reveal my bid?"
            a="Unrevealed bids cannot win the auction. You can still reclaim your escrowed tokens using the claim_unrevealed_refund transition, which requires both your SealedBid and EscrowReceipt records."
          />
          <FAQ
            q="Can the seller see my bid before the reveal phase?"
            a="No. Bid amounts are stored as encrypted Aleo records. Only the bidder holds the decryption key. The on-chain mapping only tracks bid count and commitment hashes."
          />
          <FAQ
            q="How does the Vickrey auction work?"
            a="In Vickrey mode, the protocol tracks the second-highest bid on-chain for transparency and future mechanism upgrades. The highest bidder wins and pays their full bid amount. The second-highest bid value is recorded publicly after finalization, enabling auction analytics and price discovery."
          />
          <FAQ
            q="What tokens can I use?"
            a="The protocol uses Aleo Credits (credits.aleo) for all bids, escrow, and payouts. Deposits use transfer_private_to_public (your private credits go to program escrow). Payouts use transfer_public_to_private (you receive private credits back — no public trace)."
          />
          <FAQ
            q="What is the platform fee?"
            a="1% of the winning bid is collected as a platform fee. This is deducted from the seller's payout during the claim_win transition."
          />
          <FAQ
            q="What happens if nobody reveals their bid?"
            a="If no bids are revealed before the reveal deadline, the seller can call finalize_auction which sets the status to FAILED. All bidders can then claim unrevealed refunds using their SealedBid and EscrowReceipt records."
          />
          <FAQ
            q="Which wallet should I use?"
            a="Shield Wallet (by Provable/Aleo) is the required wallet adapter. It supports delegated proving for faster transaction processing and auto-decryption of records."
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
  return (
    <div className="card">
      <h4 className="text-white font-medium text-sm mb-2">{q}</h4>
      <p className="text-gray-400 text-sm leading-relaxed">{a}</p>
    </div>
  )
}
