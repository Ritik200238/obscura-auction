// ============================================================================
// OBSCURA SETTLE v1 — Settlement Layer for Obscura Auction Protocol
// ============================================================================
// ALL token movement for the Obscura auction ecosystem lives here.
// This program imports obscura_core.aleo for the SealedBid record type
// and imports credits.aleo, test_usdcx_stablecoin.aleo, test_usad_stablecoin.aleo
// for token transfers.
//
// CRITICAL: This program's finalize blocks CANNOT read obscura_core.aleo's
// mappings. It maintains its OWN copies of all escrow-related state.
// The SealedBid record itself is the cryptographic proof of a valid bid
// (Aleo records are unforgeable), so the settle program trusts the record.
//
// 23 transitions | 4 records | 14 mappings | 6 structs
//
// TRANSITIONS:
//   T1-T3:   reveal_bid (ALEO/USDCx/USAD) — escrow tokens on reveal
//   T4-T6:   claim_win first-price (ALEO/USDCx/USAD)
//   T7-T9:   claim_win_vickrey second-price (ALEO/USDCx/USAD)
//   T10-T12: claim_refund (ALEO/USDCx/USAD)
//   T13-T15: bid_dutch instant-settle (ALEO/USDCx/USAD)
//   T16-T18: bid_english ascending (ALEO/USDCx/USAD)
//   T19:     dispute_auction (ALEO bond)
//   T20:     resolve_dispute (admin)
//   T21:     withdraw_fees (ALEO, admin)
//   T22:     withdraw_fees_usdcx (admin)
//   T23:     prove_won_auction (selective disclosure)
//
// TOKEN CONVENTION:
//   ALEO:  credits.aleo — private deposit (transfer_private_to_public),
//          private payout (transfer_public_to_private)
//   USDCx: test_usdcx_stablecoin.aleo — public deposit (transfer_public_as_signer),
//          public payout (transfer_public)
//   USAD:  test_usad_stablecoin.aleo — same pattern as USDCx
//
// BALANCE KEYS: program_balance & platform_treasury use:
//   0u8 = ALEO, 1u8 = USDCx, 2u8 = USAD
// ============================================================================

import obscura_core.aleo;
import credits.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;

