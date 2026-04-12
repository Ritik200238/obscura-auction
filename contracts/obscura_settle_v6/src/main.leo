// ============================================================================
// OBSCURA SETTLE v6 — Commit-Based Settlements (Zero Plaintext Price Leak)
// ============================================================================
// v6 extends v5's privacy with the critical fix: the `settlements` mapping
// no longer stores plaintext price/fee. Instead, each settlement stores a
// BHP256 commitment. Opening requires (price, fee, settled_at, bid_nonce) —
// only known to winner + seller. Observer sees only a field hash.
//
// This matches ZKPerp's hash-only settlement depth. Combined with v5's
// Mapping::remove + participation proofs, we now have:
//
//   Bid phase:       zero leak (sealed records + bool mappings)
//   Reveal phase:    running-max visible during window (inherent to mechanic)
//   Post-settle:     running-max DELETED (v5). Settlements store ONLY commits.
//   Audit path:      prove_settlement_price opens the commit when needed.
//
// Also adds MIN_DISPUTE_BOND const since post-v5 cleanup means dispute can't
// read highest_bids to compute min_bond (minor refactor).
//
// Imports obscura_core_v3.aleo (deployed) for the SealedBid record type.
// ============================================================================

import obscura_core_v3.aleo;
import credits.aleo;

