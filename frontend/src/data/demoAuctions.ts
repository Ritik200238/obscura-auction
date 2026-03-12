import { STATUS, TOKEN_TYPE, AUCTION_MODE } from '@/types'
import type { AuctionData } from '@/types'

/**
 * Pre-seeded demo auctions so Browse page is never empty.
 * These represent realistic listings across different statuses,
 * modes, and token types. They use plausible field hashes
 * but are NOT real on-chain auctions.
 */
export const demoAuctions: AuctionData[] = [
  {
    auction_id: '6882928631484950133624464808745388159395855736893406333215224960779053894498field',
    item_hash: '4829103846738291047382910473829104738291047382910473829104field',
    seller_hash: '9173829104738291047382f91047d382910473829104738291047382field',
    category: 1, // Art
    token_type: TOKEN_TYPE.ALEO,
    auction_mode: AUCTION_MODE.VICKREY,
    status: STATUS.ACTIVE,
    deadline: 15200000,
    reveal_deadline: 15250000,
    bid_count: 4,
    reserve_price_hash: '3847291047382910a73f829104e738291047382910473829104738291field',
    created_at: 15100000,
    dispute_deadline: 0,
    title: 'Rare Aleo Genesis NFT #42',
    description: 'One of the first NFTs minted on Aleo testnet. Unique provenance with full privacy.',
  },
  {
    auction_id: '7291048573829104738291047382910473829104738291047382910473field',
    item_hash: '1048573829104738291047382910473829104738291047382910473829field',
    seller_hash: '2938471047382910473829104738291047382910473829104738291047field',
    category: 2, // Collectible
    token_type: TOKEN_TYPE.ALEO,
    auction_mode: AUCTION_MODE.FIRST_PRICE,
    status: STATUS.CLOSED,
    deadline: 15050000,
    reveal_deadline: 15100000,
    bid_count: 7,
    reserve_price_hash: '5829104738291047382910473829104738291047382910473829104738field',
    created_at: 14950000,
    dispute_deadline: 0,
    title: 'Premium Domain: privacy.aleo',
    description: 'Ultra-premium .aleo domain name. First-price sealed bid.',
  },
  {
    auction_id: '3847291047382910473829104738291047382910473829104738291048field',
    item_hash: '8291047382910473829104738291047382910473829104738291047382field',
    seller_hash: '4738291047382910473829104738291047382910473829104738291047field',
    category: 3, // Service
    token_type: TOKEN_TYPE.ALEO,
    auction_mode: AUCTION_MODE.VICKREY,
    status: STATUS.REVEALING,
    deadline: 15000000,
    reveal_deadline: 15150000,
    bid_count: 5,
    reserve_price_hash: '6738291047382910473829104738291047382910473829104738291047field',
    created_at: 14900000,
    dispute_deadline: 0,
    title: 'ZK Audit Package (40h)',
    description: 'Professional smart contract audit with zero-knowledge expertise. Vickrey pricing.',
  },
  {
    auction_id: '1938471047382910473829104738291047382910473829104738291047field',
    item_hash: '7382910473829104738291047382910473829104738291047382910473field',
    seller_hash: '8473829104738291047382910473829104738291047382910473829104field',
    category: 1, // Art
    token_type: TOKEN_TYPE.ALEO,
    auction_mode: AUCTION_MODE.VICKREY,
    status: STATUS.SETTLED,
    deadline: 14800000,
    reveal_deadline: 14850000,
    bid_count: 3,
    reserve_price_hash: '2847382910473829104738291047382910473829104738291047382910field',
    created_at: 14700000,
    dispute_deadline: 0,
    title: 'Abstract ZK Art #7',
    description: 'Generative artwork inspired by zero-knowledge proof circuits. Winner claimed via Vickrey 2nd-price.',
  },
  {
    auction_id: '5029384710473829104738291047382910473829104738291047382910field',
    item_hash: '3910473829104738291047382910473829104738291047382910473829field',
    seller_hash: '6473829104738291047382910473829104738291047382910473829104field',
    category: 4, // Other
    token_type: TOKEN_TYPE.USDCX,
    auction_mode: AUCTION_MODE.VICKREY,
    status: STATUS.ACTIVE,
    deadline: 15300000,
    reveal_deadline: 15350000,
    bid_count: 2,
    reserve_price_hash: '9382910473829104738291047382910473829104738291047382910473field',
    created_at: 15150000,
    dispute_deadline: 0,
    title: 'Exclusive Beta Access Pass',
    description: 'Early access to upcoming privacy DeFi protocol. USDCx bidding.',
  },
  {
    auction_id: '8192738461047382910473829104738291047382910473829104738291field',
    item_hash: '4910473829104738291047382910473829104738291047382910473829field',
    seller_hash: '7473829104738291047382910473829104738291047382910473829104field',
    category: 2, // Collectible
    token_type: TOKEN_TYPE.ALEO,
    auction_mode: AUCTION_MODE.FIRST_PRICE,
    status: STATUS.EXPIRED,
    deadline: 14600000,
    reveal_deadline: 14650000,
    bid_count: 0,
    reserve_price_hash: '1382910473829104738291047382910473829104738291047382910473field',
    created_at: 14500000,
    dispute_deadline: 0,
    title: 'Leo Programming Book (Signed)',
    description: 'First edition, signed by the author. Expired with no bids.',
  },
]