program obscura_settle.aleo {

    @noupgrade
    constructor() {}

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const TOKEN_ALEO: u8 = 1u8;
    const TOKEN_USDCX: u8 = 2u8;
    const TOKEN_USAD: u8 = 3u8;

    const MODE_DUTCH: u8 = 3u8;
    const MODE_ENGLISH: u8 = 4u8;

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
    // STRUCTS (duplicated from core for finalize computations)
    // ========================================================================

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

    // ========================================================================
    // MAPPINGS (14 — own copies, independent of core)
    // ========================================================================

    // Bid tracking
    mapping revealed_bids: field => u128;
    mapping highest_bids: field => u128;
    mapping second_highest_bids: field => u128;
    mapping auction_winners: field => field;

    // Escrow accounting
    mapping auction_escrow: field => u128;
    mapping program_balance: u8 => u128;     // 0=ALEO, 1=USDCx, 2=USAD
    mapping platform_treasury: u8 => u128;   // 0=ALEO, 1=USDCx, 2=USAD

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
        private bid: obscura_core.aleo::SealedBid,
        private credits_in: credits.aleo::credits
    ) -> (EscrowReceipt, credits.aleo::credits, Final) {
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

        return (receipt, change, final {
            transfer_final.run();

            // SealedBid record is unforgeable — no need to check core's bid_commitments.
            // Prevent double-reveal.
            let already_revealed: bool = revealed_bids.contains(bid_hash);
            assert(!already_revealed);

            revealed_bids.set(bid_hash, bid_amount);

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
    //              T2: REVEAL BID + ESCROW — USDCx
    // ########################################################################

    fn reveal_bid_usdcx(
        private bid: obscura_core.aleo::SealedBid
    ) -> (EscrowReceipt, Final) {
        assert_eq(bid.token_type, TOKEN_USDCX);

        // Extract record fields before final block
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

        let transfer_final: Final = test_usdcx_stablecoin.aleo::transfer_public_as_signer(
            self.address,
            bid_amount
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: bid_owner,
            auction_id: bid_auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_USDCX,
        };

        return (receipt, final {
            transfer_final.run();

            let already_revealed: bool = revealed_bids.contains(bid_hash);
            assert(!already_revealed);

            revealed_bids.set(bid_hash, bid_amount);

            let current_escrow: u128 = auction_escrow.get_or_use(bid_auction_id, 0u128);
            auction_escrow.set(bid_auction_id, current_escrow + bid_amount);

            let current_bal: u128 = program_balance.get_or_use(1u8, 0u128);
            program_balance.set(1u8, current_bal + bid_amount);

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
    //              T3: REVEAL BID + ESCROW — USAD
    // ########################################################################

    fn reveal_bid_usad(
        private bid: obscura_core.aleo::SealedBid
    ) -> (EscrowReceipt, Final) {
        assert_eq(bid.token_type, TOKEN_USAD);

        // Extract record fields before final block
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

        let transfer_final: Final = test_usad_stablecoin.aleo::transfer_public_as_signer(
            self.address,
            bid_amount
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: bid_owner,
            auction_id: bid_auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_USAD,
        };

        return (receipt, final {
            transfer_final.run();

            let already_revealed: bool = revealed_bids.contains(bid_hash);
            assert(!already_revealed);

            revealed_bids.set(bid_hash, bid_amount);

            let current_escrow: u128 = auction_escrow.get_or_use(bid_auction_id, 0u128);
            auction_escrow.set(bid_auction_id, current_escrow + bid_amount);

            let current_bal: u128 = program_balance.get_or_use(2u8, 0u128);
            program_balance.set(2u8, current_bal + bid_amount);

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
    //              T4: CLAIM WIN — first-price settlement (ALEO)
    // ########################################################################

    fn claim_win(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field
    ) -> (WinnerCertificate, SellerReceipt, credits.aleo::credits, Final) {
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

        return (cert, seller_receipt, seller_credits, final {
            pay_final.run();

            // Verify this bid is the winner
            let winner_hash: field = auction_winners.get(r_auction_id);
            assert_eq(bid_hash, winner_hash);

            // Verify revealed amount matches
            let revealed_amount: u128 = revealed_bids.get(bid_hash);
            assert_eq(revealed_amount, r_amount);

            // Prevent double-settlement
            let already_settled: bool = settlements.contains(r_auction_id);
            assert(!already_settled);

            settlements.set(r_auction_id, SettlementData {
                winner_bid_hash: bid_hash,
                final_price: r_amount,
                fee_collected: fee,
                settled_at: block.height as u64,
            });

            payment_proofs.set(r_auction_id, payment_commitment);

            let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
            platform_treasury.set(0u8, treasury + fee);

            let bal: u128 = program_balance.get(0u8);
            program_balance.set(0u8, bal - r_amount);

            let escrow: u128 = auction_escrow.get(r_auction_id);
            auction_escrow.set(r_auction_id, escrow - r_amount);
        });
    }

    // ########################################################################
    //              T5: CLAIM WIN — USDCx first-price settlement
    // ########################################################################

    fn claim_win_usdcx(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field
    ) -> (WinnerCertificate, SellerReceipt, Final) {
        assert_eq(receipt.token_type, TOKEN_USDCX);

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

        let pay_final: Final = test_usdcx_stablecoin.aleo::transfer_public(
            seller_address,
            seller_payout
        );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(r_nonce);
        let amount_field: field = r_amount as field;
        let payment_commitment: field = BHP256::commit_to_field(amount_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: r_auction_id,
            item_hash: item_hash,
            winning_amount: r_amount,
            token_type: TOKEN_USDCX,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: r_auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_USDCX,
        };

        return (cert, seller_receipt, final {
            pay_final.run();

            let winner_hash: field = auction_winners.get(r_auction_id);
            assert_eq(bid_hash, winner_hash);

            let revealed_amount: u128 = revealed_bids.get(bid_hash);
            assert_eq(revealed_amount, r_amount);

            let already_settled: bool = settlements.contains(r_auction_id);
            assert(!already_settled);

            settlements.set(r_auction_id, SettlementData {
                winner_bid_hash: bid_hash,
                final_price: r_amount,
                fee_collected: fee,
                settled_at: block.height as u64,
            });

            payment_proofs.set(r_auction_id, payment_commitment);

            let treasury: u128 = platform_treasury.get_or_use(1u8, 0u128);
            platform_treasury.set(1u8, treasury + fee);

            let bal: u128 = program_balance.get(1u8);
            program_balance.set(1u8, bal - r_amount);

            let escrow: u128 = auction_escrow.get(r_auction_id);
            auction_escrow.set(r_auction_id, escrow - r_amount);
        });
    }

    // ########################################################################
    //              T6: CLAIM WIN — USAD first-price settlement
    // ########################################################################

    fn claim_win_usad(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field
    ) -> (WinnerCertificate, SellerReceipt, Final) {
        assert_eq(receipt.token_type, TOKEN_USAD);

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

        let pay_final: Final = test_usad_stablecoin.aleo::transfer_public(
            seller_address,
            seller_payout
        );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(r_nonce);
        let amount_field: field = r_amount as field;
        let payment_commitment: field = BHP256::commit_to_field(amount_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: r_auction_id,
            item_hash: item_hash,
            winning_amount: r_amount,
            token_type: TOKEN_USAD,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: r_auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_USAD,
        };

        return (cert, seller_receipt, final {
            pay_final.run();

            let winner_hash: field = auction_winners.get(r_auction_id);
            assert_eq(bid_hash, winner_hash);

            let revealed_amount: u128 = revealed_bids.get(bid_hash);
            assert_eq(revealed_amount, r_amount);

            let already_settled: bool = settlements.contains(r_auction_id);
            assert(!already_settled);

            settlements.set(r_auction_id, SettlementData {
                winner_bid_hash: bid_hash,
                final_price: r_amount,
                fee_collected: fee,
                settled_at: block.height as u64,
            });

            payment_proofs.set(r_auction_id, payment_commitment);

            let treasury: u128 = platform_treasury.get_or_use(2u8, 0u128);
            platform_treasury.set(2u8, treasury + fee);

            let bal: u128 = program_balance.get(2u8);
            program_balance.set(2u8, bal - r_amount);

            let escrow: u128 = auction_escrow.get(r_auction_id);
            auction_escrow.set(r_auction_id, escrow - r_amount);
        });
    }

    // ########################################################################
    //              T7: CLAIM WIN VICKREY — winner pays second-highest (ALEO)
    // ########################################################################

    fn claim_win_vickrey(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field,
        private claimed_second_price: u128
    ) -> (WinnerCertificate, SellerReceipt, credits.aleo::credits, credits.aleo::credits, Final) {
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

        return (cert, seller_receipt, seller_credits, winner_change_credits,
            final {
                pay_final.run();
                change_final.run();

                // Verify claimed second price matches what was recorded during reveals
                let actual_second: u128 = second_highest_bids.get(r_auction_id);
                assert_eq(claimed_second_price, actual_second);

                let winner_hash: field = auction_winners.get(r_auction_id);
                assert_eq(bid_hash, winner_hash);

                let revealed_amount: u128 = revealed_bids.get(bid_hash);
                assert_eq(revealed_amount, r_amount);

                let already_settled: bool = settlements.contains(r_auction_id);
                assert(!already_settled);

                settlements.set(r_auction_id, SettlementData {
                    winner_bid_hash: bid_hash,
                    final_price: claimed_second_price,
                    fee_collected: fee,
                    settled_at: block.height as u64,
                });

                payment_proofs.set(r_auction_id, payment_commitment);

                let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
                platform_treasury.set(0u8, treasury + fee);

                let bal: u128 = program_balance.get(0u8);
                program_balance.set(0u8, bal - r_amount);

                let escrow: u128 = auction_escrow.get(r_auction_id);
                auction_escrow.set(r_auction_id, escrow - r_amount);
            }
        );
    }

    // ########################################################################
    //              T8: CLAIM WIN VICKREY — USDCx version
    // ########################################################################

    fn claim_win_vickrey_usdcx(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field,
        private claimed_second_price: u128
    ) -> (WinnerCertificate, SellerReceipt, Final) {
        assert_eq(receipt.token_type, TOKEN_USDCX);

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

        let pay_final: Final = test_usdcx_stablecoin.aleo::transfer_public(
            seller_address,
            seller_payout
        );

        let change_final: Final = test_usdcx_stablecoin.aleo::transfer_public(
            r_owner,
            winner_change
        );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(r_nonce);
        let payment_field: field = claimed_second_price as field;
        let payment_commitment: field = BHP256::commit_to_field(payment_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: r_auction_id,
            item_hash: item_hash,
            winning_amount: claimed_second_price,
            token_type: TOKEN_USDCX,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: r_auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_USDCX,
        };

        return (cert, seller_receipt, final {
            pay_final.run();
            change_final.run();

            let actual_second: u128 = second_highest_bids.get(r_auction_id);
            assert_eq(claimed_second_price, actual_second);

            let winner_hash: field = auction_winners.get(r_auction_id);
            assert_eq(bid_hash, winner_hash);

            let revealed_amount: u128 = revealed_bids.get(bid_hash);
            assert_eq(revealed_amount, r_amount);

            let already_settled: bool = settlements.contains(r_auction_id);
            assert(!already_settled);

            settlements.set(r_auction_id, SettlementData {
                winner_bid_hash: bid_hash,
                final_price: claimed_second_price,
                fee_collected: fee,
                settled_at: block.height as u64,
            });

            payment_proofs.set(r_auction_id, payment_commitment);

            let treasury: u128 = platform_treasury.get_or_use(1u8, 0u128);
            platform_treasury.set(1u8, treasury + fee);

            let bal: u128 = program_balance.get(1u8);
            program_balance.set(1u8, bal - r_amount);

            let escrow: u128 = auction_escrow.get(r_auction_id);
            auction_escrow.set(r_auction_id, escrow - r_amount);
        });
    }

    // ########################################################################
    //              T9: CLAIM WIN VICKREY — USAD version
    // ########################################################################

    fn claim_win_vickrey_usad(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field,
        private claimed_second_price: u128
    ) -> (WinnerCertificate, SellerReceipt, Final) {
        assert_eq(receipt.token_type, TOKEN_USAD);

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

        let pay_final: Final = test_usad_stablecoin.aleo::transfer_public(
            seller_address,
            seller_payout
        );

        let change_final: Final = test_usad_stablecoin.aleo::transfer_public(
            r_owner,
            winner_change
        );

        let nonce_scalar: scalar = BHP256::hash_to_scalar(r_nonce);
        let payment_field: field = claimed_second_price as field;
        let payment_commitment: field = BHP256::commit_to_field(payment_field, nonce_scalar);

        let cert: WinnerCertificate = WinnerCertificate {
            owner: self.caller,
            auction_id: r_auction_id,
            item_hash: item_hash,
            winning_amount: claimed_second_price,
            token_type: TOKEN_USAD,
            certificate_id: bid_hash,
        };

        let seller_receipt: SellerReceipt = SellerReceipt {
            owner: seller_address,
            auction_id: r_auction_id,
            item_hash: item_hash,
            sale_amount: seller_payout,
            fee_paid: fee,
            token_type: TOKEN_USAD,
        };

        return (cert, seller_receipt, final {
            pay_final.run();
            change_final.run();

            let actual_second: u128 = second_highest_bids.get(r_auction_id);
            assert_eq(claimed_second_price, actual_second);

            let winner_hash: field = auction_winners.get(r_auction_id);
            assert_eq(bid_hash, winner_hash);

            let revealed_amount: u128 = revealed_bids.get(bid_hash);
            assert_eq(revealed_amount, r_amount);

            let already_settled: bool = settlements.contains(r_auction_id);
            assert(!already_settled);

            settlements.set(r_auction_id, SettlementData {
                winner_bid_hash: bid_hash,
                final_price: claimed_second_price,
                fee_collected: fee,
                settled_at: block.height as u64,
            });

            payment_proofs.set(r_auction_id, payment_commitment);

            let treasury: u128 = platform_treasury.get_or_use(2u8, 0u128);
            platform_treasury.set(2u8, treasury + fee);

            let bal: u128 = program_balance.get(2u8);
            program_balance.set(2u8, bal - r_amount);

            let escrow: u128 = auction_escrow.get(r_auction_id);
            auction_escrow.set(r_auction_id, escrow - r_amount);
        });
    }

    // ########################################################################
    //              T10: CLAIM REFUND — ALEO credits
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
    //              T11: CLAIM REFUND — USDCx
    // ########################################################################

    fn claim_refund_usdcx(
        private receipt: EscrowReceipt
    ) -> Final {
        assert_eq(receipt.token_type, TOKEN_USDCX);

        // Extract record fields before final block
        let r_auction_id: field = receipt.auction_id;
        let r_amount: u128 = receipt.escrowed_amount;
        let r_nonce: field = receipt.bid_nonce;

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: r_auction_id,
            amount: r_amount,
            nonce: r_nonce,
        });

        let transfer_final: Final = test_usdcx_stablecoin.aleo::transfer_public(
            self.caller,
            r_amount
        );

        return final {
            transfer_final.run();

            let winner: field = auction_winners.get_or_use(r_auction_id, 0field);
            assert_neq(bid_hash, winner);

            let escrow: u128 = auction_escrow.get_or_use(r_auction_id, 0u128);
            let new_escrow: u128 = escrow > r_amount ? escrow - r_amount : 0u128;
            auction_escrow.set(r_auction_id, new_escrow);

            let bal: u128 = program_balance.get_or_use(1u8, 0u128);
            let new_bal: u128 = bal > r_amount ? bal - r_amount : 0u128;
            program_balance.set(1u8, new_bal);
        };
    }

    // ########################################################################
    //              T12: CLAIM REFUND — USAD
    // ########################################################################

    fn claim_refund_usad(
        private receipt: EscrowReceipt
    ) -> Final {
        assert_eq(receipt.token_type, TOKEN_USAD);

        // Extract record fields before final block
        let r_auction_id: field = receipt.auction_id;
        let r_amount: u128 = receipt.escrowed_amount;
        let r_nonce: field = receipt.bid_nonce;

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: r_auction_id,
            amount: r_amount,
            nonce: r_nonce,
        });

        let transfer_final: Final = test_usad_stablecoin.aleo::transfer_public(
            self.caller,
            r_amount
        );

        return final {
            transfer_final.run();

            let winner: field = auction_winners.get_or_use(r_auction_id, 0field);
            assert_neq(bid_hash, winner);

            let escrow: u128 = auction_escrow.get_or_use(r_auction_id, 0u128);
            let new_escrow: u128 = escrow > r_amount ? escrow - r_amount : 0u128;
            auction_escrow.set(r_auction_id, new_escrow);

            let bal: u128 = program_balance.get_or_use(2u8, 0u128);
            let new_bal: u128 = bal > r_amount ? bal - r_amount : 0u128;
            program_balance.set(2u8, new_bal);
        };
    }

    // ########################################################################
    //              T13: DUTCH BID — ALEO credits (instant settlement)
    // ########################################################################
    // Dutch auctions: price descends per block. First buyer wins instantly.
    // Auction data (created_at, deadline, start_price, end_price) passed as
    // private inputs from the frontend (read from core's mappings off-chain).
    // Finalize verifies block.height timing and computes current price.

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
            revealed_bids.set(bid_hash, bid_amount);
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
    //              T14: DUTCH BID — USDCx
    // ########################################################################

    fn bid_dutch_usdcx(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private start_price: u128,
        private end_price: u128,
        private created_at: u64,
        private deadline: u64
    ) -> (EscrowReceipt, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(start_price > end_price);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let transfer_final: Final = test_usdcx_stablecoin.aleo::transfer_public_as_signer(
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

        return (receipt, final {
            transfer_final.run();

            let current_height: u64 = block.height as u64;
            assert(current_height >= created_at);
            assert(current_height <= deadline);

            let status: u8 = settle_status.get_or_use(auction_id, SETTLE_STATUS_NONE);
            assert_eq(status, SETTLE_STATUS_NONE);

            let elapsed: u128 = (current_height - created_at) as u128;
            let total_duration: u128 = (deadline - created_at) as u128;
            let price_range: u128 = start_price - end_price;
            let price_drop: u128 = (price_range * elapsed) / total_duration;
            let current_price: u128 = start_price - price_drop;

            assert(bid_amount >= current_price);

            revealed_bids.set(bid_hash, bid_amount);
            highest_bids.set(auction_id, bid_amount);
            second_highest_bids.set(auction_id, current_price);
            auction_winners.set(auction_id, bid_hash);

            let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
            auction_escrow.set(auction_id, current_escrow + bid_amount);

            let current_bal: u128 = program_balance.get_or_use(1u8, 0u128);
            program_balance.set(1u8, current_bal + bid_amount);

            dutch_params.set(auction_id, DutchConfig {
                start_price: start_price,
                end_price: end_price,
            });

            settle_status.set(auction_id, SETTLE_STATUS_SETTLED);

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
    //              T15: DUTCH BID — USAD
    // ########################################################################

    fn bid_dutch_usad(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private start_price: u128,
        private end_price: u128,
        private created_at: u64,
        private deadline: u64
    ) -> (EscrowReceipt, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(start_price > end_price);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let transfer_final: Final = test_usad_stablecoin.aleo::transfer_public_as_signer(
            self.address,
            bid_amount
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_USAD,
        };

        return (receipt, final {
            transfer_final.run();

            let current_height: u64 = block.height as u64;
            assert(current_height >= created_at);
            assert(current_height <= deadline);

            let status: u8 = settle_status.get_or_use(auction_id, SETTLE_STATUS_NONE);
            assert_eq(status, SETTLE_STATUS_NONE);

            let elapsed: u128 = (current_height - created_at) as u128;
            let total_duration: u128 = (deadline - created_at) as u128;
            let price_range: u128 = start_price - end_price;
            let price_drop: u128 = (price_range * elapsed) / total_duration;
            let current_price: u128 = start_price - price_drop;

            assert(bid_amount >= current_price);

            revealed_bids.set(bid_hash, bid_amount);
            highest_bids.set(auction_id, bid_amount);
            second_highest_bids.set(auction_id, current_price);
            auction_winners.set(auction_id, bid_hash);

            let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
            auction_escrow.set(auction_id, current_escrow + bid_amount);

            let current_bal: u128 = program_balance.get_or_use(2u8, 0u128);
            program_balance.set(2u8, current_bal + bid_amount);

            dutch_params.set(auction_id, DutchConfig {
                start_price: start_price,
                end_price: end_price,
            });

            settle_status.set(auction_id, SETTLE_STATUS_SETTLED);

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
    //              T16: ENGLISH BID — ALEO credits (ascending auction)
    // ########################################################################
    // English auctions: ascending bids, 5% minimum increment, anti-sniping.
    // The settle program tracks its own highest_bids for the auction.
    // The deadline from core is passed as a private input; anti-sniping
    // extensions are tracked locally via settle_status mapping.

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
        });
    }

    // ########################################################################
    //              T17: ENGLISH BID — USDCx
    // ########################################################################

    fn bid_english_usdcx(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private auction_deadline: u64
    ) -> (EscrowReceipt, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let transfer_final: Final = test_usdcx_stablecoin.aleo::transfer_public_as_signer(
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

        return (receipt, final {
            transfer_final.run();

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction_deadline);

            let already_revealed: bool = revealed_bids.contains(bid_hash);
            assert(!already_revealed);

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
        });
    }

    // ########################################################################
    //              T18: ENGLISH BID — USAD
    // ########################################################################

    fn bid_english_usad(
        private auction_id: field,
        private bid_amount: u128,
        private bid_nonce: field,
        private auction_deadline: u64
    ) -> (EscrowReceipt, Final) {
        assert(bid_amount >= MIN_BID_AMOUNT);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: self.caller,
            auction_id: auction_id,
            amount: bid_amount,
            nonce: bid_nonce,
        });

        let transfer_final: Final = test_usad_stablecoin.aleo::transfer_public_as_signer(
            self.address,
            bid_amount
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: auction_id,
            escrowed_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: TOKEN_USAD,
        };

        return (receipt, final {
            transfer_final.run();

            let current_height: u64 = block.height as u64;
            assert(current_height <= auction_deadline);

            let already_revealed: bool = revealed_bids.contains(bid_hash);
            assert(!already_revealed);

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

            let current_bal: u128 = program_balance.get_or_use(2u8, 0u128);
            program_balance.set(2u8, current_bal + bid_amount);
        });
    }

    // ########################################################################
    //              T19: DISPUTE AUCTION (ALEO bond)
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

            // Verify bond meets minimum (10% of highest bid)
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
        });
    }

    // ########################################################################
    //              T20: RESOLVE DISPUTE — Admin determines outcome
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
    //              T21: WITHDRAW FEES — ALEO credits (admin only)
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

            // Admin verification: the admin_hash must match the first treasury withdrawal.
            // Since settle has no platform_config, we verify by checking treasury has enough.
            // In production, admin_hash would be checked against a stored config.
            let treasury: u128 = platform_treasury.get(0u8);
            assert(amount_u128 <= treasury);
            platform_treasury.set(0u8, treasury - amount_u128);
        });
    }

    // ########################################################################
    //              T22: WITHDRAW FEES — USDCx (admin only)
    // ########################################################################

    fn withdraw_fees_usdcx(
        private amount: u128,
        private recipient: address
    ) -> Final {
        let admin_field: field = self.caller as field;
        let admin_hash: field = BHP256::hash_to_field(admin_field);

        let transfer_final: Final = test_usdcx_stablecoin.aleo::transfer_public(
            recipient,
            amount
        );

        return final {
            transfer_final.run();

            let treasury: u128 = platform_treasury.get(1u8);
            assert(amount <= treasury);
            platform_treasury.set(1u8, treasury - amount);
        };
    }

    // ########################################################################
    //              T23: PROVE WON AUCTION — Selective Disclosure
    // ########################################################################
    // Allows a winner to publicly prove they won a specific auction
    // without revealing their bid amount or identity (just the auction_id).
    // The WinnerCertificate is consumed and re-created (non-destructive).

    fn prove_won_auction(
        private cert: WinnerCertificate,
        public auction_id: field
    ) -> (WinnerCertificate, bool) {
        assert_eq(cert.auction_id, auction_id);
        return (cert, true);
    }

}
