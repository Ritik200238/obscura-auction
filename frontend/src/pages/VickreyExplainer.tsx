import { useState, useEffect, type Dispatch, type SetStateAction, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, ChevronLeft, RotateCcw, Lock, Eye, Shield, AlertTriangle, Sparkles } from 'lucide-react'

// ── Types ─────────────────────────────────────

interface BidderInfo {
  name: string
  initial: string
  color: string
  trueValue: number
  bid: number
}

interface GameState {
  userTrueValue: number
  aiBidders: BidderInfo[]
  userBid: string
  phase: 'bidding' | 'sealed' | 'revealed'
}

// ── Helpers ───────────────────────────────────

const STEPS = ['The Problem', 'Vickrey Solution', 'Privacy Layer', 'Try It Yourself']

const stepAnim = {
  enter: (d: number) => ({ opacity: 0, x: d > 0 ? 60 : -60 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
  exit: (d: number) => ({ opacity: 0, x: d > 0 ? -60 : 60, transition: { duration: 0.2 } }),
}

function newGame(): GameState {
  const aiBidders: BidderInfo[] = [
    { name: 'Alice', initial: 'A', color: '#0891b2', trueValue: 0, bid: 0 },
    { name: 'Bob', initial: 'B', color: '#06b6d4', trueValue: 0, bid: 0 },
  ].map(b => {
    const tv = Math.floor(Math.random() * 51) + 45
    return { ...b, trueValue: tv, bid: tv }
  })
  return { userTrueValue: Math.floor(Math.random() * 51) + 60, aiBidders, userBid: '', phase: 'bidding' }
}

function Avatar({ initial, color, size = 48 }: { initial: string; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0 mx-auto"
      style={{ width: size, height: size, backgroundColor: color + '22', border: `2px solid ${color}` }}
    >
      {initial}
    </div>
  )
}

function SpeechBubble({ children }: { children: ReactNode }) {
  return (
    <div className="relative mt-3 p-2.5 rounded-lg bg-surface-900/80 border border-surface-700/40">
      <div className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-surface-900/80 border-l border-t border-surface-700/40" />
      <p className="text-xs text-gray-400 italic relative z-10">{children}</p>
    </div>
  )
}

function EnvelopeSVG({ sealed, size = 56 }: { sealed: boolean; size?: number }) {
  const s = sealed
  return (
    <svg viewBox="0 0 64 48" width={size} height={size * 0.75} fill="none" className="mx-auto">
      <rect x="2" y="14" width="60" height="32" rx="4"
        fill={s ? '#0891b211' : '#ef444411'}
        stroke={s ? '#0891b2' : '#ef4444'}
        strokeWidth="2"
      />
      {s ? (
        <>
          <path d="M2 18L32 34L62 18" stroke="#0891b2" strokeWidth="2" fill="#0891b222" />
          <circle cx="32" cy="30" r="7" fill="#0891b2" stroke="#0e7490" strokeWidth="1.5" />
          <path d="M28.5 30L31 32.5L35.5 27" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M2 14L32 2L62 14" stroke="#ef4444" strokeWidth="2" fill="#ef444418" />
          <rect x="14" y="5" width="36" height="22" rx="2" fill="#081320" stroke="#6b7280" strokeWidth="1" />
          <line x1="20" y1="13" x2="44" y2="13" stroke="#9ca3af" strokeWidth="1.5" />
          <line x1="20" y1="19" x2="36" y2="19" stroke="#9ca3af" strokeWidth="1.5" />
        </>
      )}
    </svg>
  )
}

// ── Step 1: The Problem ───────────────────────

function Step1() {
  const bidders = [
    { name: 'Alice', init: 'A', col: '#0891b2', tv: 100, bid: 80, quote: "I'll bid 80 to leave room for profit..." },
    { name: 'Bob', init: 'B', col: '#06b6d4', tv: 75, bid: 60, quote: "Don't want to overpay. 60 should win..." },
    { name: 'Charlie', init: 'C', col: '#f59e0b', tv: 50, bid: 40, quote: "I'll go low at 40, maybe get lucky..." },
  ]

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">The Problem with Regular Auctions</h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          In first-price auctions, rational bidders bid <span className="text-red-400 font-semibold">below</span> their
          true value to save money. This distorts prices for everyone.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {bidders.map((b, i) => (
          <motion.div
            key={b.name}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="glass rounded-2xl border border-surface-700/50 p-5 text-center"
          >
            <Avatar initial={b.init} color={b.col} />
            <p className="text-white font-semibold mt-3">{b.name}</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">True value</span>
                <span className="text-white font-mono">{b.tv} ALEO</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Bids</span>
                <span className="text-red-400 font-mono">{b.bid} ALEO</span>
              </div>
            </div>
            <SpeechBubble>{b.quote}</SpeechBubble>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass rounded-2xl border border-red-500/30 p-5 text-center"
      >
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-sm font-semibold mb-3">
          <AlertTriangle className="w-3.5 h-3.5" />
          INEFFICIENT
        </span>
        <p className="text-white">
          Alice wins, pays <span className="font-mono font-bold">80 ALEO</span> — but the item was worth{' '}
          <span className="font-mono font-bold">100</span> to her.
        </p>
        <p className="text-gray-400 text-sm mt-1">
          Seller gets 80 instead of a fair market price. Strategic underbidding distorts the entire market.
        </p>
      </motion.div>
    </div>
  )
}

// ── Step 2: Vickrey (animated) ────────────────

function Step2() {
  const [phase, setPhase] = useState<'enter' | 'sort' | 'settle'>('enter')

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('sort'), 1500),
      setTimeout(() => setPhase('settle'), 2800),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const bidders = [
    { name: 'Alice', init: 'A', col: '#0891b2', bid: 100 },
    { name: 'Bob', init: 'B', col: '#06b6d4', bid: 75 },
    { name: 'Charlie', init: 'C', col: '#f59e0b', bid: 50 },
  ]

  // Scrambled for entry, sorted for sort/settle
  const scrambled = [bidders[1], bidders[2], bidders[0]]
  const sorted = [...bidders].sort((a, b) => b.bid - a.bid)
  const displayOrder = phase === 'enter' ? scrambled : sorted

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Vickrey Changes Everything</h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          Highest bidder wins but pays the{' '}
          <span className="text-green-400 font-semibold">second-highest</span> bid.
          The dominant strategy? Bid your <span className="text-accent-400 font-semibold">true value</span>.
        </p>
      </div>

      {/* Animated bid ranking list */}
      <div className="max-w-md mx-auto space-y-2">
        <p className="text-xs text-gray-600 uppercase tracking-wider text-center mb-3">
          {phase === 'enter' ? 'Bids arriving...' : phase === 'sort' ? 'Ranking by amount...' : 'Settlement'}
        </p>
        {displayOrder.map((b, i) => (
          <motion.div
            key={b.name}
            layout
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              layout: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { delay: phase === 'enter' ? i * 0.3 : 0, duration: 0.4 },
              x: { delay: phase === 'enter' ? i * 0.3 : 0, duration: 0.4 },
            }}
            className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors duration-300 ${
              phase === 'settle' && i === 0
                ? 'border-green-500/40 bg-green-500/5'
                : 'border-surface-700/50 bg-surface-900/60'
            }`}
          >
            <div className="flex items-center gap-3">
              {phase !== 'enter' && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    i === 0 ? 'bg-green-500/20 text-green-400' : 'bg-surface-800 text-gray-500'
                  }`}
                >
                  #{i + 1}
                </motion.span>
              )}
              <Avatar initial={b.init} color={b.col} size={32} />
              <span className="text-white font-medium text-sm">{b.name}</span>
              {phase === 'settle' && i === 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, type: 'spring' }}
                  className="text-[10px] font-bold text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full"
                >
                  WINNER
                </motion.span>
              )}
            </div>
            <span className="font-mono text-white text-sm font-semibold">{b.bid} ALEO</span>
          </motion.div>
        ))}
      </div>

      {/* Price strikethrough animation */}
      <AnimatePresence>
        {phase === 'settle' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-2xl border border-green-500/30 p-6 text-center"
          >
            <p className="text-white text-lg mb-3">
              Alice bid{' '}
              <span className="relative inline-block font-mono text-lg mx-1">
                100
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                  className="absolute left-0 right-0 top-1/2 h-0.5 bg-red-400 origin-left"
                />
              </span>
              {' '}&rarr; pays{' '}
              <motion.span
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.9, type: 'spring', stiffness: 200, damping: 15 }}
                className="text-green-400 font-mono font-bold text-2xl mx-1"
              >
                75
              </motion.span>
              {' '}ALEO
            </p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
            >
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-sm font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                Saved 25 ALEO — second-price rule
              </span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="text-gray-400 text-sm mt-4"
            >
              Truthful bidding is the <span className="text-white font-semibold">dominant strategy</span> — proved by
              Nobel laureate William Vickrey (1961). No gamesmanship needed.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Step 3: Privacy ───────────────────────────

