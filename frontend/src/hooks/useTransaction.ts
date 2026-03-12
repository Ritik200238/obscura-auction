import { useState, useCallback, useRef, useEffect } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { config } from '@/lib/config'

interface ExecuteOptions {
  program?: string
  functionName: string
  inputs: string[]
  fee?: number
  privateFee?: boolean
  /** Optional on-chain verification callback — the true source of truth.
   *  Checked every 3rd poll cycle. If it returns true, the TX is confirmed
   *  regardless of what the wallet adapter reports. */
  onChainVerify?: () => Promise<boolean>
}

type TxStatus = 'idle' | 'submitting' | 'pending' | 'confirmed' | 'unconfirmed' | 'failed'

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

  // Clean up polling interval on unmount to prevent memory leaks
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const pollTransaction = useCallback(
    (txId: string, onChainVerify?: () => Promise<boolean>) => {
      let attempts = 0
      const maxAttempts = 40 // ~2 minutes at 3s intervals

      setStatus('pending')

      pollRef.current = setInterval(async () => {
        attempts++

        if (attempts > maxAttempts) {
          stopPolling()
          // Before giving up: try on-chain verification 3 times as final check
          if (onChainVerify) {
            for (let retry = 0; retry < 3; retry++) {
              try {
                const verified = await onChainVerify()
                if (verified) {
                  setStatus('confirmed')
                  setLoading(false)
                  return
                }
              } catch { /* ignore */ }
              if (retry < 2) await new Promise((r) => setTimeout(r, 2000))
            }
          }
          setStatus('unconfirmed')
          setLoading(false)
          return
        }

        try {
          // On-chain verification every 3rd cycle — this is the SOURCE OF TRUTH
          // (Veiled Markets pattern: wallet status is secondary, mapping state is primary)
          if (onChainVerify && attempts > 1 && attempts % 3 === 0) {
            try {
              const verified = await onChainVerify()
              if (verified) {
                stopPolling()
                setStatus('confirmed')
                setLoading(false)
                return
              }
            } catch { /* continue to wallet check */ }
          }

          // Try wallet adapter's transactionStatus
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

          // Fallback: check explorer API for the transaction
          const url = `${config.explorerApi}/${config.network}/transaction/${txId}`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json()
            if (data && data.type) {
              stopPolling()
              setStatus('confirmed')
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

        const TX_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
        const response = await Promise.race([
          executeTransaction(aleoTransaction as any),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Transaction timed out — wallet did not respond within 5 minutes')), TX_TIMEOUT_MS)
          ),
        ])

        // Extract transaction ID from response
        let transactionId: string | null = null
        if (response && typeof response === 'object' && 'transactionId' in response) {
          transactionId = (response as any).transactionId
        } else if (typeof response === 'string') {
          transactionId = response
        }

        setTxId(transactionId)

        if (transactionId) {
          // Start polling for confirmation, with optional on-chain verification
          pollTransaction(transactionId, options.onChainVerify)
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

  const retryCheck = useCallback(() => {
    if (txId && status === 'unconfirmed') {
      setStatus('pending')
      setLoading(true)
      pollTransaction(txId)
    }
  }, [txId, status, pollTransaction])

  const reset = useCallback(() => {
    stopPolling()
    setLoading(false)
    setError(null)
    setTxId(null)
    setStatus('idle')
  }, [stopPolling])

  return { execute, loading, error, txId, status, transactionStatus, reset, retryCheck }
}
