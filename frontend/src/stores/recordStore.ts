import { create } from 'zustand'
import type {
  SealedBidRecord,
  EscrowReceiptRecord,
  WinnerCertificateRecord,
  SellerReceiptRecord,
} from '@/types'

interface RecordState {
  sealedBids: SealedBidRecord[]
  escrowReceipts: EscrowReceiptRecord[]
  winnerCerts: WinnerCertificateRecord[]
  sellerReceipts: SellerReceiptRecord[]
  // Raw records as returned by requestRecords — used for transaction inputs
  rawSealedBids: Record<string, unknown>[]
  rawEscrowReceipts: Record<string, unknown>[]
  loading: boolean

  setSealedBids: (bids: SealedBidRecord[], raw: Record<string, unknown>[]) => void
  setEscrowReceipts: (receipts: EscrowReceiptRecord[], raw: Record<string, unknown>[]) => void
  setWinnerCerts: (certs: WinnerCertificateRecord[]) => void
  setSellerReceipts: (receipts: SellerReceiptRecord[]) => void
  setLoading: (loading: boolean) => void
  getForAuction: (auctionId: string) => {
    bids: SealedBidRecord[]
    receipts: EscrowReceiptRecord[]
    rawBids: Record<string, unknown>[]
    rawReceipts: Record<string, unknown>[]
    winnerCert: WinnerCertificateRecord | undefined
    sellerReceipt: SellerReceiptRecord | undefined
  }
  clear: () => void
}

export const useRecordStore = create<RecordState>((set, get) => ({
  sealedBids: [],
  escrowReceipts: [],
  winnerCerts: [],
  sellerReceipts: [],
  rawSealedBids: [],
  rawEscrowReceipts: [],
  loading: false,

  setSealedBids: (bids, raw) => set({ sealedBids: bids, rawSealedBids: raw }),
  setEscrowReceipts: (receipts, raw) => set({ escrowReceipts: receipts, rawEscrowReceipts: raw }),
  setWinnerCerts: (certs) => set({ winnerCerts: certs }),
  setSellerReceipts: (receipts) => set({ sellerReceipts: receipts }),
  setLoading: (loading) => set({ loading }),

  getForAuction: (auctionId: string) => {
    const state = get()
    const bidIndices: number[] = []
    const bids = state.sealedBids.filter((b, i) => {
      if (b.auction_id === auctionId) { bidIndices.push(i); return true }
      return false
    })
    const receiptIndices: number[] = []
    const receipts = state.escrowReceipts.filter((r, i) => {
      if (r.auction_id === auctionId) { receiptIndices.push(i); return true }
      return false
    })
    return {
      bids,
      receipts,
      rawBids: bidIndices.map(i => state.rawSealedBids[i]),
      rawReceipts: receiptIndices.map(i => state.rawEscrowReceipts[i]),
      winnerCert: state.winnerCerts.find((c) => c.auction_id === auctionId),
      sellerReceipt: state.sellerReceipts.find((r) => r.auction_id === auctionId),
    }
  },

  clear: () =>
    set({
      sealedBids: [],
      escrowReceipts: [],
      winnerCerts: [],
      sellerReceipts: [],
      rawSealedBids: [],
      rawEscrowReceipts: [],
    }),
}))
