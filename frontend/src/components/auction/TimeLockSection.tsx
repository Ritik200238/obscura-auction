import { useState, useEffect } from 'react'
import { Lock, Unlock, Loader2 } from 'lucide-react'
import { fetchMapping, blockHeightToTime, formatAleoAmount } from '@/lib/aleo'
import { useBlockHeight } from '@/contexts/BlockHeightContext'
import { useTransaction } from '@/hooks/useTransaction'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import TransactionProgress from '@/components/shared/TransactionProgress'

interface TimeLockSectionProps {
  auctionId: string
}

export default function TimeLockSection({ auctionId }: TimeLockSectionProps) {
  const { blockHeight } = useBlockHeight()
  const { connected } = useWallet()
  const { execute, loading, error, txId, status: txStatus, reset } = useTransaction()
  const [revealBlock, setRevealBlock] = useState<number | null>(null)
  const [revealedPrice, setRevealedPrice] = useState<bigint | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!auctionId) return
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`

    Promise.all([
      fetchMapping('result_reveal_block', key),
      fetchMapping('revealed_results', key),
    ]).then(([blockRaw, priceRaw]) => {
      if (blockRaw) {
        const block = parseInt(blockRaw.replace(/u64\s*$/, '').trim(), 10)
        if (block > 0) setRevealBlock(block)
      }
      if (priceRaw) {
        const cleaned = priceRaw.replace(/u128\s*$/, '').trim()
        try {
          setRevealedPrice(BigInt(cleaned))
        } catch { /* invalid */ }
      }
      setChecked(true)
    }).catch(() => setChecked(true))
  }, [auctionId])

  if (!checked || revealBlock === null) return null

  const timelockPassed = blockHeight > 0 && blockHeight >= revealBlock
  const isRevealed = revealedPrice !== null

  const handleReveal = async () => {
    const key = auctionId.endsWith('field') ? auctionId : `${auctionId}field`
    await execute({
      functionName: 'reveal_auction_result',
      inputs: [key],
    })
  }

  return (
    <div className={`card border ${isRevealed ? 'border-green-500/20 bg-green-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
      <div className="flex items-start gap-3">
        {isRevealed ? (
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
            <Unlock className="w-4 h-4 text-green-400" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {isRevealed ? (
            <>
              <p className="text-sm font-semibold text-green-300">Result Revealed</p>
              <p className="text-xs text-gray-400 mt-1">
                Winning price: <span className="text-white font-semibold">{formatAleoAmount(revealedPrice!)}</span>
              </p>
            </>
          ) : timelockPassed ? (
            <>
              <p className="text-sm font-semibold text-amber-300">Time-lock Expired</p>
              <p className="text-xs text-gray-400 mt-1">
                The result can now be publicly revealed. Click below to reveal.
              </p>
              {connected && (
                <div className="mt-3">
                  <button
                    onClick={handleReveal}
                    disabled={loading}
                    className="btn-primary text-xs py-2 px-4"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Revealing...
                      </span>
                    ) : (
                      'Reveal Result'
                    )}
                  </button>
                  {txStatus !== 'idle' && (
                    <div className="mt-2">
                      <TransactionProgress status={txStatus} txId={txId} error={error} onRetry={reset} />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-300">Result Time-Locked</p>
              <p className="text-xs text-gray-400 mt-1">
                Winning price revealed at block #{revealBlock.toLocaleString()} ({blockHeightToTime(revealBlock, blockHeight)})
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