function Step3() {
  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">But Privacy Makes It Work</h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          Without privacy, Vickrey auctions are vulnerable to strategic manipulation.
          With <span className="text-accent-400 font-semibold">Obscura</span>, bids are sealed with BHP256 commitments.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Without privacy */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl border border-red-500/30 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-5 h-5 text-red-400" />
            <h3 className="text-lg font-semibold text-red-400">Without Privacy</h3>
          </div>

          <div className="flex justify-center mb-4">
            <EnvelopeSVG sealed={false} size={72} />
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-surface-900/60 border border-surface-700/30">
              <p className="text-sm text-gray-300">Bob bids <span className="font-mono text-white font-semibold">75 ALEO</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Visible to everyone</p>
            </div>
            <div className="flex justify-center">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
              <p className="text-sm text-red-300">
                Alice sees Bob's bid and bids <span className="font-mono font-bold">76 ALEO</span> instead of 100
              </p>
              <p className="text-xs text-red-400/60 mt-0.5">Back to strategic manipulation</p>
            </div>
          </div>
          <p className="text-xs text-red-400/80 mt-4 text-center font-medium">
            Transparent bids destroy truthful bidding incentive
          </p>
        </motion.div>

        {/* With privacy */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl border border-green-500/30 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-semibold text-green-400">With Obscura</h3>
          </div>

          <div className="flex justify-center mb-4">
            <EnvelopeSVG sealed={true} size={72} />
          </div>

          <div className="space-y-3">
            {['Alice', 'Bob', 'Charlie'].map((name, i) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.12 }}
                className="p-3 rounded-xl bg-surface-900/60 border border-accent-500/20 flex items-center gap-3"
              >
                <Lock className="w-4 h-4 text-accent-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-300">{name}'s bid</p>
                  <p className="text-xs font-mono text-accent-400/60 truncate">bhp256(commit) = 0x7a3f...e91d</p>
                </div>
              </motion.div>
            ))}
          </div>
          <p className="text-xs text-green-400/80 mt-4 text-center font-medium">
            Sealed commitments — nobody can see or react to bids
          </p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass rounded-2xl border border-accent-500/30 p-5 text-center"
      >
        <p className="text-white font-semibold">
          Privacy + Vickrey = the only way to guarantee fair pricing
        </p>
        <p className="text-gray-400 text-sm mt-1">
          Obscura uses Aleo's zero-knowledge proofs so bids are verifiable but invisible until the reveal phase.
        </p>
      </motion.div>
    </div>
  )
}

