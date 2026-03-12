export const PROGRAM_ID = 'obscura_v3.aleo'

export const STATUS = {
  ACTIVE: 1,
  CLOSED: 2,
  REVEALING: 3,
  SETTLED: 4,
  CANCELLED: 5,
  FAILED: 6,
  DISPUTED: 7,
  EXPIRED: 8,
} as const

export const TOKEN_TYPE = { ALEO: 1, USDCX: 2 } as const
export const AUCTION_MODE = { FIRST_PRICE: 1, VICKREY: 2 } as const

export const CATEGORY_LABELS: Record<number, string> = {
  1: 'Art',
  2: 'Collectible',
  3: 'Service',
  4: 'Other',
}

export const STATUS_LABELS: Record<number, string> = {
  [STATUS.ACTIVE]: 'Active',
  [STATUS.CLOSED]: 'Closed',
  [STATUS.REVEALING]: 'Revealing',
  [STATUS.SETTLED]: 'Settled',
  [STATUS.CANCELLED]: 'Cancelled',
  [STATUS.FAILED]: 'Failed',
  [STATUS.DISPUTED]: 'Disputed',
  [STATUS.EXPIRED]: 'Expired',
}

export const STATUS_COLORS: Record<number, string> = {
  [STATUS.ACTIVE]: 'bg-green-500/20 text-green-400 border-green-500/30',
  [STATUS.CLOSED]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  [STATUS.REVEALING]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  [STATUS.SETTLED]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  [STATUS.CANCELLED]: 'bg-red-500/20 text-red-400 border-red-500/30',
  [STATUS.FAILED]: 'bg-red-500/20 text-red-400 border-red-500/30',
  [STATUS.DISPUTED]: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  [STATUS.EXPIRED]: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

/**
 * Matches the on-chain AuctionData struct exactly.
 * All numeric fields use u64 (number) or field (string).
 */
export interface AuctionData {
  auction_id: string
  item_hash: string
  seller_hash: string
  category: number
  token_type: number
  auction_mode: number
  status: number
  deadline: number
  reveal_deadline: number
  bid_count: number
  reserve_price_hash: string
  created_at: number
  dispute_deadline: number
  // Frontend metadata (from backend API)
  title?: string
  description?: string
  image_url?: string
}

export interface SealedBidRecord {
  owner: string
  auction_id: string
  bid_amount: string
  bid_nonce: string
  token_type: number
}

export interface EscrowReceiptRecord {
  owner: string
  auction_id: string
  escrowed_amount: string
  bid_nonce: string
  token_type: number
}

export interface WinnerCertificateRecord {
  owner: string
  auction_id: string
  item_hash: string
  winning_amount: string
  token_type: number
  certificate_id: string
}

export interface SellerReceiptRecord {
  owner: string
  auction_id: string
  item_hash: string
  sale_amount: string
  fee_paid: string
  token_type: number
}

export type AuctionPhase =
  | 'active'
  | 'revealing'
  | 'settled'
  | 'failed'
  | 'disputed'
  | 'cancelled'
  | 'expired'
