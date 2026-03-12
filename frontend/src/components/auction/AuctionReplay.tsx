import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock, Unlock, Crown, Award, Coins, FileCheck,
  RotateCcw, Play, X, Eye, ShieldCheck,
} from 'lucide-react'
import type { AuctionData } from '@/types'
import { AUCTION_MODE } from '@/types'

export interface ReplayBid {
  label: string
  amount: number
}

interface AuctionReplayProps {
  auction: AuctionData
  bids?: ReplayBid[]
  onClose?: () => void
  autoPlay?: boolean
}

// Unsorted so the sort animation in frame 3 is visible
const DEMO_BIDS: ReplayBid[] = [
  { label: 'Bid #1', amount: 75 },
  { label: 'Bid #2', amount: 100 },
  { label: 'Bid #3', amount: 50 },
]

const NODES = ['Created', 'Active', 'Sealed', 'Revealing', 'Revealed', 'Settling', 'Settled', 'Claimed']
const TOTAL_MS = 12000
const FRAME_STATE_MAP = [1, 3, 5, 6, 7] as const
const EASE = [0.22, 1, 0.36, 1] as const

export default function AuctionReplay({ auction, bids, onClose, autoPlay }: AuctionReplayProps) {
  const [frame, setFrame] = useState(-1)
  const [progress, setProgress] = useState(0)
  const [bidCounter, setBidCounter] = useState(0)
  const timers = useRef<number[]>([])
  const rafId = useRef(0)
  const t0 = useRef(0)

  const activeBids = bids?.length ? bids : DEMO_BIDS
  const isVickrey = auction.auction_mode === AUCTION_MODE.VICKREY
  const token = auction.token_type === 2 ? 'USDCx' : 'ALEO'
  const title = auction.title || 'Private Auction'
  const sorted = [...activeBids].sort((a, b) => b.amount - a.amount)
  const winAmount = sorted[0]?.amount ?? 0
  const secondAmount = sorted[1]?.amount ?? winAmount
  const payPrice = isVickrey ? secondAmount : winAmount
  const savings = winAmount - payPrice

  // Original order for frames 1-2, sorted order for frame 3
  const bidsToRender = frame >= 3 ? sorted : activeBids

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    cancelAnimationFrame(rafId.current)
  }, [])

  const play = useCallback(() => {
    clear()
    setFrame(0)
    setProgress(0)
    setBidCounter(0)
    t0.current = Date.now()
    timers.current = [
      window.setTimeout(() => setFrame(1), 2000),
      window.setTimeout(() => setFrame(2), 5000),
      window.setTimeout(() => setFrame(3), 8000),
      window.setTimeout(() => setFrame(4), 10000),
    ]
    const tick = () => {
      const p = Math.min((Date.now() - t0.current) / TOTAL_MS, 1)
      setProgress(p)
      if (p < 1) rafId.current = requestAnimationFrame(tick)
    }
    rafId.current = requestAnimationFrame(tick)
  }, [clear])

  const replay = useCallback(() => {
    clear()
    setFrame(-1)
    setProgress(0)
    setBidCounter(0)
    window.setTimeout(play, 150)
  }, [clear, play])

  // Cleanup on unmount
  useEffect(() => clear, [clear])

  // Auto-play on mount
  useEffect(() => {
    if (autoPlay) play()
  }, [autoPlay, play])

  // Typewriter for title (fires once when replay starts)
  const isPlaying = frame >= 0
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (!isPlaying) { setTyped(''); return }
    let i = 0
    const iv = setInterval(() => {
      i++
      setTyped(title.slice(0, i))
      if (i >= title.length) clearInterval(iv)
    }, 60)
    return () => clearInterval(iv)
  }, [isPlaying, title])

  // Scrambled reserve text (only during frame 0)
  const [scramble, setScramble] = useState('')
  useEffect(() => {
    if (frame !== 0) return
    const chars = '█▓░▒■□◆◇●○'
    const tick = () =>
      setScramble(Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''))
    tick()
    const iv = setInterval(tick, 100)
    return () => clearInterval(iv)
  }, [frame])

  // Animated bid counter — increments as each bid flies in during frame 1
  useEffect(() => {
    if (frame !== 1) { setBidCounter(0); return }
    const t = activeBids.map((_, i) =>
      window.setTimeout(() => setBidCounter(i + 1), i * 700 + 400)
    )
    return () => t.forEach(clearTimeout)
  }, [frame, activeBids])

  const stateIdx = frame < 0 ? -1 : (FRAME_STATE_MAP[frame] ?? 7)

  // ── Pre-play idle state ──────────────────────
  if (frame === -1) {
    return (
      <div className="glass-card p-6 max-w-3xl mx-auto">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent-500/20 flex items-center justify-center mx-auto mb-4">
            <Play className="w-7 h-7 text-accent-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Auction Replay</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
            Watch a 12-second animated replay of this auction's lifecycle — from sealed bidding through Vickrey settlement.
          </p>
          <button onClick={play} className="btn-primary inline-flex items-center gap-2">
            <Play className="w-4 h-4" />
            Watch Replay
          </button>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="glass-card relative overflow-hidden max-w-3xl mx-auto"
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent-500 via-brand-cyan to-accent-500" />

      {onClose && (
        <button
          onClick={() => { clear(); onClose() }}
          className="absolute top-4 right-4 z-10 text-gray-500 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="p-6">
        {/* ── Mini state machine ─────────────────── */}
        <div className="flex items-center justify-between mb-6">
          {NODES.map((label, i) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <motion.div
                  animate={{
                    backgroundColor:
                      stateIdx > i ? 'rgb(168, 85, 247)' :
                      stateIdx === i ? 'rgb(34, 211, 238)' :
                      'rgb(55, 55, 70)',
                  }}
                  transition={{ duration: 0.4 }}
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center"
                  style={
                    stateIdx === i
                      ? { boxShadow: '0 0 12px rgba(34, 211, 238, 0.5)' }
                      : stateIdx > i
                      ? { boxShadow: '0 0 6px rgba(168, 85, 247, 0.3)' }
                      : undefined
                  }
                >
                  {stateIdx > i && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  {stateIdx === i && (
                    <motion.div
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-white"
                    />
                  )}
                </motion.div>
                <span
                  className={`text-[8px] sm:text-[9px] mt-1 font-medium hidden sm:block ${
                    stateIdx > i ? 'text-purple-300' :
                    stateIdx === i ? 'text-cyan-400' :
                    'text-gray-600'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < NODES.length - 1 && (
                <div className="flex-1 mx-0.5 sm:mx-1 h-0.5 rounded-full bg-surface-700 overflow-hidden">
                  {stateIdx > i && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.4 }}
                      className="h-full bg-purple-500/60 rounded-full"
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Frame content ──────────────────────── */}
        <div className="min-h-[300px]">
          <AnimatePresence mode="wait">
            {/* ─── Frame 0: Creation ─── */}
            {frame === 0 && (
              <motion.div
                key="f-creation"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.8, ease: EASE }}
                  className="bg-surface-800/60 border border-surface-700/50 rounded-xl p-5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-green-400 font-medium tracking-wider">NEW AUCTION</span>
                  </div>
                  <h4 className="text-xl font-bold text-white mb-3 min-h-[28px]">
                    {typed}
                    <motion.span
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="text-accent-400"
                    >
                      |
                    </motion.span>
                  </h4>
                  <div className="flex items-center gap-2 text-sm mb-4">
                    <Lock className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-gray-500">Reserve:</span>
                    <span className="font-mono text-accent-400/60 text-xs tracking-wider">{scramble}</span>
                  </div>
                  <p className="text-xs text-gray-600 italic">
                    Auction deployed on-chain — all parameters committed via ZK hash
                  </p>
                </motion.div>
              </motion.div>
            )}

            {/* ─── Frames 1-3: Persistent bid lifecycle ─── */}
            {/* Bids persist across sealed→reveal→sort — same DOM elements transform in place */}
            {frame >= 1 && frame <= 3 && (
              <motion.div
                key="f-bids"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-3"
              >
                {bidsToRender.map((bid, i) => {
                  const originalIdx = activeBids.findIndex(b => b.label === bid.label)
                  const isRevealed = frame >= 2
                  const isSettling = frame >= 3
                  const isWinner = isSettling && i === 0
                  const isSecond = isSettling && i === 1 && isVickrey

                  return (
                    <motion.div
                      key={bid.label}
                      layout
                      initial={{ x: 300, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{
                        x: { delay: originalIdx * 0.7, duration: 0.5, ease: EASE },
                        opacity: { delay: originalIdx * 0.7, duration: 0.5 },
                        layout: { type: 'spring', bounce: 0.2, duration: 0.6 },
                      }}
                      className={`flex items-center gap-3 rounded-lg p-3 relative overflow-hidden transition-colors duration-500 ${
                        isWinner
                          ? 'bg-accent-500/10 border border-accent-500/30'
                          : isSecond
                          ? 'bg-cyan-500/10 border border-cyan-500/20'
                          : isRevealed
                          ? 'bg-surface-800/40 border border-cyan-500/20'
                          : 'bg-surface-800/40 border border-accent-500/20'
                      }`}
                      style={!isSettling ? { boxShadow: '0 0 20px rgba(139, 92, 246, 0.08)' } : undefined}
                    >
                      {/* Flash sweep — fires once when frame enters 2 */}
                      {frame === 2 && (
                        <motion.div
                          initial={{ x: '-100%' }}
                          animate={{ x: '300%' }}
                          transition={{ delay: originalIdx * 0.9, duration: 0.6 }}
                          className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent pointer-events-none"
                        />
                      )}

                      {/* Icon — Lock → Unlock transition */}
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-500 ${
                          isRevealed ? 'bg-cyan-500/20' : 'bg-accent-500/20'
                        }`}
                      >
                        {isRevealed ? (
                          <Unlock className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <Lock className="w-4 h-4 text-accent-400" />
                        )}
                      </div>

                      {/* Bid content — encrypted → revealed → settlement */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white font-medium">{bid.label}:</span>
                        {isRevealed ? (
                          <>
                            <motion.span
                              initial={{ opacity: 0, filter: 'blur(8px)' }}
                              animate={{ opacity: 1, filter: 'blur(0px)' }}
                              transition={{
                                delay: frame === 2 ? originalIdx * 0.9 + 0.2 : 0,
                                duration: 0.4,
                              }}
                              className={`text-sm font-mono font-bold ml-2 ${
                                isWinner && isVickrey
                                  ? 'line-through text-gray-500'
                                  : isWinner
                                  ? 'text-accent-400'
                                  : isSettling
                                  ? 'text-gray-400'
                                  : 'text-cyan-400'
                              }`}
                            >
                              {bid.amount} {token}
                            </motion.span>
                            {isWinner && isVickrey && (
                              <motion.span
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.8, duration: 0.3 }}
                                className="text-sm text-accent-400 font-mono font-bold ml-1"
                              >
                                → {payPrice} {token}
                              </motion.span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-gray-600 font-mono ml-2">████████</span>
                        )}
                      </div>

                      {/* Tags & badges */}
                      <div className="shrink-0">
                        {!isRevealed && (
                          <span className="text-[10px] text-accent-400/50 font-medium">SEALED</span>
                        )}
                        {isRevealed && !isSettling && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: frame === 2 ? originalIdx * 0.9 + 0.3 : 0 }}
                            className="text-[10px] text-cyan-400/60 font-medium flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            REVEALED
                          </motion.span>
                        )}
                        {isWinner && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.5, type: 'spring', bounce: 0.5 }}
                            className="flex items-center gap-1 text-xs font-bold text-accent-400"
                          >
                            <Crown className="w-3.5 h-3.5" />
                            WINNER
                          </motion.span>
                        )}
                        {isSecond && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.7, type: 'spring', bounce: 0.5 }}
                            className="flex items-center gap-1 text-xs font-bold text-cyan-400"
                          >
                            <Award className="w-3.5 h-3.5" />
                            2ND PRICE
                          </motion.span>
                        )}
                      </div>
                    </motion.div>
                  )
                })}

                {/* Animated counter — ticks up as each bid flies in */}
                {frame === 1 && bidCounter > 0 && (
                  <motion.p
                    key={`counter-${bidCounter}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-gray-500 text-center pt-2"
                  >
                    {bidCounter} sealed bid{bidCounter !== 1 ? 's' : ''} received — amounts encrypted on-chain
                  </motion.p>
                )}

                {/* Vickrey savings callout */}
                {frame === 3 && isVickrey && savings > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1 }}
                    className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center"
                  >
                    <p className="text-sm text-green-400">
                      Winner pays{' '}
                      <span className="font-bold font-mono">
                        {payPrice} {token}
                      </span>{' '}
                      — saved{' '}
                      <span className="font-bold font-mono">
                        {savings} {token}
                      </span>{' '}
                      through Vickrey mechanism
                    </p>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* ─── Frame 4: Complete ─── */}
            {frame === 4 && (
              <motion.div
                key="f-complete"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="space-y-4"
              >
                {/* Coin flow — winner to auction */}
                <div className="flex items-center justify-center py-3">
                  <span className="text-[10px] text-gray-600 mr-3">Winner</span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20, scale: 0.5 }}
                        animate={{
                          opacity: [0, 1, 1, 0.8],
                          x: [-20, i * 16, i * 24, i * 28],
                          scale: [0.5, 1, 1, 0.9],
                        }}
                        transition={{ delay: i * 0.1, duration: 0.7, ease: 'easeOut' }}
                        className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-500 to-purple-400 flex items-center justify-center"
                        style={{ boxShadow: '0 0 16px rgba(139, 92, 246, 0.3)' }}
                      >
                        <Coins className="w-3 h-3 text-white" />
                      </motion.div>
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-600 ml-3">Auction</span>
                </div>

                {/* Winner certificate */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, type: 'spring', bounce: 0.3 }}
                  className="bg-accent-500/10 border border-accent-500/30 rounded-xl p-4 text-center"
                >
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <FileCheck className="w-5 h-5 text-accent-400" />
                    <span className="text-sm font-bold text-accent-300">WinnerCertificate</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Private record issued to winner — proves ownership without revealing identity
                  </p>
                </motion.div>

                {/* Privacy note */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="flex items-center justify-center gap-2 text-xs text-green-400/80"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Settled via zero-address finalize — no addresses exposed on-chain</span>
                </motion.div>

                {/* Replay */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="text-center pt-2"
                >
                  <button onClick={replay} className="btn-secondary inline-flex items-center gap-2 text-sm">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Replay
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Progress bar ────────────────────────── */}
        <div className="mt-6">
          <div className="h-1 bg-surface-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-500 to-brand-cyan rounded-full"
              style={{ width: `${progress * 100}%`, transition: 'none' }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[9px] text-gray-600 px-1">
            <span>Create</span>
            <span>Sealed</span>
            <span>Reveal</span>
            <span>Settle</span>
            <span>Complete</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