// ── Step 4: Mini-Game ─────────────────────────

function Step4({ game, setGame, resetGame }: {
  game: GameState
  setGame: Dispatch<SetStateAction<GameState>>
  resetGame: () => void
}) {
  const userBidNum = parseInt(game.userBid) || 0

  const sealBid = () => {
    if (userBidNum <= 0) return
    setGame(g => ({ ...g, phase: 'sealed' }))
  }

  const revealAll = () => {
    setGame(g => ({ ...g, phase: 'revealed' }))
  }

  // Settlement
  const allBids = game.phase === 'revealed'
    ? [
        { name: 'You', bid: userBidNum },
        ...game.aiBidders.map(a => ({ name: a.name, bid: a.bid })),
      ].sort((a, b) => b.bid - a.bid)
    : []

  const winner = allBids[0]
  const secondPrice = allBids[1]?.bid ?? 0
  const isUserWinner = winner?.name === 'You'
  const userSavings = isUserWinner ? userBidNum - secondPrice : 0

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Try It Yourself</h2>
        <p className="text-gray-400 max-w-lg mx-auto">
          You're bidding on a <span className="text-accent-400">rare NFT</span>. Your true value is shown below —
          bid whatever you like and see how Vickrey settles it.
        </p>
      </div>

      {/* Your true value */}
      <div className="glass rounded-2xl border border-accent-500/30 p-4 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Your True Value for This NFT</p>
        <p className="text-3xl font-bold text-accent-400 font-mono">{game.userTrueValue} ALEO</p>
        <p className="text-xs text-gray-500 mt-1">This is the most you'd be happy paying</p>
      </div>

      {/* Bidders */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {/* You */}
        <div className={`glass rounded-2xl border p-4 text-center ${
          game.phase === 'revealed' && isUserWinner ? 'border-green-500/40' : 'border-surface-700/50'
        }`}>
          <Avatar initial="Y" color="#22c55e" />
          <p className="text-white font-semibold mt-2 text-sm">You</p>
          {game.phase === 'bidding' ? (
            <div className="mt-3 space-y-2">
              <input
                type="range"
                min={1}
                max={Math.round(game.userTrueValue * 1.5)}
                value={userBidNum || game.userTrueValue}
                onChange={e => setGame(g => ({ ...g, userBid: e.target.value }))}
                className="w-full h-1.5 rounded-full appearance-none bg-surface-700 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-500 [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <input
                type="number"
                value={game.userBid}
                onChange={e => setGame(g => ({ ...g, userBid: e.target.value }))}
                placeholder="Your bid"
                min={1}
                className="input-field w-full text-center text-sm font-mono"
              />
            </div>
          ) : game.phase === 'sealed' ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mt-3"
            >
              <EnvelopeSVG sealed={true} size={48} />
              <p className="text-xs text-accent-400 mt-1.5">Sealed</p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mt-3"
            >
              <p className="text-lg font-mono font-bold text-white">{userBidNum} ALEO</p>
              {isUserWinner && (
                <p className="text-xs text-green-400 font-semibold mt-1">
                  Pays {secondPrice} (saves {userSavings})
                </p>
              )}
            </motion.div>
          )}
        </div>

        {/* AI Bidders */}
        {game.aiBidders.map((ai, idx) => {
          const isWinner = game.phase === 'revealed' && winner?.name === ai.name
          return (
            <div key={ai.name} className={`glass rounded-2xl border p-4 text-center ${
              isWinner ? 'border-green-500/40' : 'border-surface-700/50'
            }`}>
              <Avatar initial={ai.initial} color={ai.color} />
              <p className="text-white font-semibold mt-2 text-sm">{ai.name}</p>
              {game.phase === 'bidding' ? (
                <div className="mt-3 p-3 rounded-xl bg-surface-800/60">
                  <p className="text-lg font-mono text-gray-600">???</p>
                </div>
              ) : game.phase === 'sealed' ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 * (idx + 1) }}
                  className="mt-3"
                >
                  <EnvelopeSVG sealed={true} size={48} />
                  <p className="text-xs text-accent-400 mt-1.5">Sealed</p>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ delay: 0.15 * (idx + 1), duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-3"
                >
                  <p className="text-lg font-mono font-bold text-white">{ai.bid} ALEO</p>
                  {isWinner && (
                    <p className="text-xs text-green-400 font-semibold mt-1">
                      Pays {secondPrice} (saves {ai.bid - secondPrice})
                    </p>
                  )}
                </motion.div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        {game.phase === 'bidding' && (
          <button onClick={sealBid} disabled={userBidNum <= 0} className="btn-primary flex items-center gap-2 disabled:opacity-40">
            <Lock className="w-4 h-4" />
            Seal Bid
          </button>
        )}
        {game.phase === 'sealed' && (
          <button onClick={revealAll} className="btn-primary flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Reveal All
          </button>
        )}
        {game.phase === 'revealed' && (
          <button onClick={resetGame} className="btn-primary flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
        )}
      </div>

      {/* Result */}
      <AnimatePresence>
        {game.phase === 'revealed' && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className={`glass rounded-2xl border p-5 text-center ${
              isUserWinner ? 'border-green-500/30' : 'border-amber-500/30'
            }`}
          >
            {isUserWinner ? (
              <>
                <p className="text-xl font-bold text-green-400 mb-2">You won!</p>
                <p className="text-white">
                  You bid{' '}
                  <span className="relative inline-block font-mono font-bold mx-0.5">
                    {userBidNum}
                    <motion.span
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: 0.3, duration: 0.3 }}
                      className="absolute left-0 right-0 top-1/2 h-0.5 bg-red-400 origin-left"
                    />
                  </span>
                  {' '}ALEO but only pay{' '}
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6, type: 'spring' }}
                    className="font-mono font-bold text-green-400 text-lg"
                  >
                    {secondPrice}
                  </motion.span>
                  {' '}ALEO.
                </p>
                {userSavings > 0 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9 }}
                    className="text-green-400 font-semibold mt-2"
                  >
                    You saved {userSavings} ALEO through Vickrey's second-price rule!
                  </motion.p>
                )}
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-amber-400 mb-2">You didn't win this time</p>
                <p className="text-white">
                  {winner?.name} bid <span className="font-mono font-bold">{winner?.bid}</span> ALEO and paid{' '}
                  <span className="font-mono font-bold text-green-400">{secondPrice}</span> ALEO.
                </p>
                <p className="text-gray-400 text-sm mt-1">Try bidding higher or play again with new values!</p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main ──────────────────────────────────────

