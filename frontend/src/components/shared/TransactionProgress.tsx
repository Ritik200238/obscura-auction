import { motion } from 'framer-motion'
import { Check, Loader2, AlertTriangle, XCircle, ExternalLink } from 'lucide-react'
import { config } from '@/lib/config'

type TxStatus = 'idle' | 'submitting' | 'pending' | 'confirmed' | 'unconfirmed' | 'failed'

interface TransactionProgressProps {
  status: TxStatus
  txId?: string | null
  error?: string | null
  onRetry?: () => void
}

interface Step {
  label: string
  description: string
}

const steps: Step[] = [
  { label: 'Generating proof', description: 'Building zero-knowledge proof via delegated prover (~1-2 min)...' },
  { label: 'Submitting to network', description: 'Broadcasting transaction to Aleo validators...' },
  { label: 'Waiting for confirmation', description: 'Waiting for block finalization (~15-30 sec per block)...' },
  { label: 'Confirmed', description: 'Transaction finalized and verified on-chain.' },
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
    // Show failed on the step that was active when failure occurred
    if (stepIndex <= 1) return stepIndex < 1 ? 'complete' : 'failed'
    return 'pending'
  }
  if (status === 'unconfirmed' && stepIndex === 2) return 'warning'
  if (stepIndex < activeStep) return 'complete'
  if (stepIndex === activeStep) return 'active'
  // For submitting, steps 0 and 1 run simultaneously
  if (status === 'submitting' && stepIndex <= 1) return 'active'
  return 'pending'
}

export default function TransactionProgress({ status, txId, error, onRetry }: TransactionProgressProps) {
  if (status === 'idle') return null

  const activeStep = getActiveStep(status)
  const showSteps = status === 'confirmed' ? steps : steps.slice(0, 3)

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
              {/* Step indicator column */}
              <div className="flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.1, duration: 0.3 }}
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
                  {state === 'complete' && (
                    <Check className="w-3 h-3 text-green-400" />
                  )}
                  {state === 'active' && (
                    <Loader2 className="w-3 h-3 text-accent-400 animate-spin" />
                  )}
                  {state === 'failed' && (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  {state === 'warning' && (
                    <AlertTriangle className="w-3 h-3 text-yellow-400" />
                  )}
                  {state === 'pending' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-surface-600" />
                  )}
                </motion.div>
                {!isLast && (
                  <div
                    className={`w-px h-5 ${
                      state === 'complete' ? 'bg-green-500/30' : 'bg-surface-700'
                    }`}
                  />
                )}
              </div>

              {/* Step content */}
              <div className={`pb-3 ${isLast ? 'pb-0' : ''}`}>
                <p
                  className={`text-xs font-medium ${
                    state === 'complete'
                      ? 'text-gray-300'
                      : state === 'active'
                      ? 'text-white'
                      : state === 'failed'
                      ? 'text-red-400'
                      : state === 'warning'
                      ? 'text-yellow-400'
                      : 'text-gray-600'
                  }`}
                >
                  {step.label}
                  {state === 'active' && '...'}
                </p>
                {(state === 'active' || state === 'warning' || state === 'failed') && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {state === 'failed' && error ? error : step.description}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Unconfirmed actions */}
      {status === 'unconfirmed' && txId && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-700/50">
          {onRetry && (
            <button onClick={onRetry} className="text-xs text-accent-400 hover:text-accent-300 font-medium">
              Retry Check
            </button>
          )}
          {(txId.startsWith('at1') || txId.startsWith('au1')) && (
            <a
              href={`${config.explorerUrl}/${config.network}/transaction/${txId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1"
            >
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* ZK proving time notice */}
      {(status === 'submitting' || status === 'pending') && (
        <p className="text-[10px] text-gray-600 mt-3 pt-3 border-t border-surface-700/30 text-center">
          Aleo transactions require zero-knowledge proof generation — typically 1-3 minutes total.
        </p>
      )}
    </motion.div>
  )
}
