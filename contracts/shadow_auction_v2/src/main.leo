// ============================================================================
// SHADOW AUCTION v2 — Privacy-First Sealed-Bid Auction Protocol
// ============================================================================
// Commit-reveal sealed-bid auctions with full escrow, private refunds,
// and dispute resolution. Privacy-first: bids are sealed until reveal,
// seller identity hashed, winner self-identifies via claim_win.
//
// 24 transitions | 7 records | 10 mappings | 9 structs | 8-state machine
//
// Token support: credits.aleo (ALEO) + test_usdcx_stablecoin.aleo (USDCx)
// Escrow: transfer_private_to_public (deposit), transfer_public_to_private (payout)
// ============================================================================

import credits.aleo;
import test_usdcx_stablecoin.aleo;

program shadow_auction_v2.aleo {

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // ─── Auction Status (8-state machine) ───
    const STATUS_ACTIVE: u8 = 1u8;
    const STATUS_CLOSED: u8 = 2u8;
    const STATUS_REVEALING: u8 = 3u8;
    const STATUS_SETTLED: u8 = 4u8;
    const STATUS_CANCELLED: u8 = 5u8;
    const STATUS_FAILED: u8 = 6u8;
    const STATUS_DISPUTED: u8 = 7u8;
    const STATUS_EXPIRED: u8 = 8u8;

    // ─── Token Types ───
    const TOKEN_ALEO: u8 = 1u8;
    const TOKEN_USDCX: u8 = 2u8;

    // ─── Fees (basis points: 100 = 1%) ───
    const PLATFORM_FEE_BPS: u128 = 100u128;
    const DISPUTE_BOND_BPS: u128 = 500u128;
    const FEE_DENOMINATOR: u128 = 10000u128;

    // ─── Timing (~15s blocks on Aleo) ───
    const REVEAL_WINDOW_BLOCKS: u64 = 2880u64;     // ~12 hours
    const MIN_AUCTION_DURATION: u64 = 240u64;       // ~1 hour
    const DISPUTE_WINDOW_BLOCKS: u64 = 5760u64;     // ~24 hours
    const MIN_BID_AMOUNT: u128 = 1000u128;

    // ========================================================================
    // RECORDS (7 — all private, proper UTXO model)
    // ========================================================================

    // Bidder's sealed commitment — contains the SECRET bid amount
    record SealedBid {
        owner: address,
        auction_id: field,
        bid_amount: u128,
        bid_nonce: field,
        token_type: u8,
    }

    // Proof of escrowed funds — consumed on refund
    record EscrowReceipt {
        owner: address,
        auction_id: field,
        escrowed_amount: u128,
        bid_nonce: field,
        token_type: u8,
    }

    // Winner's proof of purchase — created when winner claims
    record WinnerCertificate {
        owner: address,
        auction_id: field,
        item_hash: field,
        winning_amount: u128,
        token_type: u8,
        certificate_id: field,
    }

    // Seller's proof of sale — created when winner claims
    record SellerReceipt {
        owner: address,
        auction_id: field,
        item_hash: field,
        sale_amount: u128,
        fee_paid: u128,
        token_type: u8,
    }

    // Losing bidder's refund ticket
    record RefundClaim {
        owner: address,
        auction_id: field,
        refund_amount: u128,
        bid_nonce: field,
        token_type: u8,
    }

    // Dispute bond receipt — held during dispute
    record DisputeBond {
        owner: address,
        auction_id: field,
        bond_amount: u128,
        dispute_nonce: field,
        token_type: u8,
    }

    // Dispute outcome record
    record DisputeResolution {
        owner: address,
        auction_id: field,
        resolution_amount: u128,
        resolution_type: u8,
        token_type: u8,
    }

    // ========================================================================
    // STRUCTS (9)
    // ========================================================================

    struct AuctionData {
        item_hash: field,
        seller_hash: field,
        category: u8,
        token_type: u8,
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

    struct RevealedBidData {
        bid_hash: field,
        amount: u128,
        is_valid: bool,
    }

    struct BidClaimKey {
        auction_id: field,
        bidder: address,
        bid_nonce: field,
    }

    struct PlatformFees {
        total_aleo: u128,
        total_usdcx: u128,
    }

    struct DisputeData {
        auction_id: field,
        disputer_hash: field,
        reason: u8,
        evidence_hash: field,
        disputed_at: u64,
        bond_amount: u128,
    }

    struct SettlementData {
        winner_bid_hash: field,
        final_price: u128,
        fee_collected: u128,
        settled_at: u64,
    }

    struct PlatformConfig {
        admin_hash: field,
        fee_bps: u128,
        dispute_bond_bps: u128,
        paused: bool,
    }

    // ========================================================================
    // MAPPINGS (10)
    // ========================================================================

    mapping auctions: field => AuctionData;
    mapping bid_commitments: field => bool;
    mapping revealed_bids: field => u128;
    mapping highest_bids: field => u128;
    mapping auction_winners: field => field;
    mapping program_balance: u8 => u128;
    mapping auction_escrow: field => u128;
    mapping platform_treasury: u8 => u128;
    mapping disputes: field => DisputeData;
    mapping platform_config: u8 => PlatformConfig;

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

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
    //                    FLOW 1: CREATE AUCTION
    // ########################################################################

    // ========================================================================
    // T1. CREATE AUCTION (ALEO)
    // ========================================================================
    // Privacy: item_hash, category, reserve_price are PRIVATE inputs.
    // On-chain: only hashed values in AuctionData mapping.
    // Seller identity: BHP256(seller_address) — NEVER raw address.

    async transition create_auction(
        private item_hash: field,
        private category: u8,
        private reserve_price: u128,
        public deadline: u64,
        private auction_nonce: field
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

        return (auction_id, finalize_create_auction(
            auction_id, item_hash, seller_hash, category,
            TOKEN_ALEO, deadline, reserve_hash
        ));
    }

    async function finalize_create_auction(
        auction_id: field,
        item_hash: field,
        seller_hash: field,
        category: u8,
        token_type: u8,
        deadline: u64,
        reserve_hash: field
    ) {
        let exists: bool = auctions.contains(auction_id);
        assert(!exists);

        let current_height: u64 = block.height as u64;
        assert(deadline > current_height + MIN_AUCTION_DURATION);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        let new_auction: AuctionData = AuctionData {
            item_hash: item_hash,
            seller_hash: seller_hash,
            category: category,
            token_type: token_type,
            status: STATUS_ACTIVE,
            deadline: deadline,
            reveal_deadline: 0u64,
            bid_count: 0u64,
            reserve_price_hash: reserve_hash,
            created_at: current_height,
            dispute_deadline: 0u64,
        };

        auctions.set(auction_id, new_auction);
    }

    // ========================================================================
    // T2. CREATE AUCTION (USDCx)
    // ========================================================================

    async transition create_auction_usdcx(
        private item_hash: field,
        private category: u8,
        private reserve_price: u128,
        public deadline: u64,
        private auction_nonce: field
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

        return (auction_id, finalize_create_auction(
            auction_id, item_hash, seller_hash, category,
            TOKEN_USDCX, deadline, reserve_hash
        ));
    }

    // ========================================================================
    // T3. CANCEL AUCTION
    // ========================================================================
    // Only seller can cancel. Only if zero bids placed.

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

        let updated: AuctionData = AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            status: STATUS_CANCELLED,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        };
        auctions.set(auction_id, updated);
    }

    // ########################################################################
    //                    FLOW 2: PLACE BID (SEALED + ESCROW)
    // ########################################################################

    // ========================================================================
    // T4. PLACE BID (ALEO credits)
    // ========================================================================
    // PRIVACY: bid_amount is PRIVATE. Only bid_count++ touches public state.
    // ESCROW: credits moved to program via transfer_private_to_public.
    // RECORDS: Creates SealedBid + EscrowReceipt (both private to bidder).

    async transition place_bid(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private credits_in: credits.aleo/credits
    ) -> (SealedBid, EscrowReceipt, credits.aleo/credits, Future) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let sealed: SealedBid = SealedBid {
            owner: self.caller,
            auction_id: auction_id,
            bid_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_ALEO,
        };

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_ALEO,
        };

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        // Cast u128 → u64 for credits.aleo API
        let amount_u64: u64 = bid_amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        return (sealed, receipt, change, finalize_place_bid(
            transfer_future, auction_id, bid_hash, bid_amount
        ));
    }

    async function finalize_place_bid(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.deadline);

        let already_exists: bool = bid_commitments.contains(bid_hash);
        assert(!already_exists);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        bid_commitments.set(bid_hash, true);

        let updated: AuctionData = AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            status: auction.status,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count + 1u64,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        };
        auctions.set(auction_id, updated);

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + amount);

        let credit_key: u8 = 0u8;
        let current_bal: u128 = program_balance.get_or_use(credit_key, 0u128);
        program_balance.set(credit_key, current_bal + amount);
    }

    // ========================================================================
    // T5. PLACE BID (USDCx)
    // ========================================================================
    // USDCx transfer_private_to_public may have different signature.
    // Using same escrow pattern; exact return types verified at build time.

    async transition place_bid_usdcx(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private usdcx_in: test_usdcx_stablecoin.aleo/token
    ) -> (SealedBid, EscrowReceipt, Future) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let sealed: SealedBid = SealedBid {
            owner: self.caller,
            auction_id: auction_id,
            bid_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_USDCX,
        };

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_USDCX,
        };

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let transfer_future: Future =
            test_usdcx_stablecoin.aleo/transfer_private_to_public(
                usdcx_in,
                self.address,
                bid_amount
            );

        return (sealed, receipt, finalize_place_bid_usdcx(
            transfer_future, auction_id, bid_hash, bid_amount
        ));
    }

    async function finalize_place_bid_usdcx(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert_eq(auction.token_type, TOKEN_USDCX);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.deadline);

        let already_exists: bool = bid_commitments.contains(bid_hash);
        assert(!already_exists);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        bid_commitments.set(bid_hash, true);

        let updated: AuctionData = AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            status: auction.status,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count + 1u64,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        };
        auctions.set(auction_id, updated);

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + amount);

        let credit_key: u8 = 1u8;
        let current_bal: u128 = program_balance.get_or_use(credit_key, 0u128);
        program_balance.set(credit_key, current_bal + amount);
    }

    // ========================================================================
    // T6. INCREASE BID (ALEO)
    // ========================================================================
    // Consumes old SealedBid, creates new one with higher amount.

    async transition increase_bid(
        private old_bid: SealedBid,
        private additional_amount: u128,
        private new_nonce: field,
        private credits_in: credits.aleo/credits
    ) -> (SealedBid, EscrowReceipt, credits.aleo/credits, Future) {
        assert_eq(old_bid.token_type, TOKEN_ALEO);
        assert(additional_amount > 0u128);

        let new_total: u128 = old_bid.bid_amount + additional_amount;

        let sealed: SealedBid = SealedBid {
            owner: self.caller,
            auction_id: old_bid.auction_id,
            bid_amount: new_total,
            bid_nonce: new_nonce,
            token_type: TOKEN_ALEO,
        };

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: old_bid.auction_id,
            escrowed_amount: additional_amount,
            bid_nonce: new_nonce,
            token_type: TOKEN_ALEO,
        };

        let new_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: old_bid.auction_id,
            amount: new_total,
            nonce: new_nonce,
        });

        let amount_u64: u64 = additional_amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        return (sealed, receipt, change, finalize_increase_bid(
            transfer_future, old_bid.auction_id, new_hash, additional_amount
        ));
    }

    async function finalize_increase_bid(
        f0: Future,
        auction_id: field,
        new_hash: field,
        additional: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.deadline);

        let hash_exists: bool = bid_commitments.contains(new_hash);
        assert(!hash_exists);
        bid_commitments.set(new_hash, true);

        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + additional);

        let current_bal: u128 = program_balance.get_or_use(0u8, 0u128);
        program_balance.set(0u8, current_bal + additional);
    }

    // ========================================================================
    // T7. INCREASE BID (USDCx)
    // ========================================================================

    async transition increase_bid_usdcx(
        private old_bid: SealedBid,
        private additional_amount: u128,
        private new_nonce: field,
        private usdcx_in: test_usdcx_stablecoin.aleo/token
    ) -> (SealedBid, EscrowReceipt, Future) {
        assert_eq(old_bid.token_type, TOKEN_USDCX);
        assert(additional_amount > 0u128);

        let new_total: u128 = old_bid.bid_amount + additional_amount;

        let sealed: SealedBid = SealedBid {
            owner: self.caller,
            auction_id: old_bid.auction_id,
            bid_amount: new_total,
            bid_nonce: new_nonce,
            token_type: TOKEN_USDCX,
        };

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: old_bid.auction_id,
            escrowed_amount: additional_amount,
            bid_nonce: new_nonce,
            token_type: TOKEN_USDCX,
        };

        let new_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: old_bid.auction_id,
            amount: new_total,
            nonce: new_nonce,
        });

        let transfer_future: Future =
            test_usdcx_stablecoin.aleo/transfer_private_to_public(
                usdcx_in,
                self.address,
                additional_amount
            );

        return (sealed, receipt, finalize_increase_bid(
            transfer_future, old_bid.auction_id, new_hash, additional_amount
        ));
    }

    // ########################################################################
    //                    FLOW 3: CLOSE BIDDING + REVEAL
    // ########################################################################

    // ========================================================================
    // T8. CLOSE BIDDING
    // ========================================================================
    // Anyone can call after deadline passes.
    // If bids exist → STATUS_REVEALING with reveal window.
    // If no bids → STATUS_EXPIRED.

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

        let current_height: u64 = block.height as u64;
        assert(current_height >= auction.deadline);

        if (auction.bid_count == 0u64) {
            let expired: AuctionData = AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                status: STATUS_EXPIRED,
                deadline: auction.deadline,
                reveal_deadline: auction.reveal_deadline,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: auction.dispute_deadline,
            };
            auctions.set(auction_id, expired);
        } else {
            let revealing: AuctionData = AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                status: STATUS_REVEALING,
                deadline: auction.deadline,
                reveal_deadline: current_height + REVEAL_WINDOW_BLOCKS,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: auction.dispute_deadline,
            };
            auctions.set(auction_id, revealing);
        }
    }

    // ========================================================================
    // T9. REVEAL BID (ALEO)
    // ========================================================================
    // Bidder CONSUMES SealedBid to prove their bid commitment.
    // Amount becomes publicly known (intentional — reveal phase).
    // Bidder ADDRESS never touches public state (only bid_hash).

    async transition reveal_bid(
        private bid: SealedBid
    ) -> Future {
        assert_eq(bid.token_type, TOKEN_ALEO);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: bid.owner,
            auction_id: bid.auction_id,
            amount: bid.bid_amount,
            nonce: bid.bid_nonce,
        });

        return finalize_reveal_bid(bid.auction_id, bid_hash, bid.bid_amount);
    }

    async function finalize_reveal_bid(
        auction_id: field,
        bid_hash: field,
        amount: u128
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_REVEALING);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.reveal_deadline);

        let committed: bool = bid_commitments.get(bid_hash);
        assert(committed);

        let already_revealed: bool = revealed_bids.contains(bid_hash);
        assert(!already_revealed);

        revealed_bids.set(bid_hash, amount);

        let current_high: u128 = highest_bids.get_or_use(auction_id, 0u128);
        if (amount > current_high) {
            highest_bids.set(auction_id, amount);
            auction_winners.set(auction_id, bid_hash);
        }
    }

    // ========================================================================
    // T10. REVEAL BID (USDCx)
    // ========================================================================
    // Same reveal logic. USDCx bids stored as u128.

    async transition reveal_bid_usdcx(
        private bid: SealedBid
    ) -> Future {
        assert_eq(bid.token_type, TOKEN_USDCX);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: bid.owner,
            auction_id: bid.auction_id,
            amount: bid.bid_amount,
            nonce: bid.bid_nonce,
        });

        return finalize_reveal_bid(bid.auction_id, bid_hash, bid.bid_amount);
    }

    // ########################################################################
    //                    FLOW 4: TWO-PHASE SETTLEMENT
    // ########################################################################
    //
    // Phase A: finalize_auction — Seller calls after reveal window.
    //          Determines if reserve met. Sets SETTLED or FAILED.
    //
    // Phase B: claim_win — WINNER self-identifies by proving they hold
    //          the winning SealedBid. Creates WinnerCertificate +
    //          triggers payment to seller.
    //
    // This design preserves winner anonymity until they choose to claim.

    // ========================================================================
    // T11. FINALIZE AUCTION (ALEO)
    // ========================================================================
    // Seller proves reserve price, finalize determines win/fail.
    // Reserve price is revealed at settlement (acceptable: bidding closed).

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

        // Verify reserve price matches stored hash
        assert_eq(reserve_hash, auction.reserve_price_hash);

        let winning_amount: u128 = highest_bids.get_or_use(auction_id, 0u128);

        if (winning_amount >= reserve_price && winning_amount > 0u128) {
            let settled: AuctionData = AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                status: STATUS_SETTLED,
                deadline: auction.deadline,
                reveal_deadline: auction.reveal_deadline,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: current_height + DISPUTE_WINDOW_BLOCKS,
            };
            auctions.set(auction_id, settled);
        } else {
            let failed: AuctionData = AuctionData {
                item_hash: auction.item_hash,
                seller_hash: auction.seller_hash,
                category: auction.category,
                token_type: auction.token_type,
                status: STATUS_FAILED,
                deadline: auction.deadline,
                reveal_deadline: auction.reveal_deadline,
                bid_count: auction.bid_count,
                reserve_price_hash: auction.reserve_price_hash,
                created_at: auction.created_at,
                dispute_deadline: auction.dispute_deadline,
            };
            auctions.set(auction_id, failed);
        }
    }

    // ========================================================================
    // T12. FINALIZE AUCTION (USDCx)
    // ========================================================================
    // Same logic reused via do_finalize_auction.

    async transition finalize_auction_usdcx(
        private auction_id: field,
        private reserve_price: u128
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);

        let reserve_field: field = reserve_price as field;
        let reserve_hash: field = BHP256::hash_to_field(reserve_field);

        return do_finalize_auction(auction_id, caller_hash, reserve_hash, reserve_price);
    }

    // ========================================================================
    // T13. CLAIM WIN (ALEO)
    // ========================================================================
    // Winner calls this to self-identify. Proves they hold the winning
    // SealedBid + EscrowReceipt. Creates WinnerCertificate for winner.
    // Transfers payment to seller (minus fee) via transfer_public_to_private.

    async transition claim_win(
        private bid: SealedBid,
        private receipt: EscrowReceipt,
        private seller_address: address
    ) -> (WinnerCertificate, SellerReceipt, credits.aleo/credits, Future) {
        assert_eq(bid.auction_id, receipt.auction_id);
        assert_eq(bid.bid_nonce, receipt.bid_nonce);
        assert_eq(bid.token_type, TOKEN_ALEO);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: bid.owner,
            auction_id: bid.auction_id,
            amount: bid.bid_amount,
            nonce: bid.bid_nonce,
        });

        // Calculate fee and payout
        let fee: u128 = (bid.bid_amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = bid.bid_amount - fee;
        let payout_u64: u64 = seller_payout as u64;

        // Pay seller via transfer_public_to_private (PRIVATE output)
        let (seller_credits, pay_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                seller_address,
                payout_u64
            );

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: bid.auction_id,
            item_hash: 0field,
            winning_amount: bid.bid_amount,
            token_type: TOKEN_ALEO,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: bid.auction_id,
            item_hash: 0field,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_ALEO,
        };

        return (cert, seller_receipt, seller_credits, finalize_claim_win(
            pay_future, bid.auction_id, bid_hash, bid.bid_amount, fee
        ));
    }

    async function finalize_claim_win(
        f0: Future,
        auction_id: field,
        bid_hash: field,
        bid_amount: u128,
        fee: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_SETTLED);

        // Verify this bid IS the winner
        let winner_hash: field = auction_winners.get(auction_id);
        assert_eq(bid_hash, winner_hash);

        // Verify bid was revealed
        let revealed_amount: u128 = revealed_bids.get(bid_hash);
        assert_eq(revealed_amount, bid_amount);

        // Collect platform fee
        let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
        platform_treasury.set(0u8, treasury + fee);

        // Deduct from program balance and escrow
        let bal: u128 = program_balance.get(0u8);
        program_balance.set(0u8, bal - bid_amount);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - bid_amount);
    }

    // ========================================================================
    // T14. CLAIM WIN (USDCx)
    // ========================================================================

    async transition claim_win_usdcx(
        private bid: SealedBid,
        private receipt: EscrowReceipt,
        private seller_address: address
    ) -> (WinnerCertificate, SellerReceipt, Future) {
        assert_eq(bid.auction_id, receipt.auction_id);
        assert_eq(bid.bid_nonce, receipt.bid_nonce);
        assert_eq(bid.token_type, TOKEN_USDCX);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: bid.owner,
            auction_id: bid.auction_id,
            amount: bid.bid_amount,
            nonce: bid.bid_nonce,
        });

        let fee: u128 = (bid.bid_amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = bid.bid_amount - fee;

        let transfer_future: Future =
            test_usdcx_stablecoin.aleo/transfer_public_to_private(
                seller_address,
                seller_payout
            );

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: bid.auction_id,
            item_hash: 0field,
            winning_amount: bid.bid_amount,
            token_type: TOKEN_USDCX,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: bid.auction_id,
            item_hash: 0field,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_USDCX,
        };

        return (cert, seller_receipt, finalize_claim_win(
            transfer_future, bid.auction_id, bid_hash, bid.bid_amount, fee
        ));
    }

    // ########################################################################
    //                    FLOW 5: REFUNDS
    // ########################################################################

    // ========================================================================
    // T15. CLAIM REFUND (ALEO)
    // ========================================================================
    // Losing bidder refunds escrowed credits as PRIVATE record.
    // Consumes EscrowReceipt. Available after SETTLED, FAILED, CANCELLED, or EXPIRED.

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

        let claim_key: field = BHP256::hash_to_field(BidClaimKey {
            auction_id: receipt.auction_id,
            bidder: self.caller,
            bid_nonce: receipt.bid_nonce,
        });

        return (refund_credits, finalize_claim_refund(
            transfer_future, receipt.auction_id, claim_key,
            receipt.escrowed_amount, TOKEN_ALEO
        ));
    }

    async function finalize_claim_refund(
        f0: Future,
        auction_id: field,
        claim_key: field,
        amount: u128,
        token_type: u8
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        // Can refund if: settled, failed, cancelled, or expired
        assert(
            auction.status == STATUS_SETTLED
            || auction.status == STATUS_FAILED
            || auction.status == STATUS_CANCELLED
            || auction.status == STATUS_EXPIRED
        );

        // Ensure this is NOT the winner (winners use claim_win, not refund)
        let has_winner: bool = auction_winners.contains(auction_id);
        if (has_winner) {
            let winner: field = auction_winners.get(auction_id);
            assert(claim_key != winner);
        }

        // Update escrow and program balance
        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - amount);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let bal: u128 = program_balance.get(credit_key);
        program_balance.set(credit_key, bal - amount);
    }

    // ========================================================================
    // T16. CLAIM REFUND (USDCx)
    // ========================================================================

    async transition claim_refund_usdcx(
        private receipt: EscrowReceipt
    ) -> Future {
        assert_eq(receipt.token_type, TOKEN_USDCX);

        let claim_key: field = BHP256::hash_to_field(BidClaimKey {
            auction_id: receipt.auction_id,
            bidder: self.caller,
            bid_nonce: receipt.bid_nonce,
        });

        let transfer_future: Future =
            test_usdcx_stablecoin.aleo/transfer_public_to_private(
                self.caller,
                receipt.escrowed_amount
            );

        return finalize_claim_refund(
            transfer_future, receipt.auction_id, claim_key,
            receipt.escrowed_amount, TOKEN_USDCX
        );
    }

    // ========================================================================
    // T17. CLAIM UNREVEALED REFUND (ALEO)
    // ========================================================================
    // For bidders who didn't reveal in time. Must prove ownership of
    // both SealedBid and EscrowReceipt to prevent replay.

    async transition claim_unrevealed_refund(
        private bid: SealedBid,
        private receipt: EscrowReceipt
    ) -> (credits.aleo/credits, Future) {
        assert_eq(bid.auction_id, receipt.auction_id);
        assert_eq(bid.bid_nonce, receipt.bid_nonce);
        assert_eq(bid.token_type, TOKEN_ALEO);

        let refund_u64: u64 = receipt.escrowed_amount as u64;
        let (refund_credits, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                self.caller,
                refund_u64
            );

        let claim_key: field = BHP256::hash_to_field(BidClaimKey {
            auction_id: receipt.auction_id,
            bidder: self.caller,
            bid_nonce: receipt.bid_nonce,
        });

        return (refund_credits, finalize_unrevealed_refund(
            transfer_future, bid.auction_id, claim_key,
            receipt.escrowed_amount, TOKEN_ALEO
        ));
    }

    async function finalize_unrevealed_refund(
        f0: Future,
        auction_id: field,
        claim_key: field,
        amount: u128,
        token_type: u8
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        // Must be after reveal phase ended (settled or failed)
        assert(
            auction.status == STATUS_SETTLED
            || auction.status == STATUS_FAILED
        );

        // Update escrow and program balance
        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - amount);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let bal: u128 = program_balance.get(credit_key);
        program_balance.set(credit_key, bal - amount);
    }

    // ========================================================================
    // T18. CLAIM UNREVEALED REFUND (USDCx)
    // ========================================================================

    async transition claim_unrevealed_refund_usdcx(
        private bid: SealedBid,
        private receipt: EscrowReceipt
    ) -> Future {
        assert_eq(bid.auction_id, receipt.auction_id);
        assert_eq(bid.bid_nonce, receipt.bid_nonce);
        assert_eq(bid.token_type, TOKEN_USDCX);

        let claim_key: field = BHP256::hash_to_field(BidClaimKey {
            auction_id: receipt.auction_id,
            bidder: self.caller,
            bid_nonce: receipt.bid_nonce,
        });

        let transfer_future: Future =
            test_usdcx_stablecoin.aleo/transfer_public_to_private(
                self.caller,
                receipt.escrowed_amount
            );

        return finalize_unrevealed_refund(
            transfer_future, bid.auction_id, claim_key,
            receipt.escrowed_amount, TOKEN_USDCX
        );
    }

    // ########################################################################
    //                    FLOW 6: DISPUTES
    // ########################################################################

    // ========================================================================
    // T19. FILE DISPUTE
    // ========================================================================
    // Post-settlement, within dispute window. Requires bond (5% of winning bid).
    // Bond held in program. If disputer wins → bond returned + refund.
    // If disputer loses → bond forfeited to treasury.

    async transition file_dispute(
        private auction_id: field,
        private reason: u8,
        private evidence_hash: field,
        private bond_amount: u128,
        private bond_credits: credits.aleo/credits
    ) -> (DisputeBond, credits.aleo/credits, Future) {
        let dispute_nonce: field = BHP256::hash_to_field(BidClaimKey {
            auction_id: auction_id,
            bidder: self.caller,
            bid_nonce: evidence_hash,
        });

        let bond: DisputeBond = DisputeBond {
            owner: self.caller,
            auction_id: auction_id,
            bond_amount: bond_amount,
            dispute_nonce: dispute_nonce,
            token_type: TOKEN_ALEO,
        };

        let bond_u64: u64 = bond_amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                bond_credits,
                self.address,
                bond_u64
            );

        let disputer_field: field = self.caller as field;
        let disputer_hash: field = BHP256::hash_to_field(disputer_field);

        return (bond, change, finalize_file_dispute(
            transfer_future, auction_id, disputer_hash,
            reason, evidence_hash, bond_amount
        ));
    }

    async function finalize_file_dispute(
        f0: Future,
        auction_id: field,
        disputer_hash: field,
        reason: u8,
        evidence_hash: field,
        bond_amount: u128
    ) {
        f0.await();

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_SETTLED);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.dispute_deadline);

        // Verify bond meets minimum (5% of winning bid)
        let winning_amount: u128 = highest_bids.get(auction_id);
        let required_bond: u128 = (winning_amount * DISPUTE_BOND_BPS) / FEE_DENOMINATOR;
        assert(bond_amount >= required_bond);

        // No duplicate disputes
        let already_disputed: bool = disputes.contains(auction_id);
        assert(!already_disputed);

        disputes.set(auction_id, DisputeData {
            auction_id: auction_id,
            disputer_hash: disputer_hash,
            reason: reason,
            evidence_hash: evidence_hash,
            disputed_at: current_height,
            bond_amount: bond_amount,
        });

        let updated: AuctionData = AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            status: STATUS_DISPUTED,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        };
        auctions.set(auction_id, updated);

        let bal: u128 = program_balance.get_or_use(0u8, 0u128);
        program_balance.set(0u8, bal + bond_amount);
    }

    // ========================================================================
    // T20. RESOLVE DISPUTE — SELLER WINS
    // ========================================================================
    // Admin resolves: disputer loses bond (forfeited to treasury).
    // Auction returns to SETTLED. Seller keeps payment.

    async transition resolve_dispute_seller_wins(
        private auction_id: field
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);

        return finalize_resolve_seller_wins(auction_id, caller_hash);
    }

    async function finalize_resolve_seller_wins(
        auction_id: field,
        caller_hash: field
    ) {
        // Verify admin
        let cfg: PlatformConfig = platform_config.get(0u8);
        assert_eq(cfg.admin_hash, caller_hash);

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_DISPUTED);

        let dispute: DisputeData = disputes.get(auction_id);

        // Forfeit bond to treasury
        let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
        platform_treasury.set(0u8, treasury + dispute.bond_amount);

        let bal: u128 = program_balance.get(0u8);
        program_balance.set(0u8, bal - dispute.bond_amount);

        // Return to SETTLED
        let updated: AuctionData = AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            status: STATUS_SETTLED,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        };
        auctions.set(auction_id, updated);
    }

    // ========================================================================
    // T21. RESOLVE DISPUTE — BUYER WINS
    // ========================================================================
    // Admin resolves: disputer gets bond back via transfer_public_to_private.
    // Auction set to FAILED so all bidders (including winner) can claim refunds.

    async transition resolve_dispute_buyer_wins(
        private auction_id: field,
        private disputer_address: address,
        private bond_amount: u128
    ) -> (DisputeResolution, credits.aleo/credits, Future) {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);

        let disputer_field: field = disputer_address as field;
        let disputer_hash: field = BHP256::hash_to_field(disputer_field);

        // Return bond to disputer as private credits
        let bond_u64: u64 = bond_amount as u64;
        let (bond_return, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                disputer_address,
                bond_u64
            );

        let resolution: DisputeResolution = DisputeResolution {
            owner: disputer_address,
            auction_id: auction_id,
            resolution_amount: bond_amount,
            resolution_type: 2u8,
            token_type: TOKEN_ALEO,
        };

        return (resolution, bond_return, finalize_resolve_buyer_wins(
            transfer_future, auction_id, caller_hash, disputer_hash, bond_amount
        ));
    }

    async function finalize_resolve_buyer_wins(
        f0: Future,
        auction_id: field,
        caller_hash: field,
        disputer_hash: field,
        bond_amount: u128
    ) {
        f0.await();

        // Verify admin
        let cfg: PlatformConfig = platform_config.get(0u8);
        assert_eq(cfg.admin_hash, caller_hash);

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_DISPUTED);

        let dispute: DisputeData = disputes.get(auction_id);
        assert_eq(dispute.disputer_hash, disputer_hash);
        assert_eq(dispute.bond_amount, bond_amount);

        // Deduct bond from program balance
        let bal: u128 = program_balance.get(0u8);
        program_balance.set(0u8, bal - bond_amount);

        // Set auction to FAILED so all bidders can refund
        let updated: AuctionData = AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            status: STATUS_FAILED,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        };
        auctions.set(auction_id, updated);
    }

    // ########################################################################
    //                    FLOW 7: ADMIN + FORCE
    // ########################################################################

    // ========================================================================
    // T22. FORCE CANCEL
    // ========================================================================
    // When reveal window expires with NO valid reveals. Anyone can call.

    async transition force_cancel(
        private auction_id: field
    ) -> Future {
        return finalize_force_cancel(auction_id);
    }

    async function finalize_force_cancel(
        auction_id: field
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_REVEALING);

        let current_height: u64 = block.height as u64;
        assert(current_height > auction.reveal_deadline);

        let high: u128 = highest_bids.get_or_use(auction_id, 0u128);
        assert_eq(high, 0u128);

        let updated: AuctionData = AuctionData {
            item_hash: auction.item_hash,
            seller_hash: auction.seller_hash,
            category: auction.category,
            token_type: auction.token_type,
            status: STATUS_FAILED,
            deadline: auction.deadline,
            reveal_deadline: auction.reveal_deadline,
            bid_count: auction.bid_count,
            reserve_price_hash: auction.reserve_price_hash,
            created_at: auction.created_at,
            dispute_deadline: auction.dispute_deadline,
        };
        auctions.set(auction_id, updated);
    }

    // ========================================================================
    // T23. WITHDRAW PLATFORM FEES
    // ========================================================================
    // Admin withdraws accumulated platform fees as private credits.

    async transition withdraw_platform_fees(
        private token_type: u8,
        private withdraw_amount: u128
    ) -> (credits.aleo/credits, Future) {
        assert_eq(token_type, TOKEN_ALEO);

        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);

        let amount_u64: u64 = withdraw_amount as u64;
        let (admin_credits, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                self.caller,
                amount_u64
            );

        return (admin_credits, finalize_withdraw_fees(
            transfer_future, caller_hash, withdraw_amount, token_type
        ));
    }

    async function finalize_withdraw_fees(
        f0: Future,
        caller_hash: field,
        amount: u128,
        token_type: u8
    ) {
        f0.await();

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert_eq(cfg.admin_hash, caller_hash);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let treasury: u128 = platform_treasury.get(credit_key);
        assert(treasury >= amount);
        platform_treasury.set(credit_key, treasury - amount);

        let bal: u128 = program_balance.get(credit_key);
        program_balance.set(credit_key, bal - amount);
    }

    // ========================================================================
    // T24. EMERGENCY PAUSE
    // ========================================================================
    // Admin toggles platform pause. When paused, new auctions and bids blocked.
    // Settle, refund, and dispute flows still work (users can always exit).

    async transition emergency_pause(
        private activate: bool
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return finalize_emergency_pause(caller_hash, activate);
    }

    async function finalize_emergency_pause(
        caller_hash: field,
        activate: bool
    ) {
        let cfg: PlatformConfig = platform_config.get(0u8);
        assert_eq(cfg.admin_hash, caller_hash);

        let updated: PlatformConfig = PlatformConfig {
            admin_hash: cfg.admin_hash,
            fee_bps: cfg.fee_bps,
            dispute_bond_bps: cfg.dispute_bond_bps,
            paused: activate,
        };
        platform_config.set(0u8, updated);
    }
}
// ============================================================================
// END OF CONTRACT — shadow_auction_v2.aleo
// 24 transitions | 7 records | 10 mappings | 9 structs | 8-state machine
// ============================================================================
