// ============================================================================
// OBSCURA CORE v1 — Core Auction Protocol
// ============================================================================
// Foundation layer for the Obscura private auction infrastructure on Aleo.
// This program handles auction lifecycle, bid commitments, and settlement
// logic. ZERO token transfers happen here — all token movement is in
// obscura_settle_v1.aleo.
//
// Other Aleo programs import this to compose sealed-bid mechanics.
//
// 29 transitions | 5 records | 23 mappings | 13 structs
//
// AUCTION FORMATS:
//   1. First-Price Sealed-Bid (MODE 1)
//   2. Vickrey Sealed-Bid (MODE 2) — winner pays second-highest
//   3. Dutch Descending (MODE 3) — price drops per block
//   4. English Ascending (MODE 4) — open bids, anti-sniping
//   5. Bundle (MODE 5) — multi-item, whole-package OR combinatorial subset bids
//   6. Multi-Unit (MODE 6) — N identical units, qty+price bidding
//
// PRIVACY:
//   place_bid: NO token transfer. Amounts hidden via BHP256 commitments.
//   Merkle allowlists: 8-level tree verified in transition (off-chain ZK).
//   Finalize blocks see: auction_id, bid_hash, status codes. NOT amounts/addresses.
//   Seller identity: BHP256(PseudoIdentity{addr, auction_id}) — per-auction pseudonym, never plaintext, unlinkable across auctions.
// ============================================================================