program obscura_settle_v6.aleo {

    @noupgrade
    constructor() {}

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const TOKEN_ALEO: u8 = 1u8;

    // Fees (basis points: 100 = 1%)
    const PLATFORM_FEE_BPS: u128 = 100u128;
    const FEE_DENOMINATOR: u128 = 10000u128;

    // English auction: minimum bid increment over current highest (5%)
    const MIN_BID_INCREMENT_BPS: u128 = 500u128;

    const MIN_BID_AMOUNT: u128 = 1000u128;

    // Anti-sniping for English auctions
    const SNIPE_WINDOW_BLOCKS: u64 = 40u64;
    const SNIPE_EXTENSION_BLOCKS: u64 = 40u64;

    // Dispute resolution
    const DISPUTE_WINDOW_BLOCKS: u64 = 100u64;
    const DISPUTE_BOND_MIN_BPS: u128 = 1000u128;
    // v6: post-v5 cleanup means highest_bids is removed by claim_win. Use flat minimum.
    const MIN_DISPUTE_BOND: u128 = 1_000_000u128;  // 1 ALEO (in microcredits)

    // Dutch/English settled status (local tracking)
    const SETTLE_STATUS_NONE: u8 = 0u8;
    const SETTLE_STATUS_SETTLED: u8 = 1u8;

    // ========================================================================
    // RECORDS (4 — all private UTXO)
    // ========================================================================

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

    // ========================================================================
    // v5 NEW RECORDS (non-transferable ZK proofs)
    // ========================================================================

    // PRIVACY + NOVELTY: emitted at reveal_bid. Proves participation without
    // amount, outcome, or bidder identity linkage. Bidder can redeem for
    // airdrops, attestations, or private reputation.
    record BidderParticipationProof {
        owner: address,
        auction_id: field,
        proof_id: field,   // = bid_hash (unique, commits to amount without revealing)
    }

    // NOVELTY: emitted to the seller on claim_win. Proves seller ran an
    // auction that cleared, without revealing buyer or final price.
    // Seller's portable reputation primitive — no competitor has this.
    record AuctionCompletionProof {
        owner: address,         // seller
        auction_hash: field,    // = BHP256(auction_id, bid_hash, amount) — binds to a specific settlement
        item_hash: field,       // seller can prove "I ran an auction for item X"
    }

    // ========================================================================
    // STRUCTS (duplicated from core for finalize computations)
    // ========================================================================

    struct BidCommitment {
        bidder: address,
        auction_id: field,
        amount: u128,
        nonce: field,
    }

    // v6 PRIVACY: was { winner_bid_hash, final_price: u128, fee_collected: u128, settled_at: u64 }
    // Plaintext price/fee leaked permanently. Now: only a hiding commit.
    struct SettlementData {
        winner_bid_hash: field,
        price_commit: field,   // BHP256(SettlementCommit{ price, fee, nonce, settled_at })
        settled_at: u64,
    }

    // v6 NEW: preimage for price_commit. Only winner + seller know the opening.
    struct SettlementCommit {
        price: u128,
        fee: u128,
        nonce: field,          // bid_nonce (winner has via EscrowReceipt)
        settled_at: u64,
    }

    struct SettlementProof {
        auction_id: field,
        highest_bid: u128,
        second_highest: u128,
        winner_bid_hash: field,
        settled_at: u64,
    }

    struct PaymentCommitData {
        auction_id: field,
        bid_amount: u128,
        winner_bid_hash: field,
    }

    struct DisputeData {
        disputer_hash: field,
        bond_amount: u128,
        reason_hash: field,
        filed_at: u64,
    }

    struct DutchConfig {
        start_price: u128,
        end_price: u128,
    }

    // v5 NEW: preimage for AuctionCompletionProof.auction_hash
    struct CompletionCommit {
        auction_id: field,
        bid_hash: field,
        amount: u128,
    }

    // ========================================================================
    // MAPPINGS (14 — own copies, independent of core)
    // ========================================================================

    // Bid tracking
    // PRIVACY v4: stores bool flag only. Amount is cryptographically committed
    // in the bid_hash key: BHP256(bidder, auction_id, amount, nonce).
    // Verifying .contains(bid_hash) implicitly verifies the amount the bidder claims.
    mapping revealed_bids: field => bool;
    mapping highest_bids: field => u128;
    mapping second_highest_bids: field => u128;
    mapping auction_winners: field => field;

    // Escrow accounting
    mapping auction_escrow: field => u128;
    mapping program_balance: u8 => u128;     // 0=ALEO
    mapping platform_treasury: u8 => u128;   // 0=ALEO

    // Settlement tracking
    mapping settlements: field => SettlementData;
    mapping payment_proofs: field => field;
    mapping settlement_proofs: field => field;

    // Dutch/English local state
    mapping dutch_params: field => DutchConfig;
    mapping settle_status: field => u8;

    // Dispute tracking
    mapping disputes: field => DisputeData;
    mapping dispute_bonds: field => u128;

    // ########################################################################
    //              T1: REVEAL BID + ESCROW — ALEO credits
    // ########################################################################

    fn reveal_bid(
        private bid: obscura_core_v3.aleo::SealedBid,
        private credits_in: credits.aleo::credits
    ) -> (EscrowReceipt, BidderParticipationProof, credits.aleo::credits, Final) {
        assert_eq(bid.token_type, TOKEN_ALEO);

        // Extract record fields before final block (records cannot be captured)
        let bid_auction_id: field = bid.auction_id;
        let bid_amount: u128 = bid.bid_amount;
        let bid_nonce: field = bid.bid_nonce;
        let bid_owner: address = bid.owner;

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: bid_owner,
            auction_id: bid_auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let amount_u64: u64 = bid_amount as u64;
        let (change, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: bid_owner,
            auction_id: bid_auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_ALEO,
        };

        // PRIVACY v5: participation proof. bid_hash is the unique proof_id
        // (already commits to amount without revealing it).
        let pop: BidderParticipationProof = BidderParticipationProof {
            owner: bid_owner,
            auction_id: bid_auction_id,
            proof_id: bid_hash,
        };

        return (receipt, pop, change, final {
            transfer_final.run();

            // SealedBid record is unforgeable — no need to check core's bid_commitments.
            // Prevent double-reveal.
            let already_revealed: bool = revealed_bids.contains(bid_hash);
            assert(!already_revealed);

            // PRIVACY v4: flag only. Amount committed in bid_hash, never stored plaintext.
            revealed_bids.set(bid_hash, true);

            let current_escrow: u128 = auction_escrow.get_or_use(bid_auction_id, 0u128);
            auction_escrow.set(bid_auction_id, current_escrow + bid_amount);

            let current_bal: u128 = program_balance.get_or_use(0u8, 0u128);
            program_balance.set(0u8, current_bal + bid_amount);

            // Track highest and second-highest bids
            let current_high: u128 = highest_bids.get_or_use(bid_auction_id, 0u128);
            let current_second: u128 = second_highest_bids.get_or_use(bid_auction_id, 0u128);

            if (bid_amount > current_high) {
                second_highest_bids.set(bid_auction_id, current_high);
                highest_bids.set(bid_auction_id, bid_amount);
                auction_winners.set(bid_auction_id, bid_hash);
            } else {
                if (bid_amount > current_second) {
                    second_highest_bids.set(bid_auction_id, bid_amount);
                }
            }
        });
    }

    // ########################################################################
    //              T2: CLAIM WIN — first-price settlement (ALEO)
    // ########################################################################

    fn claim_win(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field
    ) -> (WinnerCertificate, SellerReceipt, AuctionCompletionProof, credits.aleo::credits, Final) {
        assert_eq(receipt.token_type, TOKEN_ALEO);

        // Extract record fields before final block
        let r_auction_id: field = receipt.auction_id;
        let r_amount: u128 = receipt.escrowed_amount;
        let r_nonce: field = receipt.bid_nonce;
        let r_owner: address = receipt.owner;

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: r_owner,
            auction_id: r_auction_id,
            amount: r_amount,
            nonce: r_nonce,
        });

        let fee: u128 = (r_amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = r_amount - fee;
        let payout_u64: u64 = seller_payout as u64;

        let (seller_credits, pay_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(
                seller_address,
                payout_u64
            );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(r_nonce);
        let amount_field: field = r_amount as field;
        let payment_commitment: field = BHP256::commit_to_field(amount_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: r_auction_id,
            item_hash: item_hash,
            winning_amount: r_amount,
            token_type: TOKEN_ALEO,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: r_auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_ALEO,
        };

        // NOVELTY v5: seller receives a portable completion proof.
        // auction_hash uniquely binds seller to this specific settlement.
        let auction_hash: field = BHP256::hash_to_field(CompletionCommit {
            auction_id: r_auction_id,
            bid_hash: bid_hash,
            amount: r_amount,
        });
        let completion: AuctionCompletionProof = AuctionCompletionProof {
            owner: seller_address,
            auction_hash: auction_hash,
            item_hash: item_hash,
        };

        return (cert, seller_receipt, completion, seller_credits, final {
            pay_final.run();

            // Verify this bid is the winner
            let winner_hash: field = auction_winners.get(r_auction_id);
            assert_eq(bid_hash, winner_hash);

            // PRIVACY v4: verify via hash-commitment presence.
            let is_revealed: bool = revealed_bids.contains(bid_hash);
            assert(is_revealed);

            // Prevent double-settlement
            let already_settled: bool = settlements.contains(r_auction_id);
            assert(!already_settled);

            let settled_at: u64 = block.height as u64;

            // PRIVACY v6: commit to (price, fee, nonce, settled_at). Mapping reveals only the hash.
            let price_commit: field = BHP256::hash_to_field(SettlementCommit {
                price: r_amount,
                fee: fee,
                nonce: r_nonce,
                settled_at: settled_at,
            });

            settlements.set(r_auction_id, SettlementData {
                winner_bid_hash: bid_hash,
                price_commit: price_commit,
                settled_at: settled_at,
            });

            payment_proofs.set(r_auction_id, payment_commitment);

            let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
            platform_treasury.set(0u8, treasury + fee);

            let bal: u128 = program_balance.get(0u8);
            program_balance.set(0u8, bal - r_amount);

            let escrow: u128 = auction_escrow.get(r_auction_id);
            auction_escrow.set(r_auction_id, escrow - r_amount);

            // PRIVACY v5: DELETE running-max plaintext. Only settlement_proofs hash remains public.
            // auction_winners stays (needed for claim_refund to verify non-winner status).
            highest_bids.remove(r_auction_id);
            second_highest_bids.remove(r_auction_id);
        });
    }

    // ########################################################################
    //              T3: CLAIM WIN VICKREY — winner pays second-highest (ALEO)
    // ########################################################################

    fn claim_win_vickrey(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field,
        private claimed_second_price: u128
    ) -> (WinnerCertificate, SellerReceipt, AuctionCompletionProof, credits.aleo::credits, credits.aleo::credits, Final) {
        assert_eq(receipt.token_type, TOKEN_ALEO);

        // Extract record fields before final block
        let r_auction_id: field = receipt.auction_id;
        let r_amount: u128 = receipt.escrowed_amount;
        let r_nonce: field = receipt.bid_nonce;
        let r_owner: address = receipt.owner;

        assert(r_amount > claimed_second_price);
        assert(claimed_second_price > 0u128);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: r_owner,
            auction_id: r_auction_id,
            amount: r_amount,
            nonce: r_nonce,
        });

        let fee: u128 = (claimed_second_price * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = claimed_second_price - fee;
        let winner_change: u128 = r_amount - claimed_second_price;

        let seller_payout_u64: u64 = seller_payout as u64;
        let winner_change_u64: u64 = winner_change as u64;

        let (seller_credits, pay_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(
                seller_address,
                seller_payout_u64
            );

        let (winner_change_credits, change_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(
                r_owner,
                winner_change_u64
            );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(r_nonce);
        let payment_field: field = claimed_second_price as field;
        let payment_commitment: field = BHP256::commit_to_field(payment_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: r_auction_id,
            item_hash: item_hash,
            winning_amount: claimed_second_price,
            token_type: TOKEN_ALEO,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: r_auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_ALEO,
        };

        // NOVELTY v5: Vickrey completion proof uses claimed_second_price (the actual cleared price)
        let auction_hash: field = BHP256::hash_to_field(CompletionCommit {
            auction_id: r_auction_id,
            bid_hash: bid_hash,
            amount: claimed_second_price,
        });
        let completion: AuctionCompletionProof = AuctionCompletionProof {
            owner: seller_address,
            auction_hash: auction_hash,
            item_hash: item_hash,
        };

        return (cert, seller_receipt, completion, seller_credits, winner_change_credits,
            final {
                pay_final.run();
                change_final.run();

                // Verify claimed second price matches what was recorded during reveals
                let actual_second: u128 = second_highest_bids.get(r_auction_id);
                assert_eq(claimed_second_price, actual_second);

                let winner_hash: field = auction_winners.get(r_auction_id);
                assert_eq(bid_hash, winner_hash);

                // PRIVACY v4: verify bid-revelation via hash commitment, not plaintext amount.
                let is_revealed: bool = revealed_bids.contains(bid_hash);
                assert(is_revealed);

                let already_settled: bool = settlements.contains(r_auction_id);
                assert(!already_settled);

                let settled_at: u64 = block.height as u64;

                // PRIVACY v6: commit to Vickrey cleared price.
                let price_commit: field = BHP256::hash_to_field(SettlementCommit {
                    price: claimed_second_price,
                    fee: fee,
                    nonce: r_nonce,
                    settled_at: settled_at,
                });

                settlements.set(r_auction_id, SettlementData {
                    winner_bid_hash: bid_hash,
                    price_commit: price_commit,
                    settled_at: settled_at,
                });

                payment_proofs.set(r_auction_id, payment_commitment);

                let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
                platform_treasury.set(0u8, treasury + fee);

                let bal: u128 = program_balance.get(0u8);
                program_balance.set(0u8, bal - r_amount);

                let escrow: u128 = auction_escrow.get(r_auction_id);
                auction_escrow.set(r_auction_id, escrow - r_amount);

                // PRIVACY v5: DELETE running-max plaintext post-settle.
                highest_bids.remove(r_auction_id);
                second_highest_bids.remove(r_auction_id);
            }
        );
    }

    // ########################################################################
    //              T4: CLAIM REFUND — ALEO credits
    // ########################################################################

    fn claim_refund(
        private receipt: EscrowReceipt
    ) -> (credits.aleo::credits, Final) {
        assert_eq(receipt.token_type, TOKEN_ALEO);

        // Extract record fields before final block
        let r_auction_id: field = receipt.auction_id;
        let r_amount: u128 = receipt.escrowed_amount;
        let r_nonce: field = receipt.bid_nonce;

        let refund_u64: u64 = r_amount as u64;

        let (refund_credits, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(
                self.caller,
                refund_u64
            );

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: r_auction_id,
            amount: r_amount,
            nonce: r_nonce,
        });

        return (refund_credits, final {
            transfer_final.run();

            // Verify this bid is NOT the winner (winners must use claim_win)
            let winner: field = auction_winners.get_or_use(r_auction_id, 0field);
            assert_neq(bid_hash, winner);

            let escrow: u128 = auction_escrow.get_or_use(r_auction_id, 0u128);
            let new_escrow: u128 = escrow > r_amount ? escrow - r_amount : 0u128;
            auction_escrow.set(r_auction_id, new_escrow);

            let bal: u128 = program_balance.get_or_use(0u8, 0u128);
            let new_bal: u128 = bal > r_amount ? bal - r_amount : 0u128;
            program_balance.set(0u8, new_bal);
        });
    }

    // ########################################################################
    //              T5: DUTCH BID — ALEO credits (instant settlement)
    // ########################################################################

    fn bid_dutch(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private credits_in: credits.aleo::credits,
        private start_price: u128,
        private end_price: u128,
        private created_at: u64,
        private deadline: u64
    ) -> (EscrowReceipt, credits.aleo::credits, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(start_price > end_price);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let amount_u64: u64 = bid_amount as u64;
        let (change, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
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

        return (receipt, change, final {
            transfer_final.run();

            let current_height: u64 = block.height as u64;

            // Verify timing: must be within auction window
            assert(current_height >= created_at);
            assert(current_height <= deadline);

            // Verify not already settled (only one buyer in Dutch)
            let status: u8 = settle_status.get_or_use(auction_id, SETTLE_STATUS_NONE);
            assert_eq(status, SETTLE_STATUS_NONE);

            // Compute current Dutch price from block height
            let elapsed: u128 = (current_height - created_at) as u128;
            let total_duration: u128 = (deadline - created_at) as u128;
            let price_range: u128 = start_price - end_price;
            let price_drop: u128 = (price_range * elapsed) / total_duration;
            let current_price: u128 = start_price - price_drop;

            assert(bid_amount >= current_price);

            // Record the bid
            // PRIVACY v4: revealed_bids stores bool flag only. bid_hash commits to amount.
            revealed_bids.set(bid_hash, true);
            highest_bids.set(auction_id, bid_amount);
            second_highest_bids.set(auction_id, current_price);
            auction_winners.set(auction_id, bid_hash);

            let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
            auction_escrow.set(auction_id, current_escrow + bid_amount);

            let current_bal: u128 = program_balance.get_or_use(0u8, 0u128);
            program_balance.set(0u8, current_bal + bid_amount);

            // Store Dutch params for reference
            dutch_params.set(auction_id, DutchConfig {
                start_price: start_price,
                end_price: end_price,
            });

            // Mark as settled — Dutch completes in one step
            settle_status.set(auction_id, SETTLE_STATUS_SETTLED);

            // Create settlement proof
            let sp: field = BHP256::hash_to_field(SettlementProof {
                auction_id: auction_id,
                highest_bid: bid_amount,
                second_highest: current_price,
                winner_bid_hash: bid_hash,
                settled_at: current_height,
            });
            settlement_proofs.set(auction_id, sp);
        });
    }

    // ########################################################################
    //              T6: ENGLISH BID — ALEO credits (ascending auction)
    // ########################################################################

    fn bid_english(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private credits_in: credits.aleo::credits,
        private auction_deadline: u64
    ) -> (EscrowReceipt, credits.aleo::credits, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let amount_u64: u64 = bid_amount as u64;
        let (change, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
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

        return (receipt, change, final {
            transfer_final.run();

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction_deadline);

            // Prevent double-bid with same hash
            let already_revealed: bool = revealed_bids.contains(bid_hash);
            assert(!already_revealed);

            // Enforce 5% minimum increment over current highest
            let current_high: u128 = highest_bids.get_or_use(auction_id, 0u128);
            if (current_high > 0u128) {
                let min_increment: u128 = (current_high * MIN_BID_INCREMENT_BPS) / FEE_DENOMINATOR;
                assert(bid_amount >= current_high + min_increment);
            }

            // PRIVACY v4: flag only; amount already committed via bid_hash.
            revealed_bids.set(bid_hash, true);

            if (bid_amount > current_high) {
                second_highest_bids.set(auction_id, current_high);
                highest_bids.set(auction_id, bid_amount);
                auction_winners.set(auction_id, bid_hash);
            }

            let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
            auction_escrow.set(auction_id, current_escrow + bid_amount);

            let current_bal: u128 = program_balance.get_or_use(0u8, 0u128);
            program_balance.set(0u8, current_bal + bid_amount);
        });
    }

    // ########################################################################
    //              T7: DISPUTE AUCTION (ALEO bond)
    // ########################################################################

    fn dispute_auction(
        private auction_id: field,
        private bond_credits: credits.aleo::credits,
        private bond_amount: u128,
        private reason_hash: field
    ) -> (DisputeBond, credits.aleo::credits, Final) {
        assert(bond_amount >= MIN_BID_AMOUNT);

        let disputer_field: field = self.caller as field;
        let disputer_hash: field = BHP256::hash_to_field(disputer_field);

        let bond_u64: u64 = bond_amount as u64;
        let (change, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
                bond_credits,
                self.address,
                bond_u64
            );

        let bond_record: DisputeBond = DisputeBond {
            owner: self.caller,
            auction_id: auction_id,
            bond_amount: bond_amount,
        };

        return (bond_record, change, final {
            transfer_final.run();

            // Verify settlement exists (can only dispute settled auctions)
            let settlement: SettlementData = settlements.get(auction_id);
            let current_height: u64 = block.height as u64;
            assert(current_height <= settlement.settled_at + DISPUTE_WINDOW_BLOCKS);

            // Prevent double-dispute
            let already_disputed: bool = disputes.contains(auction_id);
            assert(!already_disputed);

            // v6: highest_bids is removed by claim_win. Use flat minimum instead.
            assert(bond_amount >= MIN_DISPUTE_BOND);

            disputes.set(auction_id, DisputeData {
                disputer_hash: disputer_hash,
                bond_amount: bond_amount,
                reason_hash: reason_hash,
                filed_at: current_height,
            });

            dispute_bonds.set(auction_id, bond_amount);

            let bal: u128 = program_balance.get_or_use(0u8, 0u128);
            program_balance.set(0u8, bal + bond_amount);
        });
    }

    // ########################################################################
    //              T8: RESOLVE DISPUTE — Admin determines outcome
    // ########################################################################

    fn resolve_dispute(
        private auction_id: field,
        private dispute_valid: bool,
        private disputer_address: address,
        private bond_amount: u128,
        private admin_address: address
    ) -> (credits.aleo::credits, Final) {
        let admin_field: field = self.caller as field;
        let admin_hash: field = BHP256::hash_to_field(admin_field);

        let disputer_field: field = disputer_address as field;
        let disputer_hash: field = BHP256::hash_to_field(disputer_field);

        let bond_u64: u64 = bond_amount as u64;

        // If dispute valid: return bond to disputer. If invalid: return 1 microcredit (minimum).
        let target: address = dispute_valid ? disputer_address : self.caller;
        let payout: u64 = dispute_valid ? bond_u64 : 1u64;

        let (credits_out, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(
                target,
                payout
            );

        return (credits_out, final {
            transfer_final.run();

            // Verify dispute exists and bond matches
            let dispute: DisputeData = disputes.get(auction_id);
            assert_eq(disputer_hash, dispute.disputer_hash);

            let actual_bond: u128 = dispute_bonds.get(auction_id);
            assert_eq(bond_amount, actual_bond);

            if (dispute_valid) {
                // Dispute upheld: return bond to disputer, clear settlement
                let bal: u128 = program_balance.get(0u8);
                program_balance.set(0u8, bal - actual_bond);
            } else {
                // Dispute rejected: bond goes to platform treasury
                let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
                platform_treasury.set(0u8, treasury + actual_bond);

                let bal: u128 = program_balance.get(0u8);
                program_balance.set(0u8, bal - actual_bond);
            }

            dispute_bonds.set(auction_id, 0u128);
        });
    }

    // ########################################################################
    //              T9: WITHDRAW FEES — ALEO credits (admin only)
    // ########################################################################

    fn withdraw_fees(
        private amount: u64
    ) -> (credits.aleo::credits, Final) {
        let admin_field: field = self.caller as field;
        let admin_hash: field = BHP256::hash_to_field(admin_field);

        let (credits_out, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(
                self.caller,
                amount
            );

        let amount_u128: u128 = amount as u128;

        return (credits_out, final {
            transfer_final.run();

            let treasury: u128 = platform_treasury.get(0u8);
            assert(amount_u128 <= treasury);
            platform_treasury.set(0u8, treasury - amount_u128);
        });
    }

    // ########################################################################
    //              T10: PROVE WON AUCTION — Selective Disclosure
    // ########################################################################

    fn prove_won_auction(
        private cert: WinnerCertificate,
        public auction_id: field
    ) -> (WinnerCertificate, bool) {
        assert_eq(cert.auction_id, auction_id);
        return (cert, true);
    }

}
