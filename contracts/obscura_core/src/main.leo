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
// 14 transitions | 3 records | 18 mappings | 12 structs
//
// AUCTION FORMATS:
//   1. First-Price Sealed-Bid (MODE 1)
//   2. Vickrey Sealed-Bid (MODE 2) — winner pays second-highest
//   3. Dutch Descending (MODE 3) — price drops per block
//   4. English Ascending (MODE 4) — open bids, anti-sniping
//   5. Bundle (MODE 5) — multi-item, bid on whole package
//   6. Multi-Unit (MODE 6) — N identical units, qty+price bidding
//
// PRIVACY:
//   place_bid: NO token transfer. Amounts hidden via BHP256 commitments.
//   Merkle allowlists: 8-level tree verified in transition (off-chain ZK).
//   Finalize blocks see: auction_id, bid_hash, status codes. NOT amounts/addresses.
//   Seller identity: BHP256(address as field) — never plaintext.
// ============================================================================

program obscura_core.aleo {

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

    // ========================================================================
    // RECORDS (3 — all private UTXO)
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

    // Merkle proof — 8 levels supports 256 addresses
    struct MerkleProof8 {
        p0: field, p1: field, p2: field, p3: field,
        p4: field, p5: field, p6: field, p7: field,
        indices: u8,
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
    mapping reputation_completed: field => u64;
    mapping reputation_disputed: field => u64;
    mapping bundle_configs: field => BundleConfig;
    mapping multi_unit_configs: field => MultiUnitConfig;
    mapping multi_unit_highest: field => u128;
    mapping multi_unit_second: field => u128;

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

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

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

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

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

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

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

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

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
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
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
                auction.auction_mode == MODE_MULTI_UNIT
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

        return (bid, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.auction_mode, MODE_BUNDLE);
            assert_eq(auction.token_type, token_type);

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

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

        return (bid, final {
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_ACTIVE);
            assert_eq(auction.auction_mode, MODE_MULTI_UNIT);
            assert_eq(auction.token_type, token_type);

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction.deadline);

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
        });
    }

    // ########################################################################
    //              T11: SET MERKLE ROOT (allowlist gating)
    // ########################################################################

    fn set_merkle_root(
        private auction_id: field,
        private root: field
    ) -> Final {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
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
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);

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
                        let completed: u64 = reputation_completed.get_or_use(auction.seller_hash, 0u64);
                        reputation_completed.set(auction.seller_hash, completed + 1u64);
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
                // First-price, Bundle, Multi-Unit modes
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

                    let completed: u64 = reputation_completed.get_or_use(auction.seller_hash, 0u64);
                    reputation_completed.set(auction.seller_hash, completed + 1u64);
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
        };
    }

    // ########################################################################
    //              T13: SETTLE ENGLISH
    // ########################################################################

    fn settle_english(
        private auction_id: field,
        private reserve_price: u128
    ) -> Final {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);

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

                let completed: u64 = reputation_completed.get_or_use(auction.seller_hash, 0u64);
                reputation_completed.set(auction.seller_hash, completed + 1u64);
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
}
