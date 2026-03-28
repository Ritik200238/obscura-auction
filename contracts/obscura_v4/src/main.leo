// ============================================================================
// OBSCURA AUCTION v5 — Core Auction Protocol
// ============================================================================
// Four auction formats on Aleo: Sealed First-Price, Vickrey (2nd-price),
// Dutch (descending-price), and English (ascending-price).
//
// 31 transitions | 6 records | 22 mappings | 9 structs | 8-state machine
//
// AUCTION FORMATS:
//   1. First-Price Sealed-Bid: Commit-reveal. Winner pays own bid.
//   2. Vickrey Sealed-Bid: Commit-reveal. Winner pays second-highest bid.
//   3. Dutch (Descending): Price drops per block. First buyer wins instantly.
//   4. English (Ascending): Open ascending bids. Highest bidder at deadline wins.
//
// PRIVACY ARCHITECTURE:
// - Sealed-bid (First-Price/Vickrey):
//     place_bid: NO token transfer. Amounts hidden via BHP256 commitments.
//     reveal_bid: Tokens escrowed when amounts intentionally become public.
// - Dutch: Bidder identity private via records. Purchase price is public
//     (determined by block height — inherent to Dutch auction design).
// - English: Bid amounts public (ascending — the format requires it).
//     Bidder identity semi-private (revealed only via on-chain transfers).
// - All modes: Seller payout as private credits (ALEO) or public balance (USDCx).
//     Settlement proofs + payment proofs on-chain for all modes.
//
// DISPUTE RESOLUTION:
// - Any revealed bidder can dispute within DISPUTE_WINDOW blocks of settlement.
// - Disputer stakes a bond (10% of highest bid). Bond forfeited if dispute rejected.
// - Admin resolves: upheld → auction fails, all refund. Rejected → bond to treasury.
//
// Token support:
//   credits.aleo — ALEO private credits (private deposit/payout via records)
//   test_usdcx_stablecoin.aleo — USDCx stablecoin (public deposit/payout)
//   test_usad_stablecoin.aleo — USAD stablecoin (public deposit/payout)
// ALEO: transfer_private_to_public (deposit) | transfer_public_to_private (payout)
// USDCx/USAD: transfer_public_as_signer (deposit) | transfer_public (payout)
//
// Marketplace extensions (fixed sales, RFQ, token sales, provenance,
// timelocked results, forfeit, clean slate) live in obscura_market_v1.aleo.
// ============================================================================

import credits.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;

