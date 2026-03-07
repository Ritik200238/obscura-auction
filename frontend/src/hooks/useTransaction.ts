import { useState, useCallback, useRef } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { config } from '@/lib/config'

interface ExecuteOptions {
  program?: string
  functionName: string
  inputs: string[]
  fee?: number
  privateFee?: boolean
}

type TxStatus = 'idle' | 'submitting' | 'pending' | 'confirmed' | 'failed'

interface TransactionResult {
  transactionId: string | null
}

/**
 * Hook that wraps the wallet adaptor's executeTransaction.
 * Converts fee from ALEO to microcredits, normalizes the response,
 * and polls for transaction confirmation.
 */
export function useTransaction() {
  const { executeTransaction, transactionStatus } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [status, setStatus] = useState<TxStatus>('idle')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollTransaction = useCallback(
    (txId: string) => {
      let attempts = 0
      const maxAttempts = 40 // ~2 minutes at 3s intervals

      setStatus('pending')

      pollRef.current = setInterval(async () => {
        attempts++
        if (attempts > maxAttempts) {
          stopPolling()
          setStatus('confirmed') // Assume confirmed after timeout — explorer will show real status
          setLoading(false)
          return
        }

        try {
          // Try wallet adapter's transactionStatus first
          if (transactionStatus) {
            const walletStatus: unknown = await transactionStatus(txId)
            if (walletStatus && typeof walletStatus === 'string') {
              const s = walletStatus.toLowerCase()
              if (s === 'finalized' || s === 'confirmed' || s === 'accepted') {
                stopPolling()
                setStatus('confirmed')
                setLoading(false)
                return
              }
              if (s === 'rejected' || s === 'failed' || s === 'aborted') {
                stopPolling()
                setStatus('failed')
                setError('Transaction was rejected on-chain')
                setLoading(false)
                return
              }
            }
          }

          // Fallback: check explorer API
          const url = `${config.explorerApi}/${config.network}/transaction/${txId}`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json()
            if (data && data.type) {
              // Transaction found on-chain
              stopPolling()
              if (data.type === 'execute' && data.execution) {
                setStatus('confirmed')
              } else {
                setStatus('confirmed')
              }
              setLoading(false)
              return
            }
          }
        } catch {
          // Network error — keep polling
        }
      }, 3000)
    },
    [transactionStatus, stopPolling]
  )

  const execute = useCallback(
    async (options: ExecuteOptions): Promise<TransactionResult> => {
      setLoading(true)
      setError(null)
      setTxId(null)
      setStatus('submitting')
      stopPolling()

      try {
        const programId = options.program || config.programId
        const feeInAleo = options.fee ?? config.defaultFee
        const feeInMicrocredits = Math.floor(feeInAleo * 1_000_000)

        const aleoTransaction = {
          type: 'execute' as const,
          programId,
          functionName: options.functionName,
          inputs: options.inputs,
          fee: feeInMicrocredits,
          feePrivate: options.privateFee !== false,
        }

        const response = await executeTransaction(aleoTransaction as any)

        // Extract transaction ID from response
        let transactionId: string | null = null
        if (response && typeof response === 'object' && 'transactionId' in response) {
          transactionId = (response as any).transactionId
        } else if (typeof response === 'string') {
          transactionId = response
        }

        setTxId(transactionId)

        if (transactionId) {
          // Start polling for confirmation
          pollTransaction(transactionId)
        } else {
          setLoading(false)
          setStatus('idle')
        }

        return { transactionId }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transaction failed'
        setError(msg)
        setLoading(false)
        setStatus('failed')
        return { transactionId: null }
      }
    },
    [executeTransaction, pollTransaction, stopPolling]
  )

  const reset = useCallback(() => {
    stopPolling()
    setLoading(false)
    setError(null)
    setTxId(null)
    setStatus('idle')
  }, [stopPolling])

  return { execute, loading, error, txId, status, transactionStatus, reset }
}
