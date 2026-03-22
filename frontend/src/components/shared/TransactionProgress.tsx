import { motion } from 'framer-motion'
import { Check, Loader2, AlertTriangle, XCircle, ExternalLink, RefreshCw, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { config } from '@/lib/config'

type TxStatus = 'idle' | 'submitting' | 'pending' | 'confirmed' | 'unconfirmed' | 'failed'

interface TransactionProgressProps {
  status: TxStatus
  txId?: string | null
  error?: string | null
  onRetry?: () => void
  nextAction?: { label: string; href?: string; onClick?: () => void }
}

interface Step {
  label: string
  description: string
  time: string
}

const steps: Step[] = [
  { label: 'Generating ZK proof', description: 'Building zero-knowledge proof via delegated prover...', time: '~1-2 minutes' },
  { label: 'Submitting to network', description: 'Broadcasting transaction to Aleo validators...', time: '~30 seconds' },
  { label: 'Waiting for confirmation', description: 'Waiting for block finalization...', time: '~15-30 seconds' },
  { label: 'Confirmed', description: 'Transaction finalized on-chain.', time: '' },
]

function getActiveStep(status: TxStatus): number {
  switch (status) {
    case 'submitting': return 0
    case 'pending': return 2
    case 'confirmed': return 3
    case 'failed': return -1
    case 'unconfirmed': return 2
    default: return -1
  }
}

function getStepState(
  stepIndex: number,
  activeStep: number,
  status: TxStatus
): 'complete' | 'active' | 'pending' | 'failed' | 'warning' {
  if (status === 'failed') {
    if (stepIndex <= 1) return stepIndex < 1 ? 'complete' : 'failed'
    return 'pending'
  }
  if (status === 'unconfirmed' && stepIndex === 2) return 'warning'
  if (stepIndex < activeStep) return 'complete'
  if (stepIndex === activeStep) return status === 'confirmed' ? 'complete' : 'active'
  if (status === 'submitting' && stepIndex <= 1) return 'active'
  return 'pending'
}

function friendlyError(raw: string | null | undefined): string {
  if (!raw) return 'Something went wrong. Please try again.'
  const lower = raw.toLowerCase()
  if (lower.includes('insufficient') || lower.includes('balance')) return 'Not enough tokens in your wallet. Get testnet ALEO from the faucet and try again.'
  if (lower.includes('rejected') || lower.includes('abort')) return 'The transaction was rejected by the network. The auction state may have changed — refresh and try again.'
  if (lower.includes('timeout') || lower.includes('timed out')) return 'The transaction is taking longer than expected. It may still confirm — check the explorer link below.'
  if (lower.includes('user denied') || lower.includes('cancelled')) return 'You cancelled the transaction in your wallet.'
  if (lower.includes('assert')) return 'The on-chain validation failed. This usually means the auction state changed (e.g., deadline passed or someone else bid first).'
  if (raw.length > 120) return raw.slice(0, 120) + '...'
  return raw
}

export default function TransactionProgress({ status, txId, error, onRetry, nextAction }: TransactionProgressProps) {
  if (status === 'idle') return null

  const activeStep = getActiveStep(status)
  const showSteps = status === 'confirmed' ? steps : steps.slice(0, 3)
  const explorerHref = txId && (txId.startsWith('at1') || txId.startsWith('au1'))
    ? `${config.explorerUrl}/${config.network}/transaction/${txId}`
    : null

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="bg-surface-800/60 rounded-xl p-4 border border-surface-700/50"
    >
      <div className="space-y-0">
        {showSteps.map((step, i) => {
          const state = getStepState(i, activeStep, status)
          const isLast = i === showSteps.length - 1

          return (
            <div key={step.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={state === 'complete' && i === 3
                    ? { scale: [0.8, 1.2, 1], opacity: 1 }
                    : { scale: 1, opacity: 1 }}
                  transition={state === 'complete' && i === 3
                    ? { duration: 0.5, times: [0, 0.6, 1] }
                    : { delay: i * 0.1, duration: 0.3 }}
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    state === 'complete'
                      ? 'bg-green-500/20'
                      : state === 'active'
                      ? 'bg-accent-500/20'
                      : state === 'failed'
                      ? 'bg-red-500/20'
                      : state === 'warning'
                      ? 'bg-yellow-500/20'
                      : 'bg-surface-700/50'
                  }`}
                >
                  {state === 'complete' && <Check className="w-3 h-3 text-green-400" />}
                  {state === 'active' && <Loader2 className="w-3 h-3 text-accent-400 animate-spin" />}
                  {state === 'failed' && <XCircle className="w-3 h-3 text-red-400" />}
                  {state === 'warning' && <AlertTriangle className="w-3 h-3 text-yellow-400" />}
                  {state === 'pending' && <div className="w-1.5 h-1.5 rounded-full bg-surface-600" />}
                </motion.div>
                {!isLast && (
                  <div className={`w-px h-5 ${state === 'complete' ? 'bg-green-500/30' : 'bg-surface-700'}`} />
                )}
              </div>

              <div className={`pb-3 ${isLast ? 'pb-0' : ''}`}>
                <div className="flex items-center gap-2">
                  <p className={`text-xs font-medium ${
                    state === 'complete' ? 'text-gray-300' :
                    state === 'active' ? 'text-white' :
                    state === 'failed' ? 'text-red-400' :
                    state === 'warning' ? 'text-yellow-400' :
                    'text-gray-600'
                  }`}>
                    {step.label}{state === 'active' && '...'}
                  </p>
                  {state === 'active' && step.time && (
                    <span className="text-[10px] text-accent-400/60 font-mono">{step.time}</span>
                  )}
                </div>
                {(state === 'active' || state === 'warning') && (
                  <p className="text-[10px] text-gray-500 mt-0.5">{step.description}</p>
                )}
                {state === 'failed' && (
                  <p className="text-[10px] text-red-400/80 mt-0.5">{friendlyError(error)}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirmed: explorer link + next action */}
      {status === 'confirmed' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-3 pt-3 border-t border-surface-700/50">
          {explorerHref && (
            <a
              href={explorerHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
            >
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {nextAction && (
            nextAction.href ? (
              <Link to={nextAction.href} className="btn-primary text-xs px-3 py-1.5 ml-auto">
                {nextAction.label}
              </Link>
            ) : nextAction.onClick ? (
              <button onClick={nextAction.onClick} className="btn-primary text-xs px-3 py-1.5 ml-auto">
                {nextAction.label}
              </button>
            ) : null
          )}
        </div>
      )}

      {/* Failed: retry + help */}
      {status === 'failed' && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-surface-700/50">
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-white bg-red-500/20 hover:bg-red-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Try Again
            </button>
          )}
          <Link
            to="/docs"
            className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1"
          >
            <HelpCircle className="w-3 h-3" /> Need Help?
          </Link>
        </div>
      )}

      {/* Unconfirmed actions */}
      {status === 'unconfirmed' && txId && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-700/50">
          {onRetry && (
            <button onClick={onRetry} className="text-xs text-accent-400 hover:text-accent-300 font-medium flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Retry Check
            </button>
          )}
          {explorerHref && (
            <a href={explorerHref} target="_blank" rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1">
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Time estimate during waiting */}
      {(status === 'submitting' || status === 'pending') && (
        <p className="text-[10px] text-gray-600 mt-3 pt-3 border-t border-surface-700/30 text-center">
          Total time: ~2-3 minutes. You can leave this page — the transaction will continue.
        </p>
      )}
    </motion.div>
  )
}