program obscura_v5.aleo {

    @noupgrade
    async constructor() {}

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Auction Status (8-state machine)
    const STATUS_ACTIVE: u8 = 1u8;
    const STATUS_CLOSED: u8 = 2u8;
    const STATUS_REVEALING: u8 = 3u8;
    const STATUS_SETTLED: u8 = 4u8;
    const STATUS_CANCELLED: u8 = 5u8;
    const STATUS_FAILED: u8 = 6u8;
    const STATUS_DISPUTED: u8 = 7u8;
    const STATUS_EXPIRED: u8 = 8u8;

    // Token Types
    const TOKEN_ALEO: u8 = 1u8;
    const TOKEN_USDCX: u8 = 2u8;
    const TOKEN_USAD: u8 = 3u8;

    // Auction Modes
    const MODE_FIRST_PRICE: u8 = 1u8;
    const MODE_VICKREY: u8 = 2u8;
    const MODE_DUTCH: u8 = 3u8;
    const MODE_ENGLISH: u8 = 4u8;

    // Fees (basis points: 100 = 1%)
    const PLATFORM_FEE_BPS: u128 = 100u128;
    const FEE_DENOMINATOR: u128 = 10000u128;

    // English auction: minimum bid increment over current highest (5%)
    const MIN_BID_INCREMENT_BPS: u128 = 500u128;

    // Timing (~15s blocks on Aleo)
    const REVEAL_WINDOW_BLOCKS: u64 = 2880u64;
    const MIN_AUCTION_DURATION: u64 = 240u64;
    const MIN_BID_AMOUNT: u128 = 1000u128;
    const SNIPE_WINDOW_BLOCKS: u64 = 40u64;
    const SNIPE_EXTENSION_BLOCKS: u64 = 40u64;

    // Dispute resolution
    const DISPUTE_WINDOW_BLOCKS: u64 = 100u64;
    const DISPUTE_BOND_MIN_BPS: u128 = 1000u128;

    // ========================================================================
    // RECORDS (6 — all private UTXO)
    // ========================================================================

    record SealedBid {
        owner: address,
        auction_id: field,
        bid_amount: u128,
        bid_nonce: field,
        token_type: u8,
    }

    record EscrowReceipt {
        owner: address,
        auction_id: field,
        escrowed_amount: u128,
        bid_nonce: field,
        token_type: u8,
    }

    record WinnerCertificate {
        owner: address,
        auction_id: field,
        item_hash: field,
        winning_amount: u128,
        token_type: u8,
        certificate_id: field,
    }

    record SellerReceipt {
        owner: address,
        auction_id: field,
        item_hash: field,
        sale_amount: u128,
        fee_paid: u128,
        token_type: u8,
    }

    record DisputeBond {
        owner: address,
        auction_id: field,
        bond_amount: u128,
    }

    // ViewPermit: Selective disclosure — winner grants an auditor permission
    // to see specific auction outcome details without revealing raw records.
    record ViewPermit {
        owner: address,
        auction_id: field,
        winning_price: u128,
        item_hash: field,
        settled_at: u64,
        granted_by: field,
    }

    // ========================================================================
    // STRUCTS
    // ========================================================================

    struct AuctionData {
        item_hash: field,
        seller_hash: field,
        category: u8,
        token_type: u8,
        auction_mode: u8,
        status: u8,
        deadline: u64,
        reveal_deadline: u64,
        bid_count: u64,
        reserve_price_hash: field,
        created_at: u64,
        dispute_deadline: u64,
    }

    struct AuctionSeed {
        creator: address,
        item_hash: field,
        deadline: u64,
        nonce: field,
    }

    struct BidCommitment {
        bidder: address,
        auction_id: field,
        amount: u128,
        nonce: field,
    }

    struct SettlementData {
        winner_bid_hash: field,
        final_price: u128,
        fee_collected: u128,
        settled_at: u64,
    }

    // SettlementProof: tamper-evident record of a settled auction result.
    struct SettlementProof {
        auction_id: field,
        highest_bid: u128,
        second_highest: u128,
        winner_bid_hash: field,
        settled_at: u64,
    }

    // PaymentCommitData: input to the payment commitment stored on-chain.
    struct PaymentCommitData {
        auction_id: field,
        bid_amount: u128,
        winner_bid_hash: field,
    }

    struct PlatformConfig {
        admin_hash: field,
        fee_bps: u128,
        dispute_bond_bps: u128,
        paused: bool,
    }

    // DutchConfig: descending-price auction parameters.
    struct DutchConfig {
        start_price: u128,
        end_price: u128,
    }

    // DisputeData: records who disputed an auction and their bond.
    struct DisputeData {
        disputer_hash: field,
        bond_amount: u128,
        reason_hash: field,
        filed_at: u64,
    }

    // ========================================================================
    // MAPPINGS (22 — under 31 limit)
    // ========================================================================

    mapping auctions: field => AuctionData;
    mapping bid_commitments: field => bool;
    mapping revealed_bids: field => u128;
    mapping highest_bids: field => u128;
    mapping second_highest_bids: field => u128;
    mapping auction_winners: field => field;
    mapping program_balance: u8 => u128;
    mapping auction_escrow: field => u128;
    mapping platform_treasury: u8 => u128;
    mapping settlements: field => SettlementData;
    mapping platform_config: u8 => PlatformConfig;
    // settlement_proofs: publicly verifiable proof of fair auction outcome.
    mapping settlement_proofs: field => field;
    // payment_proofs: publicly verifiable payment commitment for the winner.
    mapping payment_proofs: field => field;
    // dutch_params: descending-price schedule for Dutch auctions.
    mapping dutch_params: field => DutchConfig;
    // disputes: active dispute records for settled auctions.
    mapping disputes: field => DisputeData;
    // dispute_bonds: ALEO bond amount held per disputed auction.
    mapping dispute_bonds: field => u128;

    // ---- Wave 4 mappings ----
    // scheduled_start: auction_id => start_block (0 means no schedule / immediate).
    mapping scheduled_start: field => u64;
    // seller_completed: seller_hash => completed auction count.
    mapping seller_completed: field => u64;
    // seller_disputed: seller_hash => disputed auction count.
    mapping seller_disputed: field => u64;
    // royalty_info: auction_id => creator_address_hash.
    mapping royalty_info: field => field;
    // royalty_bps: auction_id => royalty basis points (max 1000 = 10%).
    mapping royalty_bps: field => u128;
    // royalty_balances: auction_id => unclaimed royalty amount.
    mapping royalty_balances: field => u128;

    // ########################################################################
    //                         T1: INITIALIZE PLATFORM
    // ########################################################################

    async transition initialize_platform(
        private admin_address: address,
        private fee_bps: u128,
        private bond_bps: u128
    ) -> Future {
        let admin_field: field = admin_address as field;
        let admin_hash: field = BHP256::hash_to_field(admin_field);
        return finalize_init(admin_hash, fee_bps, bond_bps);
    }

    async function finalize_init(
        admin_hash: field,
        fee_bps: u128,
        bond_bps: u128
    ) {
        let already_init: bool = platform_config.contains(0u8);
        assert(!already_init);

        platform_config.set(0u8, PlatformConfig {
            admin_hash: admin_hash,
            fee_bps: fee_bps,
            dispute_bond_bps: bond_bps,
            paused: false,
        });
    }

    // ########################################################################
    //              T2: CREATE AUCTION (unified — both ALEO and USDCx)
    // ########################################################################

    async transition create_auction(
        private item_hash: field,
        private category: u8,
        private reserve_price: u128,
        private auction_mode: u8,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64
    ) -> (field, Future) {
        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

        assert(auction_mode == MODE_FIRST_PRICE || auction_mode == MODE_VICKREY || auction_mode == MODE_ENGLISH);
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX || token_type == TOKEN_USAD);
        if (token_type == TOKEN_USAD) {
            assert_eq(auction_mode, MODE_FIRST_PRICE);
        }
        if (auction_mode == MODE_ENGLISH) {
            assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX);
        }

        return (auction_id, finalize_create_auction(
            auction_id, item_hash, seller_hash, category,
            token_type, auction_mode, deadline, reserve_hash
        ));
    }

    async function finalize_create_auction(
        auction_id: field,
        item_hash: field,
        seller_hash: field,
        category: u8,
        token_type: u8,
        auction_mode: u8,
        deadline: u64,
        reserve_hash: field
    ) {
        let exists: bool = auctions.contains(auction_id);
        assert(!exists);

        let current_height: u64 = block.height as u64;
        assert(deadline > current_height + MIN_AUCTION_DURATION);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        auctions.set(auction_id, AuctionData {
            item_hash: item_hash,
            seller_hash: seller_hash,
            category: category,
            token_type: token_type,
            auction_mode: auction_mode,
            status: STATUS_ACTIVE,
            deadline: deadline,
            reveal_deadline: 0u64,
            bid_count: 0u64,
            reserve_price_hash: reserve_hash,
            created_at: current_height,
            dispute_deadline: 0u64,
        });
    }

    // ########################################################################
    //              T3: CANCEL AUCTION
    // ########################################################################

    async transition cancel_auction(
        private auction_id: field
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return finalize_cancel_auction(auction_id, caller_hash);
    }

    async function finalize_cancel_auction(
        auction_id: field,
        caller_hash: field
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.seller_hash, caller_hash);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert_eq(auction.bid_count, 0u64);

        auctions.set(auction_id, AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            auction_mode: auction.auction_mode,
            status: STATUS_CANCELLED,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        });
    }

    // ########################################################################
    //              T4: CLOSE BIDDING
    // ########################################################################

    async transition close_bidding(
        private auction_id: field
    ) -> Future {
        return finalize_close_bidding(auction_id);
    }

    async function finalize_close_bidding(
        auction_id: field
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert(auction.auction_mode == MODE_FIRST_PRICE || auction.auction_mode == MODE_VICKREY);

        let current_height: u64 = block.height as u64;
        assert(current_height >= auction.deadline);

        if (auction.bid_count == 0u64) {
            auctions.set(auction_id, AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                auction_mode: auction.auction_mode,
                status: STATUS_EXPIRED,
                deadline: auction.deadline,
                reveal_deadline: auction.reveal_deadline,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: auction.dispute_deadline,
            });
        } else {
            auctions.set(auction_id, AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                auction_mode: auction.auction_mode,
                status: STATUS_REVEALING,
                deadline: auction.deadline,
                reveal_deadline: current_height + REVEAL_WINDOW_BLOCKS,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: auction.dispute_deadline,
            });
        }
    }

    // ########################################################################
    //              T5: PLACE BID — COMMITMENT ONLY (no token transfer)
    // ########################################################################

    async transition place_bid(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private token_type: u8
    ) -> (SealedBid, Future) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX || token_type == TOKEN_USAD);

        let sealed: SealedBid = SealedBid {
            owner: self.caller,
            auction_id: auction_id,
            bid_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: token_type,
        };

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        return (sealed, finalize_place_bid(auction_id, bid_hash, token_type));
    }

    async function finalize_place_bid(
        auction_id: field,
        bid_hash: field,
        token_type: u8
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert_eq(auction.token_type, token_type);
        assert(auction.auction_mode == MODE_FIRST_PRICE || auction.auction_mode == MODE_VICKREY);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.deadline);

        // Scheduled start check: if a start_block is set, bidding cannot begin before it.
        let start: u64 = scheduled_start.get_or_use(auction_id, 0u64);
        assert(current_height >= start);

        let already_exists: bool = bid_commitments.contains(bid_hash);
        assert(!already_exists);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        bid_commitments.set(bid_hash, true);

        auctions.set(auction_id, AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            auction_mode: auction.auction_mode,
            status: auction.status,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count + 1u64,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        });
    }

    // ########################################################################
    //              T6: REVEAL BID + ESCROW — ALEO credits
    // ########################################################################

    async transition reveal_bid(
        private bid: SealedBid,
        private credits_in: credits.aleo/credits
    ) -> (EscrowReceipt, credits.aleo/credits, Future) {
        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: bid.owner,
            auction_id: bid.auction_id,
            amount: bid.bid_amount,
            nonce: bid.bid_nonce,
        });

        let amount_u64: u64 = bid.bid_amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: bid.owner,
            auction_id: bid.auction_id,
            escrowed_amount: bid.bid_amount,
            bid_nonce: bid.bid_nonce,
            token_type: TOKEN_ALEO,
        };

        return (receipt, change, finalize_reveal_bid(
            transfer_future, bid.auction_id, bid_hash, bid.bid_amount
        ));
    }

    async function finalize_reveal_bid(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_REVEALING);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.reveal_deadline);

        let committed: bool = bid_commitments.get(bid_hash);
        assert(committed);

        let already_revealed: bool = revealed_bids.contains(bid_hash);
        assert(!already_revealed);

        revealed_bids.set(bid_hash, amount);

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + amount);

        let current_bal: u128 = program_balance.get_or_use(0u8, 0u128);
        program_balance.set(0u8, current_bal + amount);

        let current_high: u128 = highest_bids.get_or_use(auction_id, 0u128);
        let current_second: u128 = second_highest_bids.get_or_use(auction_id, 0u128);

        if (amount > current_high) {
            second_highest_bids.set(auction_id, current_high);
            highest_bids.set(auction_id, amount);
            auction_winners.set(auction_id, bid_hash);
        } else {
            if (amount > current_second) {
                second_highest_bids.set(auction_id, amount);
            }
        }
    }

    // ########################################################################
    //              T7: REVEAL BID + ESCROW — USDCx version
    // ########################################################################

    async transition reveal_bid_usdcx(
        private bid: SealedBid
    ) -> (EscrowReceipt, Future) {
        assert_eq(bid.token_type, TOKEN_USDCX);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: bid.owner,
            auction_id: bid.auction_id,
            amount: bid.bid_amount,
            nonce: bid.bid_nonce,
        });

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            bid.bid_amount
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: bid.owner,
            auction_id: bid.auction_id,
            escrowed_amount: bid.bid_amount,
            bid_nonce: bid.bid_nonce,
            token_type: TOKEN_USDCX,
        };

        return (receipt, finalize_reveal_bid_usdcx(
            transfer_future, bid.auction_id, bid_hash, bid.bid_amount
        ));
    }

    async function finalize_reveal_bid_usdcx(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_REVEALING);
        assert_eq(auction.token_type, TOKEN_USDCX);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.reveal_deadline);

        let committed: bool = bid_commitments.get(bid_hash);
        assert(committed);

        let already_revealed: bool = revealed_bids.contains(bid_hash);
        assert(!already_revealed);

        revealed_bids.set(bid_hash, amount);

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + amount);

        // USDCx balance tracked under key 1u8 (ALEO = 0u8)
        let current_bal: u128 = program_balance.get_or_use(1u8, 0u128);
        program_balance.set(1u8, current_bal + amount);

        let current_high: u128 = highest_bids.get_or_use(auction_id, 0u128);
        let current_second: u128 = second_highest_bids.get_or_use(auction_id, 0u128);

        if (amount > current_high) {
            second_highest_bids.set(auction_id, current_high);
            highest_bids.set(auction_id, amount);
            auction_winners.set(auction_id, bid_hash);
        } else {
            if (amount > current_second) {
                second_highest_bids.set(auction_id, amount);
            }
        }
    }

    // ########################################################################
    //              T8: REVEAL BID + ESCROW — USAD version
    // ########################################################################

    async transition reveal_bid_usad(
        private bid: SealedBid
    ) -> (EscrowReceipt, Future) {
        assert_eq(bid.token_type, TOKEN_USAD);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: bid.owner,
            auction_id: bid.auction_id,
            amount: bid.bid_amount,
            nonce: bid.bid_nonce,
        });

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            bid.bid_amount
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: bid.owner,
            auction_id: bid.auction_id,
            escrowed_amount: bid.bid_amount,
            bid_nonce: bid.bid_nonce,
            token_type: TOKEN_USAD,
        };

        return (receipt, finalize_reveal_bid_usad(
            transfer_future, bid.auction_id, bid_hash, bid.bid_amount
        ));
    }

    async function finalize_reveal_bid_usad(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_REVEALING);
        assert_eq(auction.token_type, TOKEN_USAD);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.reveal_deadline);

        let committed: bool = bid_commitments.get(bid_hash);
        assert(committed);

        let already_revealed: bool = revealed_bids.contains(bid_hash);
        assert(!already_revealed);

        revealed_bids.set(bid_hash, amount);

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + amount);

        // USAD balance tracked under key 2u8
        let current_bal: u128 = program_balance.get_or_use(2u8, 0u128);
        program_balance.set(2u8, current_bal + amount);

        let current_high: u128 = highest_bids.get_or_use(auction_id, 0u128);
        let current_second: u128 = second_highest_bids.get_or_use(auction_id, 0u128);

        if (amount > current_high) {
            second_highest_bids.set(auction_id, current_high);
            highest_bids.set(auction_id, amount);
            auction_winners.set(auction_id, bid_hash);
        } else {
            if (amount > current_second) {
                second_highest_bids.set(auction_id, amount);
            }
        }
    }

    // ########################################################################
    //              T9: FINALIZE AUCTION (unified — seller calls)
    // ########################################################################

    async transition finalize_auction(
        private auction_id: field,
        private reserve_price: u128
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        return do_finalize_auction(auction_id, caller_hash, reserve_hash, reserve_price);
    }

    async function do_finalize_auction(
        auction_id: field,
        caller_hash: field,
        reserve_hash: field,
        reserve_price: u128
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.seller_hash, caller_hash);
        assert_eq(auction.status, STATUS_REVEALING);

        let current_height: u64 = block.height as u64;
        assert(current_height > auction.reveal_deadline);

        assert_eq(reserve_hash, auction.reserve_price_hash);

        let winning_amount: u128 = highest_bids.get_or_use(auction_id, 0u128);
        let winner_bid_hash: field = auction_winners.get_or_use(auction_id, 0field);
        let second_price: u128 = second_highest_bids.get_or_use(auction_id, 0u128);

        if (auction.auction_mode == MODE_VICKREY) {
            if (second_price == 0u128) {
                auctions.set(auction_id, AuctionData {
                    item_hash: auction.item_hash,
                    seller_hash: auction.seller_hash,
                    category: auction.category,
                    token_type: auction.token_type,
                    auction_mode: auction.auction_mode,
                    status: STATUS_FAILED,
                    deadline: auction.deadline,
                    reveal_deadline: auction.reveal_deadline,
                    bid_count: auction.bid_count,
                    reserve_price_hash: auction.reserve_price_hash,
                    created_at: auction.created_at,
                    dispute_deadline: auction.dispute_deadline,
                });
            } else {
                if (winning_amount >= reserve_price) {
                    auctions.set(auction_id, AuctionData {
                        item_hash: auction.item_hash,
                        seller_hash: auction.seller_hash,
                        category: auction.category,
                        token_type: auction.token_type,
                        auction_mode: auction.auction_mode,
                        status: STATUS_SETTLED,
                        deadline: auction.deadline,
                        reveal_deadline: auction.reveal_deadline,
                        bid_count: auction.bid_count,
                        reserve_price_hash: auction.reserve_price_hash,
                        created_at: auction.created_at,
                        dispute_deadline: 0u64,
                    });
                    let settlement_proof: field = BHP256::hash_to_field(SettlementProof {
                        auction_id: auction_id,
                        highest_bid: winning_amount,
                        second_highest: second_price,
                        winner_bid_hash: winner_bid_hash,
                        settled_at: current_height,
                    });
                    settlement_proofs.set(auction_id, settlement_proof);

                    // Reputation: increment seller completed count.
                    let scount: u64 = seller_completed.get_or_use(auction.seller_hash, 0u64);
                    seller_completed.set(auction.seller_hash, scount + 1u64);

                    // Royalty: if royalty is configured, calculate and store royalty balance.
                    let has_royalty: bool = royalty_info.contains(auction_id);
                    if (has_royalty) {
                        let rbps: u128 = royalty_bps.get(auction_id);
                        let royalty_amount: u128 = (winning_amount * rbps) / 10000u128;
                        royalty_balances.set(auction_id, royalty_amount);
                    }
                } else {
                    auctions.set(auction_id, AuctionData {
                        item_hash: auction.item_hash,
                        seller_hash: auction.seller_hash,
                        category: auction.category,
                        token_type: auction.token_type,
                        auction_mode: auction.auction_mode,
                        status: STATUS_FAILED,
                        deadline: auction.deadline,
                        reveal_deadline: auction.reveal_deadline,
                        bid_count: auction.bid_count,
                        reserve_price_hash: auction.reserve_price_hash,
                        created_at: auction.created_at,
                        dispute_deadline: 0u64,
                    });
                }
            }
        } else {
            // First-price mode
            if (winning_amount >= reserve_price && winning_amount > 0u128) {
                auctions.set(auction_id, AuctionData {
                    item_hash: auction.item_hash,
                    seller_hash: auction.seller_hash,
                    category: auction.category,
                    token_type: auction.token_type,
                    auction_mode: auction.auction_mode,
                    status: STATUS_SETTLED,
                    deadline: auction.deadline,
                    reveal_deadline: auction.reveal_deadline,
                    bid_count: auction.bid_count,
                    reserve_price_hash: auction.reserve_price_hash,
                    created_at: auction.created_at,
                    dispute_deadline: 0u64,
                });
                let settlement_proof: field = BHP256::hash_to_field(SettlementProof {
                    auction_id: auction_id,
                    highest_bid: winning_amount,
                    second_highest: second_price,
                    winner_bid_hash: winner_bid_hash,
                    settled_at: current_height,
                });
                settlement_proofs.set(auction_id, settlement_proof);

                // Reputation: increment seller completed count.
                let scount2: u64 = seller_completed.get_or_use(auction.seller_hash, 0u64);
                seller_completed.set(auction.seller_hash, scount2 + 1u64);

                // Royalty: if royalty is configured, calculate and store royalty balance.
                let has_royalty2: bool = royalty_info.contains(auction_id);
                if (has_royalty2) {
                    let rbps2: u128 = royalty_bps.get(auction_id);
                    let royalty_amount2: u128 = (winning_amount * rbps2) / 10000u128;
                    royalty_balances.set(auction_id, royalty_amount2);
                }
            } else {
                auctions.set(auction_id, AuctionData {
                    item_hash: auction.item_hash,
                    seller_hash: auction.seller_hash,
                    category: auction.category,
                    token_type: auction.token_type,
                    auction_mode: auction.auction_mode,
                    status: STATUS_FAILED,
                    deadline: auction.deadline,
                    reveal_deadline: auction.reveal_deadline,
                    bid_count: auction.bid_count,
                    reserve_price_hash: auction.reserve_price_hash,
                    created_at: auction.created_at,
                    dispute_deadline: auction.dispute_deadline,
                });
            }
        }
    }

    // ########################################################################
    //              T10: CLAIM WIN — first-price settlement (ALEO)
    // ########################################################################

    async transition claim_win(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field
    ) -> (WinnerCertificate, SellerReceipt, credits.aleo/credits, Future) {
        assert_eq(receipt.token_type, TOKEN_ALEO);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: receipt.owner,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        let fee: u128 = (receipt.escrowed_amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = receipt.escrowed_amount - fee;
        let payout_u64: u64 = seller_payout as u64;

        let (seller_credits, pay_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                seller_address,
                payout_u64
            );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(receipt.bid_nonce);
        let amount_field: field = receipt.escrowed_amount as field;
        let payment_commitment: field = BHP256::commit_to_field(amount_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            winning_amount: receipt.escrowed_amount,
            token_type: TOKEN_ALEO,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_ALEO,
        };

        return (cert, seller_receipt, seller_credits, finalize_claim_win(
            pay_future, receipt.auction_id, bid_hash, receipt.escrowed_amount, fee, item_hash, payment_commitment
        ));
    }

    async function finalize_claim_win(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        bid_amount: u128,
        fee: u128,
        item_hash: field,
        payment_commitment: field
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_SETTLED);

        if (auction.auction_mode == MODE_VICKREY || auction.auction_mode == MODE_DUTCH) {
            let highest: u128 = highest_bids.get(auction_id);
            let second: u128 = second_highest_bids.get(auction_id);
            assert_eq(highest, second);
        }

        let winner_hash: field = auction_winners.get(auction_id);
        assert_eq(bid_hash, winner_hash);

        let revealed_amount: u128 = revealed_bids.get(bid_hash);
        assert_eq(revealed_amount, bid_amount);

        assert_eq(item_hash, auction.item_hash);

        let already_settled: bool = settlements.contains(auction_id);
        assert(!already_settled);
        settlements.set(auction_id, SettlementData {
            winner_bid_hash: bid_hash,
            final_price: bid_amount,
            fee_collected: fee,
            settled_at: block.height as u64,
        });

        payment_proofs.set(auction_id, payment_commitment);

        let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
        platform_treasury.set(0u8, treasury + fee);

        let bal: u128 = program_balance.get(0u8);
        program_balance.set(0u8, bal - bid_amount);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - bid_amount);
    }

    // ########################################################################
    //              T11: CLAIM WIN — USDCx first-price settlement
    // ########################################################################

    async transition claim_win_usdcx(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field
    ) -> (WinnerCertificate, SellerReceipt, Future) {
        assert_eq(receipt.token_type, TOKEN_USDCX);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: receipt.owner,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        let fee: u128 = (receipt.escrowed_amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = receipt.escrowed_amount - fee;

        let pay_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
            seller_address,
            seller_payout
        );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(receipt.bid_nonce);
        let amount_field: field = receipt.escrowed_amount as field;
        let payment_commitment: field = BHP256::commit_to_field(amount_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            winning_amount: receipt.escrowed_amount,
            token_type: TOKEN_USDCX,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_USDCX,
        };

        return (cert, seller_receipt, finalize_claim_win_usdcx(
            pay_future, receipt.auction_id, bid_hash, receipt.escrowed_amount, fee, item_hash, payment_commitment
        ));
    }

    async function finalize_claim_win_usdcx(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        bid_amount: u128,
        fee: u128,
        item_hash: field,
        payment_commitment: field
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_SETTLED);
        assert_eq(auction.token_type, TOKEN_USDCX);

        if (auction.auction_mode == MODE_VICKREY || auction.auction_mode == MODE_DUTCH) {
            let highest: u128 = highest_bids.get(auction_id);
            let second: u128 = second_highest_bids.get(auction_id);
            assert_eq(highest, second);
        }

        let winner_hash: field = auction_winners.get(auction_id);
        assert_eq(bid_hash, winner_hash);

        let revealed_amount: u128 = revealed_bids.get(bid_hash);
        assert_eq(revealed_amount, bid_amount);

        assert_eq(item_hash, auction.item_hash);

        let already_settled: bool = settlements.contains(auction_id);
        assert(!already_settled);
        settlements.set(auction_id, SettlementData {
            winner_bid_hash: bid_hash,
            final_price: bid_amount,
            fee_collected: fee,
            settled_at: block.height as u64,
        });

        payment_proofs.set(auction_id, payment_commitment);

        let treasury: u128 = platform_treasury.get_or_use(1u8, 0u128);
        platform_treasury.set(1u8, treasury + fee);

        let bal: u128 = program_balance.get(1u8);
        program_balance.set(1u8, bal - bid_amount);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - bid_amount);
    }

    // ########################################################################
    //              T12: CLAIM WIN — USAD first-price settlement
    // ########################################################################

    async transition claim_win_usad(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field
    ) -> (WinnerCertificate, SellerReceipt, Future) {
        assert_eq(receipt.token_type, TOKEN_USAD);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: receipt.owner,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        let fee: u128 = (receipt.escrowed_amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = receipt.escrowed_amount - fee;

        let pay_future: Future = test_usad_stablecoin.aleo/transfer_public(
            seller_address,
            seller_payout
        );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(receipt.bid_nonce);
        let amount_field: field = receipt.escrowed_amount as field;
        let payment_commitment: field = BHP256::commit_to_field(amount_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            winning_amount: receipt.escrowed_amount,
            token_type: TOKEN_USAD,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_USAD,
        };

        return (cert, seller_receipt, finalize_claim_win_usad(
            pay_future, receipt.auction_id, bid_hash, receipt.escrowed_amount, fee, item_hash, payment_commitment
        ));
    }

    async function finalize_claim_win_usad(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        bid_amount: u128,
        fee: u128,
        item_hash: field,
        payment_commitment: field
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_SETTLED);
        assert_eq(auction.token_type, TOKEN_USAD);

        if (auction.auction_mode == MODE_VICKREY || auction.auction_mode == MODE_DUTCH) {
            let highest: u128 = highest_bids.get(auction_id);
            let second: u128 = second_highest_bids.get(auction_id);
            assert_eq(highest, second);
        }

        let winner_hash: field = auction_winners.get(auction_id);
        assert_eq(bid_hash, winner_hash);

        let revealed_amount: u128 = revealed_bids.get(bid_hash);
        assert_eq(revealed_amount, bid_amount);

        assert_eq(item_hash, auction.item_hash);

        let already_settled: bool = settlements.contains(auction_id);
        assert(!already_settled);
        settlements.set(auction_id, SettlementData {
            winner_bid_hash: bid_hash,
            final_price: bid_amount,
            fee_collected: fee,
            settled_at: block.height as u64,
        });

        payment_proofs.set(auction_id, payment_commitment);

        // USAD treasury tracked under key 2u8
        let treasury: u128 = platform_treasury.get_or_use(2u8, 0u128);
        platform_treasury.set(2u8, treasury + fee);

        let bal: u128 = program_balance.get(2u8);
        program_balance.set(2u8, bal - bid_amount);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - bid_amount);
    }

    // ########################################################################
    //              T13: CLAIM WIN VICKREY — winner pays second-highest (ALEO)
    // ########################################################################

    async transition claim_win_vickrey(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field,
        private claimed_second_price: u128
    ) -> (WinnerCertificate, SellerReceipt, credits.aleo/credits, credits.aleo/credits, Future) {
        assert_eq(receipt.token_type, TOKEN_ALEO);

        assert(receipt.escrowed_amount > claimed_second_price);
        assert(claimed_second_price > 0u128);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: receipt.owner,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        let fee: u128 = (claimed_second_price * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = claimed_second_price - fee;
        let winner_change: u128 = receipt.escrowed_amount - claimed_second_price;

        let seller_payout_u64: u64 = seller_payout as u64;
        let winner_change_u64: u64 = winner_change as u64;

        let (seller_credits, pay_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                seller_address,
                seller_payout_u64
            );

        let (winner_change_credits, change_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                receipt.owner,
                winner_change_u64
            );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(receipt.bid_nonce);
        let payment_field: field = claimed_second_price as field;
        let payment_commitment: field = BHP256::commit_to_field(payment_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            winning_amount: claimed_second_price,
            token_type: TOKEN_ALEO,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_ALEO,
        };

        return (cert, seller_receipt, seller_credits, winner_change_credits, finalize_claim_win_vickrey(
            pay_future, change_future,
            receipt.auction_id, bid_hash,
            receipt.escrowed_amount, claimed_second_price,
            fee, item_hash, payment_commitment
        ));
    }

    async function finalize_claim_win_vickrey(
        f0: Future,
        f1: Future,
        auction_id: field,
        bid_hash: field,
        escrowed_amount: u128,
        claimed_second_price: u128,
        fee: u128,
        item_hash: field,
        payment_commitment: field
    ) {
        f0.await();
        f1.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_SETTLED);
        assert(auction.auction_mode == MODE_VICKREY || auction.auction_mode == MODE_DUTCH);

        let actual_second: u128 = second_highest_bids.get(auction_id);
        assert_eq(claimed_second_price, actual_second);

        let winner_hash: field = auction_winners.get(auction_id);
        assert_eq(bid_hash, winner_hash);

        let revealed_amount: u128 = revealed_bids.get(bid_hash);
        assert_eq(revealed_amount, escrowed_amount);

        assert_eq(item_hash, auction.item_hash);

        let already_settled: bool = settlements.contains(auction_id);
        assert(!already_settled);
        settlements.set(auction_id, SettlementData {
            winner_bid_hash: bid_hash,
            final_price: claimed_second_price,
            fee_collected: fee,
            settled_at: block.height as u64,
        });

        payment_proofs.set(auction_id, payment_commitment);

        let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
        platform_treasury.set(0u8, treasury + fee);

        let bal: u128 = program_balance.get(0u8);
        program_balance.set(0u8, bal - escrowed_amount);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - escrowed_amount);
    }

    // ########################################################################
    //              T14: CLAIM WIN VICKREY — USDCx version
    // ########################################################################

    async transition claim_win_vickrey_usdcx(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field,
        private claimed_second_price: u128
    ) -> (WinnerCertificate, SellerReceipt, Future) {
        assert_eq(receipt.token_type, TOKEN_USDCX);

        assert(receipt.escrowed_amount > claimed_second_price);
        assert(claimed_second_price > 0u128);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: receipt.owner,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        let fee: u128 = (claimed_second_price * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = claimed_second_price - fee;
        let winner_change: u128 = receipt.escrowed_amount - claimed_second_price;

        let pay_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
            seller_address,
            seller_payout
        );

        let change_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
            receipt.owner,
            winner_change
        );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(receipt.bid_nonce);
        let payment_field: field = claimed_second_price as field;
        let payment_commitment: field = BHP256::commit_to_field(payment_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            winning_amount: claimed_second_price,
            token_type: TOKEN_USDCX,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: receipt.auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_USDCX,
        };

        return (cert, seller_receipt, finalize_claim_vickrey_usdcx(
            pay_future, change_future,
            receipt.auction_id, bid_hash,
            receipt.escrowed_amount, claimed_second_price,
            fee, item_hash, payment_commitment
        ));
    }

    async function finalize_claim_vickrey_usdcx(
        f0: Future,
        f1: Future,
        auction_id: field,
        bid_hash: field,
        escrowed_amount: u128,
        claimed_second_price: u128,
        fee: u128,
        item_hash: field,
        payment_commitment: field
    ) {
        f0.await();
        f1.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_SETTLED);
        assert(auction.auction_mode == MODE_VICKREY || auction.auction_mode == MODE_DUTCH);
        assert_eq(auction.token_type, TOKEN_USDCX);

        let actual_second: u128 = second_highest_bids.get(auction_id);
        assert_eq(claimed_second_price, actual_second);

        let winner_hash: field = auction_winners.get(auction_id);
        assert_eq(bid_hash, winner_hash);

        let revealed_amount: u128 = revealed_bids.get(bid_hash);
        assert_eq(revealed_amount, escrowed_amount);

        assert_eq(item_hash, auction.item_hash);

        let already_settled: bool = settlements.contains(auction_id);
        assert(!already_settled);
        settlements.set(auction_id, SettlementData {
            winner_bid_hash: bid_hash,
            final_price: claimed_second_price,
            fee_collected: fee,
            settled_at: block.height as u64,
        });

        payment_proofs.set(auction_id, payment_commitment);

        let treasury: u128 = platform_treasury.get_or_use(1u8, 0u128);
        platform_treasury.set(1u8, treasury + fee);

        let bal: u128 = program_balance.get(1u8);
        program_balance.set(1u8, bal - escrowed_amount);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - escrowed_amount);
    }

    // ########################################################################
    //              T15: CLAIM REFUND (ALEO)
    // ########################################################################

    async transition claim_refund(
        private receipt: EscrowReceipt
    ) -> (credits.aleo/credits, Future) {
        assert_eq(receipt.token_type, TOKEN_ALEO);

        let refund_u64: u64 = receipt.escrowed_amount as u64;

        let (refund_credits, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                self.caller,
                refund_u64
            );

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        return (refund_credits, finalize_claim_refund(
            transfer_future, receipt.auction_id, bid_hash,
            receipt.escrowed_amount, TOKEN_ALEO
        ));
    }

    async function finalize_claim_refund(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        amount: u128,
        token_type: u8
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert(
            auction.status == STATUS_SETTLED
            || auction.status == STATUS_FAILED
            || auction.status == STATUS_CANCELLED
            || auction.status == STATUS_EXPIRED
        );

        let winner: field = auction_winners.get_or_use(auction_id, 0field);
        assert_neq(bid_hash, winner);

        let escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        let new_escrow: u128 = escrow > amount ? escrow - amount : 0u128;
        auction_escrow.set(auction_id, new_escrow);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8
            : token_type == TOKEN_USDCX ? 1u8 : 2u8;
        let bal: u128 = program_balance.get_or_use(credit_key, 0u128);
        let new_bal: u128 = bal > amount ? bal - amount : 0u128;
        program_balance.set(credit_key, new_bal);
    }

    // ########################################################################
    //              T16: CLAIM REFUND — USDCx version
    // ########################################################################

    async transition claim_refund_usdcx(
        private receipt: EscrowReceipt
    ) -> Future {
        assert_eq(receipt.token_type, TOKEN_USDCX);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
            self.caller,
            receipt.escrowed_amount
        );

        return finalize_claim_refund_usdcx(
            transfer_future, receipt.auction_id, bid_hash,
            receipt.escrowed_amount
        );
    }

    async function finalize_claim_refund_usdcx(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert(
            auction.status == STATUS_SETTLED
            || auction.status == STATUS_FAILED
            || auction.status == STATUS_CANCELLED
            || auction.status == STATUS_EXPIRED
        );
        assert_eq(auction.token_type, TOKEN_USDCX);

        let winner: field = auction_winners.get_or_use(auction_id, 0field);
        assert_neq(bid_hash, winner);

        let escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        let new_escrow: u128 = escrow > amount ? escrow - amount : 0u128;
        auction_escrow.set(auction_id, new_escrow);

        let bal: u128 = program_balance.get_or_use(1u8, 0u128);
        let new_bal: u128 = bal > amount ? bal - amount : 0u128;
        program_balance.set(1u8, new_bal);
    }

    // ########################################################################
    //              T17: CLAIM REFUND — USAD version
    // ########################################################################

    async transition claim_refund_usad(
        private receipt: EscrowReceipt
    ) -> Future {
        assert_eq(receipt.token_type, TOKEN_USAD);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(
            self.caller,
            receipt.escrowed_amount
        );

        return finalize_claim_refund_usad(
            transfer_future, receipt.auction_id, bid_hash,
            receipt.escrowed_amount
        );
    }

    async function finalize_claim_refund_usad(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert(
            auction.status == STATUS_SETTLED
            || auction.status == STATUS_FAILED
            || auction.status == STATUS_CANCELLED
            || auction.status == STATUS_EXPIRED
        );
        assert_eq(auction.token_type, TOKEN_USAD);

        let winner: field = auction_winners.get_or_use(auction_id, 0field);
        assert_neq(bid_hash, winner);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - amount);

        let bal: u128 = program_balance.get(2u8);
        program_balance.set(2u8, bal - amount);
    }

    // ########################################################################
    //              T18: PROVE WON AUCTION — Selective Disclosure
    // ########################################################################

    transition prove_won_auction(
        private cert: WinnerCertificate,
        public auction_id: field
    ) -> (WinnerCertificate, bool) {
        assert_eq(cert.auction_id, auction_id);
        return (cert, true);
    }

    // ########################################################################
    //              T19: CREATE DUTCH AUCTION
    // ########################################################################

    async transition create_dutch_auction(
        private item_hash: field,
        private category: u8,
        private start_price: u128,
        private end_price: u128,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64
    ) -> (field, Future) {
        assert(start_price > end_price);
        assert(end_price >= MIN_BID_AMOUNT);
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX);

        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let end_field: field = end_price as field;
        let reserve_hash: field = BHP256::hash_to_field(end_field);

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

        return (auction_id, finalize_create_dutch(
            auction_id, item_hash, seller_hash, category,
            token_type, deadline, reserve_hash,
            start_price, end_price
        ));
    }

    async function finalize_create_dutch(
        auction_id: field,
        item_hash: field,
        seller_hash: field,
        category: u8,
        token_type: u8,
        deadline: u64,
        reserve_hash: field,
        start_price: u128,
        end_price: u128
    ) {
        let exists: bool = auctions.contains(auction_id);
        assert(!exists);

        let current_height: u64 = block.height as u64;
        assert(deadline > current_height + MIN_AUCTION_DURATION);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        auctions.set(auction_id, AuctionData {
            item_hash: item_hash,
            seller_hash: seller_hash,
            category: category,
            token_type: token_type,
            auction_mode: MODE_DUTCH,
            status: STATUS_ACTIVE,
            deadline: deadline,
            reveal_deadline: 0u64,
            bid_count: 0u64,
            reserve_price_hash: reserve_hash,
            created_at: current_height,
            dispute_deadline: 0u64,
        });

        dutch_params.set(auction_id, DutchConfig {
            start_price: start_price,
            end_price: end_price,
        });
    }

    // ########################################################################
    //              T20: DUTCH BID — ALEO credits (instant settlement)
    // ########################################################################

    async transition bid_dutch(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private credits_in: credits.aleo/credits
    ) -> (EscrowReceipt, credits.aleo/credits, Future) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let amount_u64: u64 = bid_amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_ALEO,
        };

        return (receipt, change, finalize_bid_dutch(
            transfer_future, auction_id, bid_hash, bid_amount
        ));
    }

    async function finalize_bid_dutch(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        bid_amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert_eq(auction.auction_mode, MODE_DUTCH);
        assert_eq(auction.token_type, TOKEN_ALEO);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.deadline);

        // Scheduled start check.
        let start: u64 = scheduled_start.get_or_use(auction_id, 0u64);
        assert(current_height >= start);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        // Compute current Dutch price from block height.
        let dutch: DutchConfig = dutch_params.get(auction_id);
        let elapsed: u128 = (current_height - auction.created_at) as u128;
        let total_duration: u128 = (auction.deadline - auction.created_at) as u128;
        let price_range: u128 = dutch.start_price - dutch.end_price;
        let price_drop: u128 = (price_range * elapsed) / total_duration;
        let current_price: u128 = dutch.start_price - price_drop;

        assert(bid_amount >= current_price);

        bid_commitments.set(bid_hash, true);
        revealed_bids.set(bid_hash, bid_amount);

        highest_bids.set(auction_id, bid_amount);
        second_highest_bids.set(auction_id, current_price);
        auction_winners.set(auction_id, bid_hash);

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + bid_amount);

        let current_bal: u128 = program_balance.get_or_use(0u8, 0u128);
        program_balance.set(0u8, current_bal + bid_amount);

        auctions.set(auction_id, AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            auction_mode: auction.auction_mode,
            status: STATUS_SETTLED,
            deadline: auction.deadline,
            reveal_deadline: 0u64,
            bid_count: 1u64,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: 0u64,
        });

        let settlement_proof: field = BHP256::hash_to_field(SettlementProof {
            auction_id: auction_id,
            highest_bid: bid_amount,
            second_highest: current_price,
            winner_bid_hash: bid_hash,
            settled_at: current_height,
        });
        settlement_proofs.set(auction_id, settlement_proof);
    }

    // ########################################################################
    //              T21: DUTCH BID — USDCx version
    // ########################################################################

    async transition bid_dutch_usdcx(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field
    ) -> (EscrowReceipt, Future) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            bid_amount
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_USDCX,
        };

        return (receipt, finalize_bid_dutch_usdcx(
            transfer_future, auction_id, bid_hash, bid_amount
        ));
    }

    async function finalize_bid_dutch_usdcx(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        bid_amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert_eq(auction.auction_mode, MODE_DUTCH);
        assert_eq(auction.token_type, TOKEN_USDCX);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.deadline);

        // Scheduled start check.
        let start: u64 = scheduled_start.get_or_use(auction_id, 0u64);
        assert(current_height >= start);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        let dutch: DutchConfig = dutch_params.get(auction_id);
        let elapsed: u128 = (current_height - auction.created_at) as u128;
        let total_duration: u128 = (auction.deadline - auction.created_at) as u128;
        let price_range: u128 = dutch.start_price - dutch.end_price;
        let price_drop: u128 = (price_range * elapsed) / total_duration;
        let current_price: u128 = dutch.start_price - price_drop;

        assert(bid_amount >= current_price);

        let already_exists: bool = bid_commitments.contains(bid_hash);
        assert(!already_exists);

        bid_commitments.set(bid_hash, true);
        revealed_bids.set(bid_hash, bid_amount);

        highest_bids.set(auction_id, bid_amount);
        second_highest_bids.set(auction_id, current_price);
        auction_winners.set(auction_id, bid_hash);

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + bid_amount);

        let current_bal: u128 = program_balance.get_or_use(1u8, 0u128);
        program_balance.set(1u8, current_bal + bid_amount);

        auctions.set(auction_id, AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            auction_mode: auction.auction_mode,
            status: STATUS_SETTLED,
            deadline: auction.deadline,
            reveal_deadline: 0u64,
            bid_count: 1u64,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: 0u64,
        });

        let settlement_proof: field = BHP256::hash_to_field(SettlementProof {
            auction_id: auction_id,
            highest_bid: bid_amount,
            second_highest: current_price,
            winner_bid_hash: bid_hash,
            settled_at: current_height,
        });
        settlement_proofs.set(auction_id, settlement_proof);
    }

    // ########################################################################
    //              T22: ENGLISH BID — ALEO credits
    // ########################################################################

    async transition bid_english(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private credits_in: credits.aleo/credits
    ) -> (EscrowReceipt, credits.aleo/credits, Future) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let amount_u64: u64 = bid_amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_ALEO,
        };

        return (receipt, change, finalize_bid_english(
            transfer_future, auction_id, bid_hash, bid_amount
        ));
    }

    async function finalize_bid_english(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        bid_amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert_eq(auction.auction_mode, MODE_ENGLISH);
        assert_eq(auction.token_type, TOKEN_ALEO);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.deadline);

        // Scheduled start check.
        let start: u64 = scheduled_start.get_or_use(auction_id, 0u64);
        assert(current_height >= start);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        let already_exists: bool = bid_commitments.contains(bid_hash);
        assert(!already_exists);
        bid_commitments.set(bid_hash, true);

        let current_high: u128 = highest_bids.get_or_use(auction_id, 0u128);
        if (current_high > 0u128) {
            let min_increment: u128 = (current_high * MIN_BID_INCREMENT_BPS) / FEE_DENOMINATOR;
            assert(bid_amount >= current_high + min_increment);
        }

        revealed_bids.set(bid_hash, bid_amount);

        if (bid_amount > current_high) {
            second_highest_bids.set(auction_id, current_high);
            highest_bids.set(auction_id, bid_amount);
            auction_winners.set(auction_id, bid_hash);
        }

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + bid_amount);

        let current_bal: u128 = program_balance.get_or_use(0u8, 0u128);
        program_balance.set(0u8, current_bal + bid_amount);

        // Anti-sniping: extend deadline if bid in last SNIPE_WINDOW blocks.
        let snipe_threshold: u64 = auction.deadline > SNIPE_WINDOW_BLOCKS
            ? auction.deadline - SNIPE_WINDOW_BLOCKS
            : 0u64;
        let new_deadline: u64 = current_height > snipe_threshold
            ? auction.deadline + SNIPE_EXTENSION_BLOCKS
            : auction.deadline;

        auctions.set(auction_id, AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            auction_mode: auction.auction_mode,
            status: auction.status,
            deadline: new_deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count + 1u64,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        });
    }

    // ########################################################################
    //              T23: ENGLISH BID — USDCx version
    // ########################################################################

    async transition bid_english_usdcx(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field
    ) -> (EscrowReceipt, Future) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            bid_amount
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_USDCX,
        };

        return (receipt, finalize_bid_english_usdcx(
            transfer_future, auction_id, bid_hash, bid_amount
        ));
    }

    async function finalize_bid_english_usdcx(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        bid_amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert_eq(auction.auction_mode, MODE_ENGLISH);
        assert_eq(auction.token_type, TOKEN_USDCX);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.deadline);

        // Scheduled start check.
        let start: u64 = scheduled_start.get_or_use(auction_id, 0u64);
        assert(current_height >= start);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        let already_exists: bool = bid_commitments.contains(bid_hash);
        assert(!already_exists);
        bid_commitments.set(bid_hash, true);

        let current_high: u128 = highest_bids.get_or_use(auction_id, 0u128);
        if (current_high > 0u128) {
            let min_increment: u128 = (current_high * MIN_BID_INCREMENT_BPS) / FEE_DENOMINATOR;
            assert(bid_amount >= current_high + min_increment);
        }

        revealed_bids.set(bid_hash, bid_amount);

        if (bid_amount > current_high) {
            second_highest_bids.set(auction_id, current_high);
            highest_bids.set(auction_id, bid_amount);
            auction_winners.set(auction_id, bid_hash);
        }

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + bid_amount);

        let current_bal: u128 = program_balance.get_or_use(1u8, 0u128);
        program_balance.set(1u8, current_bal + bid_amount);

        let snipe_threshold: u64 = auction.deadline > SNIPE_WINDOW_BLOCKS
            ? auction.deadline - SNIPE_WINDOW_BLOCKS
            : 0u64;
        let new_deadline: u64 = current_height > snipe_threshold
            ? auction.deadline + SNIPE_EXTENSION_BLOCKS
            : auction.deadline;

        auctions.set(auction_id, AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            auction_mode: auction.auction_mode,
            status: auction.status,
            deadline: new_deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count + 1u64,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        });
    }

    // ########################################################################
    //              T24: SETTLE ENGLISH — Seller finalizes after deadline
    // ########################################################################

    async transition settle_english(
        private auction_id: field,
        private reserve_price: u128
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        return finalize_settle_english(auction_id, caller_hash, reserve_hash, reserve_price);
    }

    async function finalize_settle_english(
        auction_id: field,
        caller_hash: field,
        reserve_hash: field,
        reserve_price: u128
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.seller_hash, caller_hash);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert_eq(auction.auction_mode, MODE_ENGLISH);

        let current_height: u64 = block.height as u64;
        assert(current_height > auction.deadline);

        assert_eq(reserve_hash, auction.reserve_price_hash);

        let winning_amount: u128 = highest_bids.get_or_use(auction_id, 0u128);
        let winner_bid_hash: field = auction_winners.get_or_use(auction_id, 0field);

        if (winning_amount >= reserve_price && winning_amount > 0u128) {
            auctions.set(auction_id, AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                auction_mode: auction.auction_mode,
                status: STATUS_SETTLED,
                deadline: auction.deadline,
                reveal_deadline: 0u64,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: 0u64,
            });

            let second_price: u128 = second_highest_bids.get_or_use(auction_id, 0u128);
            let settlement_proof: field = BHP256::hash_to_field(SettlementProof {
                auction_id: auction_id,
                highest_bid: winning_amount,
                second_highest: second_price,
                winner_bid_hash: winner_bid_hash,
                settled_at: current_height,
            });
            settlement_proofs.set(auction_id, settlement_proof);

            // Reputation: increment seller completed count.
            let escount: u64 = seller_completed.get_or_use(auction.seller_hash, 0u64);
            seller_completed.set(auction.seller_hash, escount + 1u64);

            // Royalty: if royalty is configured, calculate and store royalty balance.
            let ehas_royalty: bool = royalty_info.contains(auction_id);
            if (ehas_royalty) {
                let erbps: u128 = royalty_bps.get(auction_id);
                let eroyalty_amount: u128 = (winning_amount * erbps) / 10000u128;
                royalty_balances.set(auction_id, eroyalty_amount);
            }
        } else {
            auctions.set(auction_id, AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                auction_mode: auction.auction_mode,
                status: STATUS_FAILED,
                deadline: auction.deadline,
                reveal_deadline: 0u64,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: 0u64,
            });
        }
    }

    // ########################################################################
    //              T25: DISPUTE AUCTION
    // ########################################################################

    async transition dispute_auction(
        private auction_id: field,
        private bond_credits: credits.aleo/credits,
        private bond_amount: u128,
        private reason_hash: field
    ) -> (DisputeBond, credits.aleo/credits, Future) {
        assert(bond_amount >= MIN_BID_AMOUNT);

        let disputer_field: field = self.caller as field;
        let disputer_hash: field = BHP256::hash_to_field(disputer_field);

        let bond_u64: u64 = bond_amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                bond_credits,
                self.address,
                bond_u64
            );

        let bond_record: DisputeBond = DisputeBond {
            owner: self.caller,
            auction_id: auction_id,
            bond_amount: bond_amount,
        };

        return (bond_record, change, finalize_dispute_auction(
            transfer_future, auction_id, disputer_hash, bond_amount, reason_hash
        ));
    }

    async function finalize_dispute_auction(
        f0: Future,
        auction_id: field,
        disputer_hash: field,
        bond_amount: u128,
        reason_hash: field
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_SETTLED);

        let settlement: SettlementData = settlements.get(auction_id);
        let current_height: u64 = block.height as u64;
        assert(current_height <= settlement.settled_at + DISPUTE_WINDOW_BLOCKS);

        let already_disputed: bool = disputes.contains(auction_id);
        assert(!already_disputed);

        let highest: u128 = highest_bids.get(auction_id);
        let min_bond: u128 = (highest * DISPUTE_BOND_MIN_BPS) / FEE_DENOMINATOR;
        assert(bond_amount >= min_bond);

        disputes.set(auction_id, DisputeData {
            disputer_hash: disputer_hash,
            bond_amount: bond_amount,
            reason_hash: reason_hash,
            filed_at: current_height,
        });

        dispute_bonds.set(auction_id, bond_amount);

        let bal: u128 = program_balance.get_or_use(0u8, 0u128);
        program_balance.set(0u8, bal + bond_amount);

        // Reputation: increment seller disputed count.
        let dcount: u64 = seller_disputed.get_or_use(auction.seller_hash, 0u64);
        seller_disputed.set(auction.seller_hash, dcount + 1u64);

        auctions.set(auction_id, AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            auction_mode: auction.auction_mode,
            status: STATUS_DISPUTED,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: current_height + DISPUTE_WINDOW_BLOCKS,
        });
    }

    // ########################################################################
    //              T26: RESOLVE DISPUTE — Admin determines outcome
    // ########################################################################

    async transition resolve_dispute(
        private auction_id: field,
        private dispute_valid: bool,
        private disputer_address: address,
        private bond_amount: u128
    ) -> (credits.aleo/credits, Future) {
        let admin_field: field = self.caller as field;
        let admin_hash: field = BHP256::hash_to_field(admin_field);

        let disputer_field: field = disputer_address as field;
        let disputer_hash: field = BHP256::hash_to_field(disputer_field);

        let bond_u64: u64 = bond_amount as u64;

        let target: address = dispute_valid ? disputer_address : self.caller;
        let payout: u64 = dispute_valid ? bond_u64 : 1u64;

        let (credits_out, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                target,
                payout
            );

        return (credits_out, finalize_resolve_dispute(
            transfer_future, auction_id, admin_hash,
            disputer_hash, dispute_valid, bond_amount
        ));
    }

    async function finalize_resolve_dispute(
        f0: Future,
        auction_id: field,
        admin_hash: field,
        disputer_hash: field,
        dispute_valid: bool,
        claimed_bond: u128
    ) {
        f0.await();

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert_eq(admin_hash, cfg.admin_hash);

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_DISPUTED);

        let dispute: DisputeData = disputes.get(auction_id);
        assert_eq(disputer_hash, dispute.disputer_hash);

        let actual_bond: u128 = dispute_bonds.get(auction_id);
        assert_eq(claimed_bond, actual_bond);

        if (dispute_valid) {
            auctions.set(auction_id, AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                auction_mode: auction.auction_mode,
                status: STATUS_FAILED,
                deadline: auction.deadline,
                reveal_deadline: auction.reveal_deadline,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: auction.dispute_deadline,
            });

            let bal: u128 = program_balance.get(0u8);
            program_balance.set(0u8, bal - actual_bond);
        } else {
            auctions.set(auction_id, AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                auction_mode: auction.auction_mode,
                status: STATUS_SETTLED,
                deadline: auction.deadline,
                reveal_deadline: auction.reveal_deadline,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: auction.dispute_deadline,
            });

            let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
            platform_treasury.set(0u8, treasury + actual_bond);

            let bal: u128 = program_balance.get(0u8);
            program_balance.set(0u8, bal - actual_bond);
        }

        dispute_bonds.set(auction_id, 0u128);
    }

    // ########################################################################
    //              T27: ADMIN EMERGENCY — Force-close + pause toggle
    // ########################################################################

    async transition admin_emergency(
        private action: u8,
        private auction_id: field
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return finalize_admin_emergency(action, auction_id, caller_hash);
    }

    async function finalize_admin_emergency(
        action: u8,
        auction_id: field,
        caller_hash: field
    ) {
        if (action == 1u8) {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_REVEALING);

            let current_height: u64 = block.height as u64;
            assert(current_height > auction.reveal_deadline + 100u64);

            auctions.set(auction_id, AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                auction_mode: auction.auction_mode,
                status: STATUS_FAILED,
                deadline: auction.deadline,
                reveal_deadline: auction.reveal_deadline,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: 0u64,
            });
        } else {
            let cfg: PlatformConfig = platform_config.get(0u8);
            assert_eq(caller_hash, cfg.admin_hash);

            platform_config.set(0u8, PlatformConfig {
                admin_hash: cfg.admin_hash,
                fee_bps: cfg.fee_bps,
                dispute_bond_bps: cfg.dispute_bond_bps,
                paused: !cfg.paused,
            });
        }
    }

    // ########################################################################
    //              T28: WITHDRAW FEES — ALEO credits (admin only)
    // ########################################################################

    async transition withdraw_fees(
        private amount: u64
    ) -> (credits.aleo/credits, Future) {
        let admin_field: field = self.caller as field;
        let admin_hash: field = BHP256::hash_to_field(admin_field);

        let (credits_out, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                self.caller,
                amount
            );

        return (credits_out, finalize_withdraw_fees(
            transfer_future, admin_hash, amount as u128
        ));
    }

    async function finalize_withdraw_fees(
        f0: Future,
        admin_hash: field,
        amount: u128
    ) {
        f0.await();

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert_eq(admin_hash, cfg.admin_hash);

        let treasury: u128 = platform_treasury.get(0u8);
        assert(amount <= treasury);
        platform_treasury.set(0u8, treasury - amount);
    }

    // ########################################################################
    //              T29: SET AUCTION SCHEDULE
    // ########################################################################

    async transition set_auction_schedule(
        private auction_id: field,
        private start_block: u64
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return finalize_set_auction_schedule(auction_id, start_block, caller_hash);
    }

    async function finalize_set_auction_schedule(
        auction_id: field,
        start_block: u64,
        caller_hash: field
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.seller_hash, caller_hash);
        assert_eq(auction.status, STATUS_ACTIVE);

        let current_height: u64 = block.height as u64;
        assert(start_block > current_height);

        scheduled_start.set(auction_id, start_block);
    }

    // ########################################################################
    //              T30: GRANT VIEW ACCESS — Selective Disclosure
    // ########################################################################

    transition grant_view_access(
        private winner_cert: WinnerCertificate,
        private auditor: address,
        private auction_id: field
    ) -> (WinnerCertificate, ViewPermit) {
        assert_eq(winner_cert.auction_id, auction_id);

        let new_cert: WinnerCertificate = WinnerCertificate {
            owner: winner_cert.owner,
            auction_id: winner_cert.auction_id,
            item_hash: winner_cert.item_hash,
            winning_amount: winner_cert.winning_amount,
            token_type: winner_cert.token_type,
            certificate_id: winner_cert.certificate_id,
        };

        let caller_field: field = self.caller as field;
        let granted_by_hash: field = BHP256::hash_to_field(caller_field);

        let permit: ViewPermit = ViewPermit {
            owner: auditor,
            auction_id: auction_id,
            winning_price: winner_cert.winning_amount,
            item_hash: winner_cert.item_hash,
            settled_at: 0u64,
            granted_by: granted_by_hash,
        };

        return (new_cert, permit);
    }

    // ########################################################################
    //              T31: SET ROYALTY — Configure royalty for original creator
    // ########################################################################
    //
    // Allows setting a royalty (max 10% = 1000 bps) on an auction.
    // When the auction settles, the royalty amount is calculated and stored
    // in royalty_balances. The creator can then claim it via the market program.

    async transition set_royalty(
        private auction_id: field,
        private creator: address,
        private bps: u128
    ) -> Future {
        assert(bps <= 1000u128);
        let creator_field: field = creator as field;
        let creator_hash: field = BHP256::hash_to_field(creator_field);
        return finalize_set_royalty(auction_id, creator_hash, bps);
    }

    async function finalize_set_royalty(
        auction_id: field,
        creator_hash: field,
        bps: u128
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert(bps <= 1000u128);

        royalty_info.set(auction_id, creator_hash);
        royalty_bps.set(auction_id, bps);
    }

}
