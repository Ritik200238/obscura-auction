import { useState, useCallback } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { config } from '@/lib/config'
import { useRecordStore } from '@/stores/recordStore'
import type {
  SealedBidRecord,
  EscrowReceiptRecord,
  WinnerCertificateRecord,
  SellerReceiptRecord,
} from '@/types'

/**
 * Parse a record field value, stripping type suffixes and visibility modifiers.
 * Used for display only — raw values are preserved separately for transactions.
 */
function stripSuffix(val: unknown): string {
  if (typeof val !== 'string') return String(val || '')
  return val.replace(/u128|u64|u32|u8|field|\.private|\.public/g, '').trim()
}

function stripSuffixNum(val: unknown): number {
  return parseInt(stripSuffix(val), 10) || 0
}

/**
 * NullPay dual-format field extraction.
 * Shield Wallet records may arrive as either:
 *   1. `record.data.fieldName` — object with typed field values
 *   2. `record.plaintext` — Leo record string like "{ field: value, ... }"
 * This function tries the data object first, then falls back to plaintext regex.
 */
function extractField(
  data: Record<string, unknown>,
  plaintext: string | null,
  fieldName: string
): unknown {
  // Strategy 1: data object field (most common with Shield Wallet)
  if (data[fieldName] !== undefined) return data[fieldName]

  // Strategy 2: plaintext regex (fallback for raw record strings)
  if (plaintext) {
    // Match patterns like: field_name: 1000000u128.private  OR  field_name: aleo1abc...field
    const regex = new RegExp(`${fieldName}\\s*:\\s*([^,}]+)`)
    const match = plaintext.match(regex)
    if (match && match[1]) {
      return match[1].trim()
    }
  }

  return undefined
}

/**
 * Hook to fetch and parse the user's records from the wallet.
 * Stores both stripped (for display) and raw (for transactions) versions.
 */
export function useRecords() {
  const { requestRecords } = useWallet()
  const {
    setSealedBids,
    setEscrowReceipts,
    setWinnerCerts,
    setSellerReceipts,
    setLoading,
    sealedBids,
    escrowReceipts,
    winnerCerts,
    sellerReceipts,
  } = useRecordStore()

  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let rawRecords: unknown[] = []

      try {
        const result = await requestRecords(config.programId)
        rawRecords = Array.isArray(result) ? result : []
      } catch {
        rawRecords = []
      }

      const bids: SealedBidRecord[] = []
      const rawBids: Record<string, unknown>[] = []
      const receipts: EscrowReceiptRecord[] = []
      const rawReceipts: Record<string, unknown>[] = []
      const certs: WinnerCertificateRecord[] = []
      const sellerRcpts: SellerReceiptRecord[] = []

      for (const raw of rawRecords) {
        const record = raw as Record<string, unknown>
        // Shield Wallet may nest record fields under `data`; some adapters put them at top level
        const data = (record.data && typeof record.data === 'object' ? record.data : record) as Record<string, unknown>
        // Prefer explicit recordName from wallet adapter (most reliable)
        const recordName = String(record.recordName || record.record_name || record.type || '')
        // Plaintext fallback for NullPay dual-format parsing
        const plaintext = typeof record.plaintext === 'string' ? record.plaintext : null

        // Use extractField for robust field access (data object → plaintext regex)
        const f = (name: string) => extractField(data, plaintext, name)

        if (
          recordName === 'SealedBid' ||
          (f('bid_amount') !== undefined && f('bid_nonce') !== undefined && f('escrowed_amount') === undefined)
        ) {
          bids.push({
            owner: stripSuffix(f('owner')),
            auction_id: stripSuffix(f('auction_id')),
            bid_amount: stripSuffix(f('bid_amount')),
            bid_nonce: stripSuffix(f('bid_nonce')),
            token_type: stripSuffixNum(f('token_type')),
          })
          rawBids.push(record)
        } else if (
          recordName === 'EscrowReceipt' ||
          f('escrowed_amount') !== undefined
        ) {
          receipts.push({
            owner: stripSuffix(f('owner')),
            auction_id: stripSuffix(f('auction_id')),
            escrowed_amount: stripSuffix(f('escrowed_amount')),
            bid_nonce: stripSuffix(f('bid_nonce')),
            token_type: stripSuffixNum(f('token_type')),
          })
          rawReceipts.push(record)
        } else if (
          recordName === 'WinnerCertificate' ||
          f('winning_amount') !== undefined
        ) {
          certs.push({
            owner: stripSuffix(f('owner')),
            auction_id: stripSuffix(f('auction_id')),
            item_hash: stripSuffix(f('item_hash')),
            winning_amount: stripSuffix(f('winning_amount')),
            token_type: stripSuffixNum(f('token_type')),
            certificate_id: stripSuffix(f('certificate_id')),
          })
        } else if (
          recordName === 'SellerReceipt' ||
          f('sale_amount') !== undefined
        ) {
          sellerRcpts.push({
            owner: stripSuffix(f('owner')),
            auction_id: stripSuffix(f('auction_id')),
            item_hash: stripSuffix(f('item_hash')),
            sale_amount: stripSuffix(f('sale_amount')),
            fee_paid: stripSuffix(f('fee_paid')),
            token_type: stripSuffixNum(f('token_type')),
          })
        }
      }

      setSealedBids(bids, rawBids)
      setEscrowReceipts(receipts, rawReceipts)
      setWinnerCerts(certs)
      setSellerReceipts(sellerRcpts)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch records')
      setLoading(false)
    }
  }, [requestRecords, setSealedBids, setEscrowReceipts, setWinnerCerts, setSellerReceipts, setLoading])

  const loading = useRecordStore((s) => s.loading)

  return {
    loading,
    error,
    refresh,
    sealedBids,
    escrowReceipts,
    winnerCerts,
    sellerReceipts,
  }
}
