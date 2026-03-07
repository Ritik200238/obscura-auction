import { useState, useCallback } from 'react'
import { useWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { PROGRAM_ID } from '@/types'
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
        const result = await requestRecords(PROGRAM_ID)
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
        const data = (record.data || record) as Record<string, unknown>
        const recordName = String(record.recordName || record.record_name || '')

        if (
          recordName === 'SealedBid' ||
          (data.bid_amount !== undefined && data.bid_nonce !== undefined && data.escrowed_amount === undefined)
        ) {
          bids.push({
            owner: stripSuffix(data.owner),
            auction_id: stripSuffix(data.auction_id),
            bid_amount: stripSuffix(data.bid_amount),
            bid_nonce: stripSuffix(data.bid_nonce),
            token_type: stripSuffixNum(data.token_type),
          })
          rawBids.push(record)
        } else if (
          recordName === 'EscrowReceipt' ||
          data.escrowed_amount !== undefined
        ) {
          receipts.push({
            owner: stripSuffix(data.owner),
            auction_id: stripSuffix(data.auction_id),
            escrowed_amount: stripSuffix(data.escrowed_amount),
            bid_nonce: stripSuffix(data.bid_nonce),
            token_type: stripSuffixNum(data.token_type),
          })
          rawReceipts.push(record)
        } else if (
          recordName === 'WinnerCertificate' ||
          data.winning_amount !== undefined
        ) {
          certs.push({
            owner: stripSuffix(data.owner),
            auction_id: stripSuffix(data.auction_id),
            item_hash: stripSuffix(data.item_hash),
            winning_amount: stripSuffix(data.winning_amount),
            token_type: stripSuffixNum(data.token_type),
            certificate_id: stripSuffix(data.certificate_id),
          })
        } else if (
          recordName === 'SellerReceipt' ||
          data.sale_amount !== undefined
        ) {
          sellerRcpts.push({
            owner: stripSuffix(data.owner),
            auction_id: stripSuffix(data.auction_id),
            item_hash: stripSuffix(data.item_hash),
            sale_amount: stripSuffix(data.sale_amount),
            fee_paid: stripSuffix(data.fee_paid),
            token_type: stripSuffixNum(data.token_type),
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