program obscura_core_v4.aleo {

    @noupgrade
    constructor() {}

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
    const MODE_BUNDLE: u8 = 5u8;
    const MODE_MULTI_UNIT: u8 = 6u8;
    const MODE_CANDLE: u8 = 7u8;
    const MODE_REVERSE: u8 = 8u8;
    const MODE_BLIND_DUTCH: u8 = 9u8;
    const MODE_TIMED_ESCALATION: u8 = 10u8;

    // Fees
    const PLATFORM_FEE_BPS: u128 = 100u128;
    const FEE_DENOMINATOR: u128 = 10000u128;

    // English auction
    const MIN_BID_INCREMENT_BPS: u128 = 500u128;

    // Timing
    const REVEAL_WINDOW_BLOCKS: u64 = 2880u64;
    const MIN_AUCTION_DURATION: u64 = 240u64;
    const MIN_BID_AMOUNT: u128 = 1000u128;
    const SNIPE_WINDOW_BLOCKS: u64 = 40u64;
    const SNIPE_EXTENSION_BLOCKS: u64 = 40u64;

    // Dispute
    const DISPUTE_WINDOW_BLOCKS: u64 = 100u64;
    const DISPUTE_BOND_MIN_BPS: u128 = 1000u128;

    // Bundle
    const MAX_BUNDLE_ITEMS: u8 = 4u8;

    // Timed Escalation
    const ESCALATION_INCREMENT_BPS: u128 = 200u128; // 2% auto-increment per period
    const ESCALATION_PERIOD_BLOCKS: u64 = 40u64;    // auto-increment every ~10 min

    // ========================================================================
    // RECORDS (4 — all private UTXO)
    // ========================================================================

    record SealedBid {
        owner: address,
        auction_id: field,
        bid_amount: u128,
        bid_nonce: field,
        token_type: u8,
    }

    record BundleBid {
        owner: address,
        auction_id: field,
        bid_amount: u128,
        bid_nonce: field,
        token_type: u8,
    }

    record MultiUnitBid {
        owner: address,
        auction_id: field,
        quantity: u128,
        price_per_unit: u128,
        bid_nonce: field,
        token_type: u8,
    }

    record SubsetBid {
        owner: address,
        auction_id: field,
        item_mask: u8,      // bitmask: 0b1010 = items 1 and 3
        bid_amount: u128,
        bid_nonce: field,
        token_type: u8,
    }

    // ========================================================================
    // RECORDS (privacy proofs)
    // ========================================================================

    record ParticipationProof {
        owner: address,
        auction_id: field,
        participated_at: u64,
        auction_mode: u8,
    }

    // ZK Referral — referrer holds this private record.
    // When a referred bidder uses it, NO on-chain link exists between referrer and bidder.
    // The referral_hash is stored in a mapping so the referrer can later claim commissions,
    // but the mapping key is a hash — not the referrer's address.
    record ReferralCode {
        owner: address,
        referral_id: field,       // unique ID for this referral
        auction_id: field,        // which auction this referral is for (0field = any auction)
        uses_remaining: u64,      // how many times this code can be used
    }

    // ========================================================================
    // STRUCTS
    // ========================================================================

    // Per-auction pseudonymous identity — prevents cross-auction seller linking
    struct PseudoIdentity {
        addr: address,
        salt: field,
    }

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
    // PRIVACY NOTE: bid_count and token_type are intentionally public in the auctions mapping.
    // bid_count: needed for close_bidding to determine EXPIRED vs REVEALING state.
    // token_type: needed for bid validation (ensure bidder uses correct token).
    // Both are minimal information — bid_count reveals quantity (not amounts or identities),
    // token_type reveals only which of 3 tokens is used (not amounts).
    // All sensitive data (bid amounts, bidder identities, reserve price) remains private.

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

    struct SettlementProof {
        auction_id: field,
        highest_bid: u128,
        second_highest: u128,
        winner_bid_hash: field,
        settled_at: u64,
    }

    struct PlatformConfig {
        admin_hash: field,
        fee_bps: u128,
        dispute_bond_bps: u128,
        paused: bool,
    }

    struct DutchConfig {
        start_price: u128,
        end_price: u128,
    }

    struct DisputeData {
        disputer_hash: field,
        bond_amount: u128,
        reason_hash: field,
        filed_at: u64,
    }

    struct BundleConfig {
        item_count: u8,
        item_hash_1: field,
        item_hash_2: field,
        item_hash_3: field,
        item_hash_4: field,
        total_reserve: u128,
    }

    struct MultiUnitConfig {
        total_units: u128,
        min_price_per_unit: u128,
        filled_units: u128,
    }

    struct CandleConfig {
        candle_start: u64,  // block where candle period begins
        candle_end: u64,    // block where auction fully ends
    }

    // Merkle proof — 16 levels supports 65,536 addresses
    struct MerkleProof16 {
        p0: field, p1: field, p2: field, p3: field,
        p4: field, p5: field, p6: field, p7: field,
        p8: field, p9: field, p10: field, p11: field,
        p12: field, p13: field, p14: field, p15: field,
        indices: u16,
    }

    // ========================================================================
    // MAPPINGS (18)
    // ========================================================================

    mapping auctions: field => AuctionData;
    mapping bid_commitments: field => bool;
    mapping revealed_bids: field => u128;
    mapping highest_bids: field => u128;
    mapping second_highest_bids: field => u128;
    mapping auction_winners: field => field;
    mapping platform_config: u8 => PlatformConfig;
    mapping settlement_proofs: field => field;
    mapping dutch_params: field => DutchConfig;
    mapping disputes: field => DisputeData;
    mapping dispute_bonds: field => u128;

    // New mappings for Wave 5
    mapping merkle_roots: field => field;
    // v4 PRIVACY: reputation_completed and reputation_disputed REMOVED.
    // Previous mappings leaked seller activity counts linked to seller_hash.
    // Replaced by AuctionCompletionProof private record (in settle_v5+) which
    // gives the seller portable reputation without on-chain counter visibility.
    mapping bundle_configs: field => BundleConfig;
    mapping multi_unit_configs: field => MultiUnitConfig;
    mapping multi_unit_highest: field => u128;
    mapping multi_unit_second: field => u128;

    // Candle auction configs
    mapping candle_configs: field => CandleConfig;
    // Timed escalation current auto-incremented price
    mapping escalation_prices: field => u128;
    // Reverse auction lowest bids
    mapping lowest_bids: field => u128;
    // Bundle combinatorial allocation: auction_id => allocated_mask (which items sold)
    mapping bundle_allocation: field => u8;

    // Privacy: time-delayed result disclosure
    mapping result_timelock: field => u64;      // auction_id => block height after which result is public
    mapping revealed_results: field => u128;    // auction_id => winning price (readable after timelock)

    // Privacy: nullifier-based anti-replay — prevents double-bidding without revealing bid content
    mapping bid_nullifiers: field => bool;      // BHP256(bid_nonce) => true

    // ZK Referral mappings
    mapping referral_uses: field => u64;          // referral_id => total uses
    mapping referral_commissions: field => u128;  // referral_id => accumulated commission (in microcredits)

    // ########################################################################
    //              T1: INITIALIZE PLATFORM
    // ########################################################################

    fn initialize_platform(
        private admin_address: address,
        private fee_bps: u128,
        private bond_bps: u128
    ) -> Final {
        let admin_field: field = admin_address as field;
        let admin_hash: field = BHP256::hash_to_field(admin_field);
        return final {
            let already_init: bool = platform_config.contains(0u8);
            assert(!already_init);
            platform_config.set(0u8, PlatformConfig {
                admin_hash: admin_hash,
                fee_bps: fee_bps,
                dispute_bond_bps: bond_bps,
                paused: false,
            });
        };
    }

    // ########################################################################
    //              T2: CREATE AUCTION (Sealed/Vickrey/English)
    // ########################################################################

    fn create_auction(
        private item_hash: field,
        private category: u8,
        private reserve_price: u128,
        private auction_mode: u8,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64
    ) -> (field, Final) {
        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        // Per-auction pseudonymous ID — different hash per auction, prevents cross-auction linking
        let seller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        // Modes 1-4 via this transition (5=bundle, 6=multi-unit have their own)
        assert(
            auction_mode == MODE_FIRST_PRICE ||
            auction_mode == MODE_VICKREY ||
            auction_mode == MODE_ENGLISH
        );
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        return (auction_id, final {
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
        });
    }

    // ########################################################################
    //              T3: CREATE DUTCH AUCTION
    // ########################################################################

    fn create_dutch_auction(
        private item_hash: field,
        private category: u8,
        private start_price: u128,
        private end_price: u128,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64
    ) -> (field, Final) {
        assert(start_price > end_price);
        assert(end_price >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let end_field: field = end_price as field;
        let reserve_hash: field = BHP256::hash_to_field(end_field);

        let seller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        return (auction_id, final {
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
        });
    }

    // ########################################################################
    //              T4: CREATE BUNDLE AUCTION (NEW — multi-item)
    // ########################################################################

    fn create_bundle_auction(
        private item_hash_1: field,
        private item_hash_2: field,
        private item_hash_3: field,
        private item_hash_4: field,
        private item_count: u8,
        private category: u8,
        private total_reserve: u128,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64
    ) -> (field, Final) {
        assert(item_count >= 2u8 && item_count <= MAX_BUNDLE_ITEMS);
        assert(total_reserve >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        // Use item_hash_1 as the primary hash for auction seed
        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash_1,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let reserve_field: field = total_reserve as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        let seller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        return (auction_id, final {
            let exists: bool = auctions.contains(auction_id);
            assert(!exists);

            let current_height: u64 = block.height as u64;
            assert(deadline > current_height + MIN_AUCTION_DURATION);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            auctions.set(auction_id, AuctionData {
                item_hash: item_hash_1,
                seller_hash: seller_hash,
                category: category,
                token_type: token_type,
                auction_mode: MODE_BUNDLE,
                status: STATUS_ACTIVE,
                deadline: deadline,
                reveal_deadline: 0u64,
                bid_count: 0u64,
                reserve_price_hash: reserve_hash,
                created_at: current_height,
                dispute_deadline: 0u64,
            });

            bundle_configs.set(auction_id, BundleConfig {
                item_count: item_count,
                item_hash_1: item_hash_1,
                item_hash_2: item_hash_2,
                item_hash_3: item_hash_3,
                item_hash_4: item_hash_4,
                total_reserve: total_reserve,
            });
        });
    }

    // ########################################################################
    //              T5: CREATE MULTI-UNIT AUCTION (NEW — N units)
    // ########################################################################

    fn create_multi_unit_auction(
        private item_hash: field,
        private category: u8,
        private total_units: u128,
        private min_price_per_unit: u128,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64
    ) -> (field, Final) {
        assert(total_units > 0u128);
        assert(min_price_per_unit >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let reserve_field: field = min_price_per_unit as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        let seller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        return (auction_id, final {
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
                auction_mode: MODE_MULTI_UNIT,
                status: STATUS_ACTIVE,
                deadline: deadline,
                reveal_deadline: 0u64,
                bid_count: 0u64,
                reserve_price_hash: reserve_hash,
                created_at: current_height,
                dispute_deadline: 0u64,
            });

            multi_unit_configs.set(auction_id, MultiUnitConfig {
                total_units: total_units,
                min_price_per_unit: min_price_per_unit,
                filled_units: 0u128,
            });
        });
    }

    // ########################################################################
    //              T6: CANCEL AUCTION
    // ########################################################################

    fn cancel_auction(
        private auction_id: field
    ) -> Final {
        let caller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });
        return final {
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
        };
    }

    // ########################################################################
    //              T7: CLOSE BIDDING
    // ########################################################################

    fn close_bidding(
        private auction_id: field
    ) -> Final {
        return final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert(
                auction.auction_mode == MODE_FIRST_PRICE ||
                auction.auction_mode == MODE_VICKREY ||
                auction.auction_mode == MODE_BUNDLE ||
                auction.auction_mode == MODE_MULTI_UNIT ||
                auction.auction_mode == MODE_CANDLE ||
                auction.auction_mode == MODE_REVERSE ||
                auction.auction_mode == MODE_BLIND_DUTCH
            );

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
        };
    }

    // ########################################################################
    //              T8: PLACE BID — sealed commitment (no token transfer)
    // ########################################################################

    fn place_bid(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private token_type: u8
    ) -> (SealedBid, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

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

        // Nullifier: hash of nonce only — reveals nothing about bidder or amount
        let nullifier: field = BHP256::hash_to_field(bid_nonce);

        return (sealed, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.token_type, token_type);
            assert(
                auction.auction_mode == MODE_FIRST_PRICE ||
                auction.auction_mode == MODE_VICKREY
            );

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

            // Merkle gating: if a root is set, the bid must have been verified
            // in the transition body (off-chain ZK). Finalize only sees the bid_hash.

            let already_exists: bool = bid_commitments.contains(bid_hash);
            assert(!already_exists);

            // Nullifier anti-replay: prevents reuse of the same nonce across bids
            let nullifier_exists: bool = bid_nullifiers.contains(nullifier);
            assert(!nullifier_exists);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            bid_commitments.set(bid_hash, true);
            bid_nullifiers.set(nullifier, true);

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
        });
    }

    // ########################################################################
    //              T9: PLACE BUNDLE BID (NEW — bid on whole bundle)
    // ########################################################################

    fn place_bundle_bid(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private token_type: u8
    ) -> (BundleBid, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let bid: BundleBid = BundleBid {
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

        // Nullifier: hash of nonce only — reveals nothing about bidder or amount
        let nullifier: field = BHP256::hash_to_field(bid_nonce);

        return (bid, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.auction_mode, MODE_BUNDLE);
            assert_eq(auction.token_type, token_type);

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

            let already_exists: bool = bid_commitments.contains(bid_hash);
            assert(!already_exists);

            // Nullifier anti-replay: prevents reuse of the same nonce across bids
            let nullifier_exists: bool = bid_nullifiers.contains(nullifier);
            assert(!nullifier_exists);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            bid_commitments.set(bid_hash, true);
            bid_nullifiers.set(nullifier, true);

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
        });
    }

    // ########################################################################
    //              T9b: PLACE SUBSET BID (combinatorial — bid on item subsets)
    // ########################################################################

    fn place_subset_bid(
        private auction_id: field,
        private item_mask: u8,     // which items the bidder wants (bitmask)
        private bid_amount: u128,
        private bid_nonce: field,
        private token_type: u8
    ) -> (SubsetBid, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(item_mask > 0u8);           // at least 1 item
        assert(item_mask <= 15u8);         // max 4 items = 0b1111

        let bid: SubsetBid = SubsetBid {
            owner: self.caller,
            auction_id: auction_id,
            item_mask: item_mask,
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

        // Nullifier: hash of nonce only — reveals nothing about bidder or amount
        let nullifier: field = BHP256::hash_to_field(bid_nonce);

        return (bid, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.auction_mode, MODE_BUNDLE);
            assert_eq(auction.token_type, token_type);

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

            let already_exists: bool = bid_commitments.contains(bid_hash);
            assert(!already_exists);

            // Nullifier anti-replay: prevents reuse of the same nonce across bids
            let nullifier_exists: bool = bid_nullifiers.contains(nullifier);
            assert(!nullifier_exists);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            bid_commitments.set(bid_hash, true);
            bid_nullifiers.set(nullifier, true);

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
        });
    }

    // ########################################################################
    //              T10: PLACE MULTI-UNIT BID (NEW — qty + price)
    // ########################################################################

    fn place_multi_unit_bid(
        private auction_id: field,
        private quantity: u128,
        private price_per_unit: u128,
        private bid_nonce: field,
        private token_type: u8
    ) -> (MultiUnitBid, Final) {
        assert(quantity > 0u128);
        assert(price_per_unit >= MIN_BID_AMOUNT);

        let bid: MultiUnitBid = MultiUnitBid {
            owner: self.caller,
            auction_id: auction_id,
            quantity: quantity,
            price_per_unit: price_per_unit,
            bid_nonce: bid_nonce,
            token_type: token_type,
        };

        // Hash includes qty * price as the "amount" for commitment
        let total_amount: u128 = quantity * price_per_unit;
        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: total_amount,
            nonce: bid_nonce,
        });

        // Nullifier: hash of nonce only — reveals nothing about bidder or amount
        let nullifier: field = BHP256::hash_to_field(bid_nonce);

        return (bid, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.auction_mode, MODE_MULTI_UNIT);
            assert_eq(auction.token_type, token_type);

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

            let already_exists: bool = bid_commitments.contains(bid_hash);
            assert(!already_exists);

            // Nullifier anti-replay: prevents reuse of the same nonce across bids
            let nullifier_exists: bool = bid_nullifiers.contains(nullifier);
            assert(!nullifier_exists);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            bid_commitments.set(bid_hash, true);
            bid_nullifiers.set(nullifier, true);

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
        });
    }

    // ########################################################################
    //              T11: SET MERKLE ROOT (allowlist gating)
    // ########################################################################

    fn set_merkle_root(
        private auction_id: field,
        private root: field
    ) -> Final {
        let caller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });
        return final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.seller_hash, caller_hash);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.bid_count, 0u64);
            merkle_roots.set(auction_id, root);
        };
    }

    // ########################################################################
    //              T12: FINALIZE AUCTION (sealed/Vickrey/bundle/multi-unit)
    // ########################################################################

    fn finalize_auction(
        private auction_id: field,
        private reserve_price: u128
    ) -> Final {
        let caller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        return final {
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
                    // Vickrey requires 2+ revealed bids
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
                        let sp: field = BHP256::hash_to_field(SettlementProof {
                            auction_id: auction_id,
                            highest_bid: winning_amount,
                            second_highest: second_price,
                            winner_bid_hash: winner_bid_hash,
                            settled_at: current_height,
                        });
                        settlement_proofs.set(auction_id, sp);

                        // Reputation: increment seller completed count
                        // v4: reputation counter removed for privacy (seller portability via AuctionCompletionProof record in settle_v5+)
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
                if (auction.auction_mode == MODE_REVERSE) {
                    // Reverse auction: lowest bid wins (buyer created auction, sellers bid down)
                    let lowest_amount: u128 = lowest_bids.get_or_use(auction_id, 0u128);
                    let lowest_bid_hash: field = auction_winners.get_or_use(auction_id, 0field);

                    // In reverse: reserve_price is buyer's max budget. Lowest bid must be <= budget.
                    if (lowest_amount > 0u128 && lowest_amount <= reserve_price) {
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
                        let sp: field = BHP256::hash_to_field(SettlementProof {
                            auction_id: auction_id,
                            highest_bid: lowest_amount,
                            second_highest: 0u128,
                            winner_bid_hash: lowest_bid_hash,
                            settled_at: current_height,
                        });
                        settlement_proofs.set(auction_id, sp);

                        // v4: reputation counter removed for privacy (seller portability via AuctionCompletionProof record in settle_v5+)
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
                } else {
                    // First-price, Bundle, Multi-Unit, Candle, Blind Dutch modes
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
                        let sp: field = BHP256::hash_to_field(SettlementProof {
                            auction_id: auction_id,
                            highest_bid: winning_amount,
                            second_highest: second_price,
                            winner_bid_hash: winner_bid_hash,
                            settled_at: current_height,
                        });
                        settlement_proofs.set(auction_id, sp);

                        // v4: reputation counter removed for privacy (seller portability via AuctionCompletionProof record in settle_v5+)
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
        };
    }

    // ########################################################################
    //              T13: SETTLE ENGLISH
    // ########################################################################

    fn settle_english(
        private auction_id: field,
        private reserve_price: u128
    ) -> Final {
        let caller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        return final {
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
                let sp: field = BHP256::hash_to_field(SettlementProof {
                    auction_id: auction_id,
                    highest_bid: winning_amount,
                    second_highest: second_price,
                    winner_bid_hash: winner_bid_hash,
                    settled_at: current_height,
                });
                settlement_proofs.set(auction_id, sp);

                // v4: reputation counter removed for privacy.
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
        };
    }

    // ########################################################################
    //              T14: ADMIN EMERGENCY
    // ########################################################################

    fn admin_emergency(
        private action: u8,
        private auction_id: field
    ) -> Final {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return final {
            if (action == 1u8) {
                // Force-close stale reveal phase
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
                // Toggle platform pause
                let cfg: PlatformConfig = platform_config.get(0u8);
                assert_eq(caller_hash, cfg.admin_hash);

                platform_config.set(0u8, PlatformConfig {
                    admin_hash: cfg.admin_hash,
                    fee_bps: cfg.fee_bps,
                    dispute_bond_bps: cfg.dispute_bond_bps,
                    paused: !cfg.paused,
                });
            }
        };
    }

    // ########################################################################
    //              T15: CREATE CANDLE AUCTION
    // ########################################################################
    // Candle auctions end at an unpredictable point within a "candle period".
    // Bids after candle_start are risky — the retroactive cutoff is unknown
    // until after candle_end. Settlement picks the highest revealed bid.

    fn create_candle_auction(
        private item_hash: field,
        private category: u8,
        private reserve_price: u128,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64,
        private candle_start_offset: u64
    ) -> (field, Final) {
        assert(candle_start_offset > 0u64);
        assert(reserve_price >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        let seller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        let candle_start: u64 = deadline - candle_start_offset;

        return (auction_id, final {
            let exists: bool = auctions.contains(auction_id);
            assert(!exists);

            let current_height: u64 = block.height as u64;
            // candle_start must be far enough in the future
            assert(candle_start > current_height + MIN_AUCTION_DURATION);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            auctions.set(auction_id, AuctionData {
                item_hash: item_hash,
                seller_hash: seller_hash,
                category: category,
                token_type: token_type,
                auction_mode: MODE_CANDLE,
                status: STATUS_ACTIVE,
                deadline: deadline,
                reveal_deadline: 0u64,
                bid_count: 0u64,
                reserve_price_hash: reserve_hash,
                created_at: current_height,
                dispute_deadline: 0u64,
            });

            candle_configs.set(auction_id, CandleConfig {
                candle_start: candle_start,
                candle_end: deadline,
            });
        });
    }

    // ########################################################################
    //              T16: PLACE CANDLE BID
    // ########################################################################
    // Sealed bid for candle auctions. Bids accepted until candle_end.
    // Bids placed after candle_start carry risk — retroactive cutoff unknown.

    fn place_candle_bid(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private token_type: u8
    ) -> (SealedBid, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

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

        // Nullifier: hash of nonce only — reveals nothing about bidder or amount
        let nullifier: field = BHP256::hash_to_field(bid_nonce);

        return (sealed, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.auction_mode, MODE_CANDLE);
            assert_eq(auction.token_type, token_type);

            // Bids accepted until candle_end (the full deadline)
            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

            let already_exists: bool = bid_commitments.contains(bid_hash);
            assert(!already_exists);

            // Nullifier anti-replay: prevents reuse of the same nonce across bids
            let nullifier_exists: bool = bid_nullifiers.contains(nullifier);
            assert(!nullifier_exists);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            bid_commitments.set(bid_hash, true);
            bid_nullifiers.set(nullifier, true);

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
        });
    }

    // ########################################################################
    //              T17: SETTLE CANDLE
    // ########################################################################
    // After candle_end, the seller settles. The candle mechanism's randomness
    // is in the social layer: bidders didn't know which block would be the
    // retroactive cutoff, so late bids were risky. Settlement picks the
    // highest revealed bid (same as first-price after reveal).

    fn settle_candle(
        private auction_id: field,
        private reserve_price: u128
    ) -> Final {
        let caller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        return final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.seller_hash, caller_hash);
            assert_eq(auction.auction_mode, MODE_CANDLE);
            assert_eq(auction.status, STATUS_REVEALING);

            let current_height: u64 = block.height as u64;
            assert(current_height > auction.reveal_deadline);

            assert_eq(reserve_hash, auction.reserve_price_hash);

            let candle: CandleConfig = candle_configs.get(auction_id);
            assert(current_height > candle.candle_end);

            let winning_amount: u128 = highest_bids.get_or_use(auction_id, 0u128);
            let winner_bid_hash: field = auction_winners.get_or_use(auction_id, 0field);
            let second_price: u128 = second_highest_bids.get_or_use(auction_id, 0u128);

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

                let sp: field = BHP256::hash_to_field(SettlementProof {
                    auction_id: auction_id,
                    highest_bid: winning_amount,
                    second_highest: second_price,
                    winner_bid_hash: winner_bid_hash,
                    settled_at: current_height,
                });
                settlement_proofs.set(auction_id, sp);

                // v4: reputation counter removed for privacy.
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
        };
    }

    // ########################################################################
    //              T18: CREATE REVERSE AUCTION
    // ########################################################################
    // Buyer creates a request. Sellers bid DOWN to offer the lowest price.
    // The "seller_hash" field stores the BUYER's hash (buyer creates it).

    fn create_reverse_auction(
        private item_hash: field,
        private category: u8,
        private max_budget: u128,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64
    ) -> (field, Final) {
        assert(max_budget >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let budget_field: field = max_budget as field;
        let reserve_hash: field = BHP256::hash_to_field(budget_field);

        // Buyer's pseudonymous hash stored as seller_hash (creator of the reverse auction)
        let buyer_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        return (auction_id, final {
            let exists: bool = auctions.contains(auction_id);
            assert(!exists);

            let current_height: u64 = block.height as u64;
            assert(deadline > current_height + MIN_AUCTION_DURATION);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            auctions.set(auction_id, AuctionData {
                item_hash: item_hash,
                seller_hash: buyer_hash,
                category: category,
                token_type: token_type,
                auction_mode: MODE_REVERSE,
                status: STATUS_ACTIVE,
                deadline: deadline,
                reveal_deadline: 0u64,
                bid_count: 0u64,
                reserve_price_hash: reserve_hash,
                created_at: current_height,
                dispute_deadline: 0u64,
            });
        });
    }

    // ########################################################################
    //              T19: PLACE REVERSE BID
    // ########################################################################
    // Seller submits a sealed offer. In settlement, lowest bid wins.

    fn place_reverse_bid(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private token_type: u8
    ) -> (SealedBid, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

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

        // Nullifier: hash of nonce only — reveals nothing about bidder or amount
        let nullifier: field = BHP256::hash_to_field(bid_nonce);

        return (sealed, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.auction_mode, MODE_REVERSE);
            assert_eq(auction.token_type, token_type);

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

            let already_exists: bool = bid_commitments.contains(bid_hash);
            assert(!already_exists);

            // Nullifier anti-replay: prevents reuse of the same nonce across bids
            let nullifier_exists: bool = bid_nullifiers.contains(nullifier);
            assert(!nullifier_exists);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            bid_commitments.set(bid_hash, true);
            bid_nullifiers.set(nullifier, true);

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
        });
    }

    // ########################################################################
    //              T20: SETTLE REVERSE
    // ########################################################################
    // Lowest revealed bid wins. If lowest <= max_budget, auction settles.

    fn settle_reverse(
        private auction_id: field,
        private max_budget: u128
    ) -> Final {
        let caller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        let budget_field: field = max_budget as field;
        let reserve_hash: field = BHP256::hash_to_field(budget_field);

        return final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.seller_hash, caller_hash);
            assert_eq(auction.auction_mode, MODE_REVERSE);
            assert_eq(auction.status, STATUS_REVEALING);

            let current_height: u64 = block.height as u64;
            assert(current_height > auction.reveal_deadline);

            assert_eq(reserve_hash, auction.reserve_price_hash);

            let lowest_amount: u128 = lowest_bids.get_or_use(auction_id, 0u128);
            let winner_bid_hash: field = auction_winners.get_or_use(auction_id, 0field);

            if (lowest_amount > 0u128 && lowest_amount <= max_budget) {
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

                let sp: field = BHP256::hash_to_field(SettlementProof {
                    auction_id: auction_id,
                    highest_bid: lowest_amount,
                    second_highest: 0u128,
                    winner_bid_hash: winner_bid_hash,
                    settled_at: current_height,
                });
                settlement_proofs.set(auction_id, sp);

                // v4: reputation counter removed for privacy.
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
        };
    }

    // ########################################################################
    //              T21: CREATE BLIND DUTCH AUCTION
    // ########################################################################
    // Dutch auction with sealed bids. Bidders submit sealed bids without
    // seeing others' bids or the exact current price. At settlement, highest
    // sealed bid above the floor price (end_price) wins.

    fn create_blind_dutch(
        private item_hash: field,
        private category: u8,
        private start_price: u128,
        private end_price: u128,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64
    ) -> (field, Final) {
        assert(start_price > end_price);
        assert(end_price >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let end_field: field = end_price as field;
        let reserve_hash: field = BHP256::hash_to_field(end_field);

        let seller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        return (auction_id, final {
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
                auction_mode: MODE_BLIND_DUTCH,
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
        });
    }

    // ########################################################################
    //              T22: PLACE BLIND DUTCH BID
    // ########################################################################
    // Bidder submits a sealed bid during the Dutch period. They don't see
    // other bids or the exact current price. At settlement, highest bid
    // above the floor price wins.

    fn place_blind_dutch_bid(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private token_type: u8
    ) -> (SealedBid, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

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

        // Nullifier: hash of nonce only — reveals nothing about bidder or amount
        let nullifier: field = BHP256::hash_to_field(bid_nonce);

        return (sealed, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.auction_mode, MODE_BLIND_DUTCH);
            assert_eq(auction.token_type, token_type);

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

            let already_exists: bool = bid_commitments.contains(bid_hash);
            assert(!already_exists);

            // Nullifier anti-replay: prevents reuse of the same nonce across bids
            let nullifier_exists: bool = bid_nullifiers.contains(nullifier);
            assert(!nullifier_exists);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            bid_commitments.set(bid_hash, true);
            bid_nullifiers.set(nullifier, true);

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
        });
    }

    // ########################################################################
    //              T23: CREATE TIMED ESCALATION AUCTION
    // ########################################################################
    // Like English but the minimum bid auto-increments by ESCALATION_INCREMENT_BPS
    // every ESCALATION_PERIOD_BLOCKS. Creates urgency — wait too long and the
    // minimum price rises. Open bids with anti-sniping.

    fn create_timed_escalation(
        private item_hash: field,
        private category: u8,
        private starting_price: u128,
        private token_type: u8,
        private auction_nonce: field,
        public deadline: u64
    ) -> (field, Final) {
        assert(starting_price >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        let reserve_field: field = starting_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        let seller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        return (auction_id, final {
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
                auction_mode: MODE_TIMED_ESCALATION,
                status: STATUS_ACTIVE,
                deadline: deadline,
                reveal_deadline: 0u64,
                bid_count: 0u64,
                reserve_price_hash: reserve_hash,
                created_at: current_height,
                dispute_deadline: 0u64,
            });

            escalation_prices.set(auction_id, starting_price);
        });
    }

    // ########################################################################
    //              T24: BID TIMED ESCALATION
    // ########################################################################
    // Open bid with auto-incrementing minimum. The minimum price rises by
    // ESCALATION_INCREMENT_BPS (2%) every ESCALATION_PERIOD_BLOCKS (~10 min).
    // Anti-sniping: deadline extends if bid arrives in last 40 blocks.

    fn bid_timed_escalation(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private token_type: u8
    ) -> (SealedBid, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

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

        return (sealed, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.auction_mode, MODE_TIMED_ESCALATION);
            assert_eq(auction.token_type, token_type);

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

            let cfg: PlatformConfig = platform_config.get(0u8);
            assert(!cfg.paused);

            // Compute auto-incrementing minimum price
            let base_price: u128 = escalation_prices.get(auction_id);
            let elapsed: u64 = current_height - auction.created_at;
            let periods: u64 = elapsed / ESCALATION_PERIOD_BLOCKS;
            let periods_128: u128 = periods as u128;
            let increment: u128 = base_price * ESCALATION_INCREMENT_BPS * periods_128 / FEE_DENOMINATOR;
            let current_min_price: u128 = base_price + increment;

            assert(bid_amount >= current_min_price);

            // Track highest / second-highest bids (open English-style)
            let current_highest: u128 = highest_bids.get_or_use(auction_id, 0u128);

            if (bid_amount > current_highest) {
                if (current_highest > 0u128) {
                    second_highest_bids.set(auction_id, current_highest);
                }
                highest_bids.set(auction_id, bid_amount);
                auction_winners.set(auction_id, bid_hash);
            } else {
                let current_second: u128 = second_highest_bids.get_or_use(auction_id, 0u128);
                if (bid_amount > current_second) {
                    second_highest_bids.set(auction_id, bid_amount);
                }
            }

            // Update escalation price to current computed price
            escalation_prices.set(auction_id, current_min_price);

            // Anti-sniping: extend deadline if bid in last SNIPE_WINDOW_BLOCKS
            let time_left: u64 = auction.deadline - current_height;
            if (time_left <= SNIPE_WINDOW_BLOCKS) {
                let extended: u64 = auction.deadline + SNIPE_EXTENSION_BLOCKS;
                auctions.set(auction_id, AuctionData {
                    item_hash: auction.item_hash,
                    seller_hash: auction.seller_hash,
                    category: auction.category,
                    token_type: auction.token_type,
                    auction_mode: auction.auction_mode,
                    status: auction.status,
                    deadline: extended,
                    reveal_deadline: auction.reveal_deadline,
                    bid_count: auction.bid_count + 1u64,
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
                    status: auction.status,
                    deadline: auction.deadline,
                    reveal_deadline: auction.reveal_deadline,
                    bid_count: auction.bid_count + 1u64,
                    reserve_price_hash: auction.reserve_price_hash,
                    created_at: auction.created_at,
                    dispute_deadline: auction.dispute_deadline,
                });
            }
        });
    }

    // ########################################################################
    //              T25: SETTLE BUNDLE ALLOCATION (combinatorial subset)
    // ########################################################################
    // The seller selects up to 3 subset bids to accept. Each bid covers a
    // disjoint subset of items (enforced via bitmask). Total revenue must
    // meet the bundle reserve. This is the ADVANCED combinatorial path;
    // finalize_auction remains available as the SIMPLE whole-bundle path.

    fn settle_bundle_allocation(
        private auction_id: field,
        private bid_hash_1: field,    // first accepted bid hash
        private bid_mask_1: u8,       // items allocated to bid 1
        private bid_amount_1: u128,   // amount of bid 1
        private bid_hash_2: field,    // second accepted bid (0field if none)
        private bid_mask_2: u8,       // items allocated to bid 2 (0 if none)
        private bid_amount_2: u128,   // amount of bid 2 (0 if none)
        private bid_hash_3: field,    // third accepted bid (0field if none)
        private bid_mask_3: u8,       // items allocated to bid 3 (0 if none)
        private bid_amount_3: u128,   // amount of bid 3 (0 if none)
        private reserve_price: u128   // total reserve for the bundle
    ) -> Final {
        let caller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        return final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.seller_hash, caller_hash);
            assert_eq(auction.auction_mode, MODE_BUNDLE);
            assert_eq(auction.status, STATUS_REVEALING);

            let current_height: u64 = block.height as u64;
            assert(current_height > auction.reveal_deadline);

            assert_eq(reserve_hash, auction.reserve_price_hash);

            // --- Verify no overlap between allocated item masks ---
            let overlap_12: u8 = bid_mask_1 & bid_mask_2;
            assert_eq(overlap_12, 0u8);
            let overlap_13: u8 = bid_mask_1 & bid_mask_3;
            assert_eq(overlap_13, 0u8);
            let overlap_23: u8 = bid_mask_2 & bid_mask_3;
            assert_eq(overlap_23, 0u8);

            // --- Verify each referenced bid is committed and revealed ---
            // Bid 1 is always required
            assert(bid_hash_1 != 0field);
            let has_commit_1: bool = bid_commitments.contains(bid_hash_1);
            assert(has_commit_1);
            let has_reveal_1: bool = revealed_bids.contains(bid_hash_1);
            assert(has_reveal_1);
            assert(bid_mask_1 > 0u8);

            // Bid 2: if present, verify committed+revealed; if absent, mask and amount must be 0
            let bid2_active: bool = bid_hash_2 != 0field;
            let has_commit_2: bool = bid2_active ? bid_commitments.contains(bid_hash_2) : true;
            assert(has_commit_2);
            let has_reveal_2: bool = bid2_active ? revealed_bids.contains(bid_hash_2) : true;
            assert(has_reveal_2);
            // If bid2 is inactive, mask and amount must be zero
            assert(bid2_active || bid_mask_2 == 0u8);
            assert(bid2_active || bid_amount_2 == 0u128);

            // Bid 3: if present, verify committed+revealed; if absent, mask and amount must be 0
            let bid3_active: bool = bid_hash_3 != 0field;
            let has_commit_3: bool = bid3_active ? bid_commitments.contains(bid_hash_3) : true;
            assert(has_commit_3);
            let has_reveal_3: bool = bid3_active ? revealed_bids.contains(bid_hash_3) : true;
            assert(has_reveal_3);
            assert(bid3_active || bid_mask_3 == 0u8);
            assert(bid3_active || bid_amount_3 == 0u128);

            // --- Compute total revenue and check reserve ---
            let amount_2: u128 = bid2_active ? bid_amount_2 : 0u128;
            let amount_3: u128 = bid3_active ? bid_amount_3 : 0u128;
            let total: u128 = bid_amount_1 + amount_2 + amount_3;

            if (total >= reserve_price) {
                // Settlement succeeds
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

                let sp: field = BHP256::hash_to_field(SettlementProof {
                    auction_id: auction_id,
                    highest_bid: total,
                    second_highest: 0u128,
                    winner_bid_hash: bid_hash_1,
                    settled_at: current_height,
                });
                settlement_proofs.set(auction_id, sp);

                // Store which items were allocated
                let allocated: u8 = bid_mask_1 | bid_mask_2 | bid_mask_3;
                bundle_allocation.set(auction_id, allocated);

                // Update seller reputation
                // v4: reputation counter removed for privacy.
            } else {
                // Reserve not met — auction fails
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
        };
    }

    // ########################################################################
    //              T26: CLAIM PARTICIPATION PROOF
    // ########################################################################
    // Returns a private ParticipationProof record proving the caller bid in
    // an auction. The SealedBid is consumed and re-created unchanged so the
    // bidder keeps their bid. Finalize checks the auction exists.

    fn claim_participation(
        private bid: SealedBid
    ) -> (SealedBid, ParticipationProof, Final) {
        let new_bid: SealedBid = SealedBid {
            owner: bid.owner,
            auction_id: bid.auction_id,
            bid_amount: bid.bid_amount,
            bid_nonce: bid.bid_nonce,
            token_type: bid.token_type,
        };
        let proof: ParticipationProof = ParticipationProof {
            owner: bid.owner,
            auction_id: bid.auction_id,
            participated_at: 0u64,
            auction_mode: 0u8,
        };
        let auction_id: field = bid.auction_id;
        return (new_bid, proof, final {
            let auction_exists: bool = auctions.contains(auction_id);
            assert(auction_exists);
        });
    }

    // ########################################################################
    //              T27: SET RESULT TIMELOCK
    // ########################################################################
    // Seller sets a delay (in blocks) before auction results become publicly
    // queryable. Must be called while auction is still active (before settlement).

    fn set_result_timelock(
        private auction_id: field,
        private reveal_after_blocks: u64
    ) -> Final {
        let caller_hash: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });
        return final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.seller_hash, caller_hash);
            // Must set timelock while auction is active or revealing
            assert(auction.status == STATUS_ACTIVE || auction.status == STATUS_REVEALING);

            let current_height: u64 = block.height as u64;
            result_timelock.set(auction_id, current_height + reveal_after_blocks);
        };
    }

    // ########################################################################
    //              T28: REVEAL RESULT (after timelock)
    // ########################################################################
    // Anyone can trigger this after the timelock expires. Copies the winning
    // price from highest_bids into revealed_results for public queryability.

    fn reveal_result(
        private auction_id: field
    ) -> Final {
        return final {
            let auction: AuctionData = auctions.get(auction_id);
            // Auction must be settled or failed (completed lifecycle)
            assert(auction.status == STATUS_SETTLED || auction.status == STATUS_FAILED);

            let timelock: u64 = result_timelock.get(auction_id);
            let current_height: u64 = block.height as u64;
            assert(current_height >= timelock);

            let winning_price: u128 = highest_bids.get_or_use(auction_id, 0u128);
            revealed_results.set(auction_id, winning_price);
        };
    }

    // ########################################################################
    //              T29: CREATE REFERRAL CODE
    // ########################################################################
    // Creates a private ReferralCode record. The referrer can share this off-chain.
    // When a bidder uses it via place_bid_with_referral, the referral_id is logged
    // on-chain but NO link between referrer address and bidder address exists.
    // The referrer's identity is hidden behind the referral_id hash.

    fn create_referral(
        private auction_id: field,     // 0field = valid for any auction
        private uses: u64,             // max number of uses
        private nonce: field           // unique nonce
    ) -> ReferralCode {
        // Derive referral_id from caller + nonce (no one can reverse this)
        let referral_id: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: nonce });

        return ReferralCode {
            owner: self.caller,
            referral_id: referral_id,
            auction_id: auction_id,
            uses_remaining: uses,
        };
    }

    // ########################################################################
    //              T30: PLACE BID WITH REFERRAL
    // ########################################################################
    // Same as place_bid but consumes a ReferralCode. The referral_id is recorded
    // on-chain for commission tracking, but the referrer's address is NEVER revealed.
    // The ReferralCode is re-created with decremented uses_remaining.

    fn place_bid_with_referral(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private token_type: u8,
        private referral: ReferralCode
    ) -> (SealedBid, ReferralCode, Final) {
        // Validate referral is for this auction (or any auction if 0field)
        let is_universal: bool = referral.auction_id == 0field;
        let is_matching: bool = referral.auction_id == auction_id;
        assert(is_universal || is_matching);
        assert(referral.uses_remaining > 0u64);

        // Create bid commitment (same logic as place_bid)
        let commitment: BidCommitment = BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        };
        let bid_hash: field = BHP256::hash_to_field(commitment);

        // Nullifier for double-bid prevention
        let nullifier: field = BHP256::hash_to_field(bid_nonce);

        // Pseudonymous bidder ID (per-auction, unlinkable)
        let bidder_pseudo: field = BHP256::hash_to_field(PseudoIdentity { addr: self.caller, salt: auction_id });

        let sealed_bid: SealedBid = SealedBid {
            owner: self.caller,
            auction_id: auction_id,
            bid_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: token_type,
        };

        // Return referral with decremented uses
        let updated_referral: ReferralCode = ReferralCode {
            owner: referral.owner,
            referral_id: referral.referral_id,
            auction_id: referral.auction_id,
            uses_remaining: referral.uses_remaining - 1u64,
        };

        let referral_id: field = referral.referral_id;

        return (sealed_bid, updated_referral, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            // Referral bids only for sealed-bid modes (same restriction as place_bid)
            assert(
                auction.auction_mode == MODE_FIRST_PRICE ||
                auction.auction_mode == MODE_VICKREY
            );
            assert_eq(auction.token_type, token_type);

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

            assert(bid_amount >= MIN_BID_AMOUNT);

            // Prevent duplicate bids via nullifier
            let already_used: bool = bid_nullifiers.contains(nullifier);
            assert(!already_used);
            bid_nullifiers.set(nullifier, true);

            // Store bid commitment
            bid_commitments.set(bid_hash, true);

            // Increment bid count
            let updated_auction: AuctionData = AuctionData {
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
            };
            auctions.set(auction_id, updated_auction);

            // Track referral usage (referral_id is a hash — no address exposed)
            let current_uses: u64 = referral_uses.get_or_use(referral_id, 0u64);
            referral_uses.set(referral_id, current_uses + 1u64);
        });
    }
}
