// TypeScript interfaces mirroring every on-chain struct and record in obscura_v5.aleo.

/** On-chain AuctionData struct (stored in `auctions` mapping) */
export interface AuctionData {
  item_hash: string;
  seller_hash: string;
  category: number;
  token_type: number;
  auction_mode: number;
  status: number;
  deadline: number;
  reveal_deadline: number;
  bid_count: number;
  reserve_price_hash: string;
  created_at: number;
  dispute_deadline: number;
}

/** On-chain DutchConfig struct (stored in `dutch_params` mapping) */
export interface DutchConfig {
  start_price: bigint;
  end_price: bigint;
}

/** On-chain SettlementData struct (stored in `settlements` mapping) */
export interface SettlementData {
  winner_bid_hash: string;
  final_price: bigint;
  fee_collected: bigint;
  settled_at: number;
}

/** On-chain DisputeData struct (stored in `disputes` mapping) */
export interface DisputeData {
  disputer_hash: string;
  bond_amount: bigint;
  reason_hash: string;
  filed_at: number;
}

/** On-chain PlatformConfig struct */
export interface PlatformConfig {
  admin_hash: string;
  fee_bps: bigint;
  dispute_bond_bps: bigint;
  paused: boolean;
}

/** Private SealedBid record (returned by place_bid) */
export interface SealedBidRecord {
  owner: string;
  auction_id: string;
  bid_amount: bigint;
  bid_nonce: string;
  token_type: number;
}

/** Private EscrowReceipt record (returned by reveal_bid, bid_dutch, bid_english) */
export interface EscrowReceiptRecord {
  owner: string;
  auction_id: string;
  escrowed_amount: bigint;
  bid_nonce: string;
  token_type: number;
}

/** Private WinnerCertificate record (returned by claim_win*) */
export interface WinnerCertificateRecord {
  owner: string;
  auction_id: string;
  item_hash: string;
  winning_amount: bigint;
  token_type: number;
  certificate_id: string;
}

/** Private SellerReceipt record (returned by claim_win*) */
export interface SellerReceiptRecord {
  owner: string;
  auction_id: string;
  item_hash: string;
  sale_amount: bigint;
  fee_paid: bigint;
  token_type: number;
}

/** Private DisputeBond record (returned by dispute_auction) */
export interface DisputeBondRecord {
  owner: string;
  auction_id: string;
  bond_amount: bigint;
}

/** SDK configuration */
export interface ObscuraConfig {
  network?: 'testnet' | 'mainnet';
  programId?: string;
  endpoint?: string;
}

/** Auction phase (frontend-friendly) */
export type AuctionPhase =
  | 'active'
  | 'revealing'
  | 'settled'
  | 'failed'
  | 'disputed'
  | 'cancelled'
  | 'expired';

/** Parsed auction with computed fields */
export interface ParsedAuction extends AuctionData {
  auction_id: string;
  phase: AuctionPhase;
  mode_label: string;
  token_label: string;
  status_label: string;
}