export default function VickreyExplainer() {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [game, setGame] = useState(newGame)

  const goTo = (s: number) => {
    if (s < 0 || s > 3) return
    setDir(s > step ? 1 : -1)
    setStep(s)
  }

  const resetGame = () => setGame(newGame())

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Step indicators */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => goTo(i)}
            className={`flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl text-xs sm:text-sm transition-all ${
              i === step ? 'bg-accent-500/20 text-accent-400 font-medium'
              : i < step ? 'text-green-400 hover:bg-surface-800/40'
              : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold ${
              i === step ? 'bg-accent-500 text-white'
              : i < step ? 'bg-green-500/20 text-green-400'
              : 'bg-surface-800 text-gray-600'
            }`}>
              {i < step ? '\u2713' : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={step} custom={dir} variants={stepAnim} initial="enter" animate="center" exit="exit">
          {step === 0 && <Step1 />}
          {step === 1 && <Step2 />}
          {step === 2 && <Step3 />}
          {step === 3 && <Step4 game={game} setGame={setGame} resetGame={resetGame} />}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-8 pt-6 border-t border-surface-800">
        <button
          onClick={() => goTo(step - 1)}
          disabled={step === 0}
          className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        {step < 3 ? (
          <button onClick={() => goTo(step + 1)} className="btn-primary flex items-center gap-2 text-sm">
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={resetGame} className="btn-primary flex items-center gap-2 text-sm">
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
        )}
      </div>
    </div>
  )
}
