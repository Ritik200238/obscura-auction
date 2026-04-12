// 4-program architecture — verified on testnet 2026-04-12 (Rule 0)
export const PROGRAM_ID = 'obscura_core_v3.aleo'                        // Core auction engine
export const SETTLE_PROGRAM_ID = 'obscura_settle_v4.aleo'               // ALEO v4 — privacy-hardened (revealed_bids bool)
export const SETTLE_STABLE_PROGRAM_ID = 'obscura_settle_stable_v4.aleo' // USDCx+USAD v4 — privacy-hardened (pending deploy)
export const MARKET_PROGRAM_ID = 'obscura_market_v2.aleo'               // Marketplace extensions

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

export const TOKEN_TYPE = { ALEO: 1, USDCX: 2, USAD: 3 } as const
export const AUCTION_MODE = {
  FIRST_PRICE: 1, VICKREY: 2, DUTCH: 3, ENGLISH: 4,
  BUNDLE: 5, MULTI_UNIT: 6, CANDLE: 7, REVERSE: 8,
  BLIND_DUTCH: 9, TIMED_ESCALATION: 10,
} as const

export const CATEGORY_LABELS: Record<number, string> = {
  1: 'Art',
  2: 'Collectible',
  3: 'Service',
  4: 'Other',
}

export const MODE_LABELS: Record<number, string> = {
  [AUCTION_MODE.FIRST_PRICE]: 'Sealed Bid (Highest Wins)',
  [AUCTION_MODE.VICKREY]: 'Vickrey (Winner Pays 2nd Price)',
  [AUCTION_MODE.DUTCH]: 'Dutch (Price Drops Until Someone Bids)',
  [AUCTION_MODE.ENGLISH]: 'English (Open Ascending Bids)',
  [AUCTION_MODE.BUNDLE]: 'Bundle (Multi-Item Package)',
  [AUCTION_MODE.MULTI_UNIT]: 'Multi-Unit (Batch Quantity + Price)',
  [AUCTION_MODE.CANDLE]: 'Candle (Random End Time)',
  [AUCTION_MODE.REVERSE]: 'Reverse (Lowest Bid Wins)',
  [AUCTION_MODE.BLIND_DUTCH]: 'Blind Dutch (Sealed + Descending)',
  [AUCTION_MODE.TIMED_ESCALATION]: 'Timed Escalation (Auto-Incrementing)',
}

export const MODE_DESCRIPTIONS: Record<number, string> = {
  [AUCTION_MODE.FIRST_PRICE]: 'Bids are private until reveal. Highest bidder wins and pays their bid.',
  [AUCTION_MODE.VICKREY]: 'Bids are private until reveal. Highest bidder wins but pays the second-highest bid — encourages honest bidding.',
  [AUCTION_MODE.DUTCH]: 'Price starts high and drops every block. First buyer to accept wins instantly at the current price.',
  [AUCTION_MODE.ENGLISH]: 'Open ascending bids. Each bid must beat the previous. Highest bidder at deadline wins.',
  [AUCTION_MODE.BUNDLE]: 'Seller lists 2-4 items as a package. Bidders bid on the entire bundle. Sealed-bid with commit-reveal.',
  [AUCTION_MODE.MULTI_UNIT]: 'Seller lists N identical units. Bidders specify quantity and price per unit. Highest bidders get allocated first.',
  [AUCTION_MODE.CANDLE]: 'Like English but ends at a random time. Bidders never know which block will count. Prevents sniping completely. Inspired by Polkadot parachain auctions.',
  [AUCTION_MODE.REVERSE]: 'Buyer posts a request. Sellers compete by bidding DOWN. Lowest bid wins. Used for procurement and hiring.',
  [AUCTION_MODE.BLIND_DUTCH]: 'Price drops every block but nobody sees it. Submit sealed bids guessing the current price. First correct guess wins. Novel privacy mechanism.',
  [AUCTION_MODE.TIMED_ESCALATION]: 'Price auto-increments every 10 minutes. Bid above the current price to become the leader. Last bidder when clock expires wins.',
}

export const TOKEN_LABELS: Record<number, string> = {
  [TOKEN_TYPE.ALEO]: 'ALEO',
  [TOKEN_TYPE.USDCX]: 'USDCx',
  [TOKEN_TYPE.USAD]: 'USAD',
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
