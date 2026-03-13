import { useState, useCallback, useRef, useEffect } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { config } from '@/lib/config'
import { useWalletStore } from '@/stores/walletStore'

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
 * Passes fee in both ALEO and microcredits to support all wallet adapters,
 * normalizes the response, and polls for transaction confirmation.
 */
export function useTransaction() {
  const { executeTransaction, transactionStatus, address: walletAddress } = useWallet()
  const { walletType } = useWalletStore()
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
      // Track the best-known TX ID across poll iterations.
      // Shield returns shield_* temp IDs initially; the real at1... ID arrives later
      // via transactionStatus. This variable persists across iterations via closure.
      let currentTxId = txId
      const maxAttempts = 100 // ~5 minutes at 3s intervals (Shield proving takes 1-3 min)

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

        // Step 1: On-chain verification every 3rd cycle — SOURCE OF TRUTH
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

        // Step 2: Try wallet adapter's transactionStatus
        // IMPORTANT: wrapped in its own try/catch so failure doesn't skip explorer check
        if (transactionStatus) {
          try {
            const walletStatus: unknown = await transactionStatus(txId)
            console.log('[useTransaction] transactionStatus response:', JSON.stringify(walletStatus))

            let statusStr: string | null = null
            let realTxId: string | null = null
            if (typeof walletStatus === 'string') {
              statusStr = walletStatus
            } else if (walletStatus && typeof walletStatus === 'object') {
              if ('status' in walletStatus) statusStr = String((walletStatus as any).status)
              // Shield returns the real on-chain TX ID once proved/broadcast
              if ('transactionId' in walletStatus) realTxId = (walletStatus as any).transactionId
            }

            // Update tracking ID if we got the real on-chain ID
            if (realTxId && realTxId.startsWith('at1')) {
              currentTxId = realTxId
              setTxId(realTxId)
            }

            if (statusStr) {
              const s = statusStr.toLowerCase()
              // Confirmed — Shield may return 'completed', 'done', 'success' instead of 'finalized'
              if (['finalized', 'confirmed', 'accepted', 'completed', 'done', 'success'].includes(s)) {
                stopPolling()
                setStatus('confirmed')
                setLoading(false)
                return
              }
              if (['rejected', 'failed', 'aborted'].includes(s)) {
                stopPolling()
                setStatus('failed')
                setError('Transaction was rejected on-chain')
                setLoading(false)
                return
              }
            }
          } catch (e) {
            // transactionStatus failed — DON'T rethrow, continue to explorer check
            // Only log occasionally to avoid console spam
            if (attempts <= 3 || attempts % 10 === 0) {
              console.log('[useTransaction] transactionStatus error (attempt ' + attempts + '):', e)
            }
          }
        }

        // Step 3: Explorer fallback — uses currentTxId which may have been updated
        // from shield_* to at1... by step 2 above
        try {
          const isRealTxId = currentTxId.startsWith('at1') || currentTxId.startsWith('au1')
          if (isRealTxId) {
            const url = `${config.explorerApi}/${config.network}/transaction/${currentTxId}`
            const res = await fetch(url)
            if (res.ok) {
              const data = await res.json()
              if (data && data.type) {
                stopPolling()
                setTxId(currentTxId) // ensure state has the real ID
                setStatus('confirmed')
                setLoading(false)
                return
              }
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

        // Build a clean TransactionOptions payload.
        // Shield adapter spreads this directly into window.shield.executeTransaction(),
        // so extra fields (address, chainId, transitions, feePrivate) BREAK Shield —
        // the extension either misparses them or silently drops the transaction.
        // Leo/Fox/Soter/Puzzle adapters construct their own objects from these fields,
        // so they also work fine with clean TransactionOptions.
        const aleoTransaction: Record<string, unknown> = {
          program: programId,
          function: options.functionName,
          inputs: options.inputs,
          fee: feeInMicrocredits,
          privateFee: options.privateFee !== false,
        }

        console.log(`[useTransaction] Wallet type: ${walletType}, payload:`, JSON.stringify(aleoTransaction))

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
        console.error('[useTransaction] Full error:', err)
        let msg = 'Transaction failed'
        if (err instanceof Error) {
          msg = err.message
        } else if (typeof err === 'string') {
          msg = err
        } else if (err && typeof err === 'object' && 'message' in err) {
          msg = String((err as any).message)
        }
        // Leo Wallet can't prove complex programs locally — suggest Shield
        if (msg.includes('Failed to execute') || msg.includes('Could not create')) {
          msg += '. Leo Wallet may not support local proving for this program — try Shield Wallet (shield.app) which uses delegated proving.'
        }
        // Shield Wallet extension communication failure
        if (msg.includes('No response') || msg.includes('message port closed')) {
          msg = 'Shield Wallet did not respond. Try: (1) Disable other wallet extensions (MetaMask, Phantom), (2) Refresh the page, (3) Reconnect Shield Wallet. If the issue persists, restart your browser.'
        }
        setError(msg)
        setLoading(false)
        setStatus('failed')
        return { transactionId: null }
      }
    },
    [executeTransaction, pollTransaction, stopPolling, walletAddress, walletType]
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
