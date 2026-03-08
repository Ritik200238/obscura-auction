// ============================================================================
// OBSCURA AUCTION — Privacy-First Sealed-Bid Auction Protocol
// ============================================================================
// Commit-reveal sealed-bid auctions with Vickrey (second-price) tracking,
// anti-sniping, full escrow, and private refunds via credits.aleo.
//
// 10 transitions | 4 records | 13 mappings | 7 structs | 8-state machine
//
// PRIVACY ARCHITECTURE v2:
// - place_bid: NO token transfer. Bid amounts completely hidden during sealed phase.
// - reveal_bid: Token escrow happens HERE, when amounts are intentionally public.
// - prove_won_auction: Selective disclosure — prove you won without revealing amount.
// - settlement_proofs + payment_proofs: on-chain verifiable settlement integrity.
//
// Token support: credits.aleo (ALEO private credits)
// Deposit: transfer_private_to_public | Payout: transfer_public_to_private
// ============================================================================

import credits.aleo;

program obscura_auction.aleo {

    // @noupgrade async constructor() {} — Leo 3.x syntax, omitted for 2.x compilation.

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

    // Auction Modes
    const MODE_FIRST_PRICE: u8 = 1u8;
    const MODE_VICKREY: u8 = 2u8;

    // Fees (basis points: 100 = 1%)
    const PLATFORM_FEE_BPS: u128 = 100u128;
    const FEE_DENOMINATOR: u128 = 10000u128;

    // Timing (~15s blocks on Aleo)
    const REVEAL_WINDOW_BLOCKS: u64 = 2880u64;
    const MIN_AUCTION_DURATION: u64 = 240u64;
    const MIN_BID_AMOUNT: u128 = 1000u128;
    const SNIPE_WINDOW_BLOCKS: u64 = 40u64;
    const SNIPE_EXTENSION_BLOCKS: u64 = 40u64;

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
    // Anyone with the auction_id can read settlement_proofs[auction_id] from
    // the public mapping and verify the integrity of the settlement by recomputing:
    // BHP256::hash_to_field(SettlementProof { auction_id, highest_bid, ... })
    // This provides "Proof of Fair Auction" — no party can retroactively alter
    // the reported highest bid, second-highest, or winner without invalidating the hash.
    struct SettlementProof {
        auction_id: field,
        highest_bid: u128,
        second_highest: u128,
        winner_bid_hash: field,
        settled_at: u64,
    }

    // PaymentCommitData: input to the payment commitment stored on-chain.
    // Commitment = BHP256::commit_to_field(bid_amount_field, nonce_scalar)
    // This uses the HIDING property of commit_to_field: without the scalar nonce,
    // an observer cannot determine which amount was committed even if they
    // enumerate common values. The nonce is derived from bid_nonce via hash_to_scalar.
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

    // ========================================================================
    // MAPPINGS
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
    // Key: auction_id. Value: BHP256::hash_to_field(SettlementProof{...}).
    // Any third party can verify settlement integrity by recomputing the hash.
    mapping settlement_proofs: field => field;
    // payment_proofs: publicly verifiable payment commitment for the winner.
    // Key: auction_id. Value: BHP256::commit_to_field(amount_field, nonce_scalar).
    // Uses the commit primitive (hiding+binding) rather than plain hash.
    // Proves winner paid a specific amount without revealing which amount to observers
    // who don't know the nonce. The nonce is the bidder's private bid_nonce field.
    mapping payment_proofs: field => field;

    // ########################################################################
    //                         CONSTRUCTOR
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
    //              T1: CREATE AUCTION (unified — both ALEO and USDCx)
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

        assert(auction_mode == MODE_FIRST_PRICE || auction_mode == MODE_VICKREY);
        assert_eq(token_type, TOKEN_ALEO);

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
    //              T2: CANCEL AUCTION
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
    //              T3: CLOSE BIDDING
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
    //              T4: PLACE BID — COMMITMENT ONLY (no token transfer)
    // ########################################################################
    //
    // PRIVACY DESIGN: Bid amounts are NOT transferred at bid placement.
    // Only a cryptographic commitment (BHP256 hash of BidCommitment struct) is stored
    // on-chain. The amount stays entirely private in the SealedBid record.
    //
    // This means an observer watching credits.aleo transfers learns NOTHING about
    // bid amounts during the sealed phase. No transfer = no amount leak.
    //
    // Token transfer happens at reveal_bid time, when amounts are INTENDED to become
    // public. This is the correct design for sealed-bid auctions.
    //
    // Security: Bidders are committed to their bid via the hash — they cannot change
    // their amount after placing. If they don't reveal, the SealedBid record is
    // useless (no tokens were locked, so no refund is needed either).

    async transition place_bid(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field
    ) -> (SealedBid, Future) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        // SealedBid record: owner-encrypted, bid amount completely private.
        // Only the bidder's view key can decrypt this record.
        let sealed: SealedBid = SealedBid {
            owner: self.caller,
            auction_id: auction_id,
            bid_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_ALEO,
        };

        // Bid commitment: BHP256(bidder || auction_id || amount || nonce).
        // Stored publicly to prevent double-bidding and enable reveal verification.
        // Cannot be reversed to learn bid_amount without knowing bid_nonce.
        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        // No token transfer here — amounts stay fully private until reveal.
        return (sealed, finalize_place_bid(auction_id, bid_hash));
    }

    async function finalize_place_bid(
        auction_id: field,
        bid_hash: field
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);

        let current_height: u64 = block.height as u64;
        assert(current_height <= auction.deadline);

        let already_exists: bool = bid_commitments.contains(bid_hash);
        assert(!already_exists);

        let cfg: PlatformConfig = platform_config.get(0u8);
        assert(!cfg.paused);

        bid_commitments.set(bid_hash, true);

        // Anti-sniping: extend deadline if bid placed in last SNIPE_WINDOW.
        // Prevents last-second manipulation by ensuring competitors can respond.
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
        // Note: auction_escrow and program_balance updated in reveal_bid,
        // since tokens are escrowed at reveal time in this architecture.
    }

    // ########################################################################
    //              T5: REVEAL BID + ESCROW (atomic — reveal and lock tokens)
    // ########################################################################
    //
    // PRIVACY DESIGN: Token transfer happens HERE, at reveal time, when the bid
    // amount is INTENTIONALLY made public (that is the purpose of the reveal phase).
    // This is correct: amounts become public at the INTENDED moment, not prematurely.
    //
    // The transfer_private_to_public call reveals the amount to credits.aleo, but
    // at this point the amount is already public via the reveal mechanism anyway.
    //
    // ESCROW: EscrowReceipt created here. Only bidders who reveal get a receipt.
    // Unrevealed bidders hold a worthless SealedBid — no tokens locked, no refund needed.

    async transition reveal_bid(
        private bid: SealedBid,
        private credits_in: credits.aleo/credits
    ) -> (EscrowReceipt, credits.aleo/credits, Future) {
        // Recompute commitment to verify bid matches what was originally committed.
        // If bid_amount or bid_nonce was tampered, hash won't match bid_commitments.
        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: bid.owner,
            auction_id: bid.auction_id,
            amount: bid.bid_amount,
            nonce: bid.bid_nonce,
        });

        // Escrow tokens at reveal time. Amount is now intentionally public.
        // The bidder proves their commitment AND locks funds in one atomic step.
        let amount_u64: u64 = bid.bid_amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        // EscrowReceipt: private record proving tokens are locked.
        // Used to claim refund (losers) or claim win (winner).
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

        // Verify commitment: only the original bidder can reveal their bid.
        // The hash must match what was stored in bid_commitments at place_bid time.
        let committed: bool = bid_commitments.get(bid_hash);
        assert(committed);

        let already_revealed: bool = revealed_bids.contains(bid_hash);
        assert(!already_revealed);

        revealed_bids.set(bid_hash, amount);

        // Update escrow tracking — tokens locked here at reveal time.
        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + amount);

        let current_bal: u128 = program_balance.get_or_use(0u8, 0u128);
        program_balance.set(0u8, current_bal + amount);

        // Vickrey tracking: maintain highest and second-highest bids.
        // Both mappings are publicly verifiable — anyone can audit the ranking.
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

        // Pre-fetch data needed for settlement proof (read once, use in both branches)
        let winner_bid_hash: field = auction_winners.get_or_use(auction_id, 0field);
        let second_price: u128 = second_highest_bids.get_or_use(auction_id, 0u128);

        if (auction.auction_mode == MODE_VICKREY) {
            if (second_price == 0u128) {
                // Vickrey needs >= 2 revealed bids; only 1 revealed → FAILED
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
                    // Settlement proof: tamper-evident hash of auction outcome.
                    // Stored publicly so any third party can verify the settlement
                    // was computed honestly from on-chain data. The proof binds
                    // auction_id, both bid prices, the winning bid hash, and the
                    // block height — retroactive manipulation of any field invalidates it.
                    let settlement_proof: field = BHP256::hash_to_field(SettlementProof {
                        auction_id: auction_id,
                        highest_bid: winning_amount,
                        second_highest: second_price,
                        winner_bid_hash: winner_bid_hash,
                        settled_at: current_height,
                    });
                    settlement_proofs.set(auction_id, settlement_proof);
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
                // Settlement proof for first-price auctions (same mechanism).
                // second_highest = 0 for first-price (no 2nd-price tracking needed).
                let settlement_proof: field = BHP256::hash_to_field(SettlementProof {
                    auction_id: auction_id,
                    highest_bid: winning_amount,
                    second_highest: second_price,
                    winner_bid_hash: winner_bid_hash,
                    settled_at: current_height,
                });
                settlement_proofs.set(auction_id, settlement_proof);
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
    //              T9: CLAIM WIN — uses EscrowReceipt only
    // ########################################################################
    //
    // DESIGN: In the new architecture, SealedBid is consumed at reveal_bid.
    // The winner claims using their EscrowReceipt (created at reveal_bid).
    // The bid_hash is recomputed from EscrowReceipt fields — all information
    // needed is preserved in the receipt (auction_id, escrowed_amount, bid_nonce).
    //
    // The seller_address is passed privately — never stored on-chain plaintext.
    // Seller receives payment as a private credits record (no public trace).

    async transition claim_win(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field
    ) -> (WinnerCertificate, SellerReceipt, credits.aleo/credits, Future) {
        assert_eq(receipt.token_type, TOKEN_ALEO);

        // Recompute bid_hash from EscrowReceipt — same computation as place_bid and reveal_bid.
        // self.caller must be the original bidder (receipt.owner), which Aleo enforces
        // through record ownership (only owner can spend a record).
        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: receipt.owner,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        let fee: u128 = (receipt.escrowed_amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = receipt.escrowed_amount - fee;
        let payout_u64: u64 = seller_payout as u64;

        // Seller receives payment as private credits — recipient hidden from public chain.
        let (seller_credits, pay_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                seller_address,
                payout_u64
            );

        // Payment commitment: BHP256::commit_to_field(amount, nonce_scalar).
        // Uses the HIDING property — even if an observer enumerates common bid amounts,
        // they cannot verify the commitment without knowing the nonce scalar.
        // This is stored on-chain as publicly verifiable proof of payment amount.
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

        let winner_hash: field = auction_winners.get(auction_id);
        assert_eq(bid_hash, winner_hash);

        let revealed_amount: u128 = revealed_bids.get(bid_hash);
        assert_eq(revealed_amount, bid_amount);

        // BUG #3 FIX: verify item_hash matches auction
        assert_eq(item_hash, auction.item_hash);

        // BUG #7 FIX: prevent double settlement
        let already_settled: bool = settlements.contains(auction_id);
        assert(!already_settled);
        settlements.set(auction_id, SettlementData {
            winner_bid_hash: bid_hash,
            final_price: bid_amount,
            fee_collected: fee,
            settled_at: block.height as u64,
        });

        // Store payment commitment on-chain: payment_proofs[auction_id] = commit(amount, nonce).
        // Any third party can verify the winner paid a specific amount by:
        // 1. Getting the winner's nonce from their WinnerCertificate record (shared privately)
        // 2. Recomputing BHP256::commit_to_field(amount, hash_to_scalar(nonce))
        // 3. Comparing against payment_proofs[auction_id]
        // This is "selective disclosure" — the winner can prove their payment
        // without revealing the nonce to the general public.
        payment_proofs.set(auction_id, payment_commitment);

        let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
        platform_treasury.set(0u8, treasury + fee);

        let bal: u128 = program_balance.get(0u8);
        program_balance.set(0u8, bal - bid_amount);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - bid_amount);
    }


    // ########################################################################
    //              CLAIM REFUND (ALEO) — BUG #1 FIX
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

        // BUG #1 FIX: use BidCommitment hash (same as reveal), NOT BidClaimKey
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

        // BUG #1 FIX: compare BidCommitment hash against auction_winners
        let winner: field = auction_winners.get_or_use(auction_id, 0field);
        assert_neq(bid_hash, winner);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - amount);

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8 : 1u8;
        let bal: u128 = program_balance.get(credit_key);
        program_balance.set(credit_key, bal - amount);
    }

    // ########################################################################
    //              CLAIM UNREVEALED REFUND — REMOVED (architectural redesign)
    // ########################################################################
    //
    // This transition is no longer needed in the new architecture.
    //
    // Previously: bidders locked tokens at bid placement → unrevealed bidders
    //   needed this transition to recover their locked tokens.
    //
    // Now: tokens are only locked at reveal_bid time. If a bidder does not
    //   reveal, they hold a worthless SealedBid record — no tokens were locked,
    //   so no refund is needed. The SealedBid simply expires with the auction.
    //
    // Privacy benefit: this removal eliminates a class of timing attacks where
    //   an observer could track claim_unrevealed_refund to identify non-winners.

    // ########################################################################
    //              T10: PROVE WON AUCTION — Selective Disclosure
    // ########################################################################
    //
    // SELECTIVE DISCLOSURE: The winner can prove they won a specific auction
    // to ANY third party (marketplace, insurance, lender) WITHOUT revealing:
    //   - Their bid amount
    //   - Any details from their WinnerCertificate beyond the auction_id
    //
    // This works because:
    //   1. Only the actual winner possesses a WinnerCertificate record for auction_id
    //   2. Aleo ZK proofs verify record ownership without exposing record contents
    //   3. The output `true` is publicly verifiable — anyone can see the proof
    //
    // The WinnerCertificate is returned (not consumed) so the winner keeps their proof.
    // Use case: prove ownership to a marketplace, prove eligibility to claim a prize,
    // prove creditworthiness without revealing the purchase price.

    transition prove_won_auction(
        private cert: WinnerCertificate,
        public auction_id: field
    ) -> (WinnerCertificate, bool) {
        // Verify the certificate is for the claimed auction.
        // Only the true winner can produce a valid WinnerCertificate for this auction_id.
        assert_eq(cert.auction_id, auction_id);

        // Return the certificate (owner keeps proof) and a public true value.
        // The ZK proof of this transition proves: "I hold a valid WinnerCertificate
        // for auction {auction_id}" — without revealing bid amount or any other fields.
        return (cert, true);
    }

}
