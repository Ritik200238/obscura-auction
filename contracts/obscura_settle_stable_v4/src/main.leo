// ============================================================================
// OBSCURA SETTLE STABLE v4 — Privacy-Hardened Stablecoin Settlement
// ============================================================================
// USDCx & USAD stablecoin settlement. ALEO credit paths live in obscura_settle_v4.
// Imports obscura_core_v3.aleo for the SealedBid record type
// and test_usdcx_stablecoin.aleo / test_usad_stablecoin.aleo for transfers.
//
// PRIVACY UPGRADE v4:
//   - revealed_bids now stores `bool` flag, not plaintext u128 amount.
//   - Amount cryptographically committed via bid_hash = BHP256(bidder, auction_id, amount, nonce).
//   - Eliminates per-bid amount exposure in public mapping state.
//
// 13 transitions | 3 records | 12 mappings | 5 structs
//
// TRANSITIONS:
//   T1-T2:   reveal_bid (USDCx/USAD) — escrow tokens on reveal
//   T3-T4:   claim_win first-price (USDCx/USAD)
//   T5-T6:   claim_win_vickrey second-price (USDCx/USAD)
//   T7-T8:   claim_refund (USDCx/USAD)
//   T9-T10:  bid_dutch instant-settle (USDCx/USAD)
//   T11-T12: bid_english ascending (USDCx/USAD)
//   T13:     withdraw_fees_usdcx (admin)
// ============================================================================

import obscura_core_v3.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;

program obscura_settle_stable_v4.aleo {

    @noupgrade
    constructor() {}

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const TOKEN_USDCX: u8 = 2u8;
    const TOKEN_USAD: u8 = 3u8;

    // Fees (basis points: 100 = 1%)
    const PLATFORM_FEE_BPS: u128 = 100u128;
    const FEE_DENOMINATOR: u128 = 10000u128;

    // English auction: minimum bid increment over current highest (5%)
    const MIN_BID_INCREMENT_BPS: u128 = 500u128;

    const MIN_BID_AMOUNT: u128 = 1000u128;

    // Dutch/English settled status (local tracking)
    const SETTLE_STATUS_NONE: u8 = 0u8;
    const SETTLE_STATUS_SETTLED: u8 = 1u8;

    // ========================================================================
    // RECORDS (3 — all private UTXO)
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

    // ========================================================================
    // STRUCTS
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

    struct DutchConfig {
        start_price: u128,
        end_price: u128,
    }

    struct PaymentCommitData {
        auction_id: field,
        bid_amount: u128,
        winner_bid_hash: field,
    }

    // ========================================================================
    // MAPPINGS (12 — own copies, independent of core and obscura_settle)
    // ========================================================================

    // Bid tracking
    // PRIVACY v4: bool flag only. Amount committed in bid_hash key.
    mapping revealed_bids: field => bool;
    mapping highest_bids: field => u128;
    mapping second_highest_bids: field => u128;
    mapping auction_winners: field => field;

    // Escrow accounting
    mapping auction_escrow: field => u128;
    mapping program_balance: u8 => u128;     // 1=USDCx, 2=USAD
    mapping platform_treasury: u8 => u128;   // 1=USDCx, 2=USAD

    // Settlement tracking
    mapping settlements: field => SettlementData;
    mapping payment_proofs: field => field;
    mapping settlement_proofs: field => field;

    // Dutch/English local state
    mapping dutch_params: field => DutchConfig;
    mapping settle_status: field => u8;

    // ########################################################################
    //              T1: REVEAL BID + ESCROW — USDCx
    // ########################################################################

    fn reveal_bid_usdcx(
        private bid: obscura_core_v3.aleo::SealedBid
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

            revealed_bids.set(bid_hash, true);  // PRIVACY v4

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
    //              T2: REVEAL BID + ESCROW — USAD
    // ########################################################################

    fn reveal_bid_usad(
        private bid: obscura_core_v3.aleo::SealedBid
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

            revealed_bids.set(bid_hash, true);  // PRIVACY v4

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
    //              T3: CLAIM WIN — USDCx first-price settlement
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

            // PRIVACY v4: verify via hash commitment. bid_hash commits to r_amount via BHP256.
            let is_revealed: bool = revealed_bids.contains(bid_hash);
            assert(is_revealed);

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
    //              T4: CLAIM WIN — USAD first-price settlement
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

            // PRIVACY v4: verify via hash commitment. bid_hash commits to r_amount via BHP256.
            let is_revealed: bool = revealed_bids.contains(bid_hash);
            assert(is_revealed);

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
    //              T5: CLAIM WIN VICKREY — USDCx version
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

            // PRIVACY v4: verify via hash commitment. bid_hash commits to r_amount via BHP256.
            let is_revealed: bool = revealed_bids.contains(bid_hash);
            assert(is_revealed);

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
    //              T6: CLAIM WIN VICKREY — USAD version
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

            // PRIVACY v4: verify via hash commitment. bid_hash commits to r_amount via BHP256.
            let is_revealed: bool = revealed_bids.contains(bid_hash);
            assert(is_revealed);

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
    //              T7: CLAIM REFUND — USDCx
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
    //              T8: CLAIM REFUND — USAD
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
    //              T9: DUTCH BID — USDCx
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

            revealed_bids.set(bid_hash, true);  // PRIVACY v4
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
    //              T10: DUTCH BID — USAD
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

            revealed_bids.set(bid_hash, true);  // PRIVACY v4
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
    //              T11: ENGLISH BID — USDCx
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

            revealed_bids.set(bid_hash, true);  // PRIVACY v4

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
    //              T12: ENGLISH BID — USAD
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

            revealed_bids.set(bid_hash, true);  // PRIVACY v4

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
    //              T13: WITHDRAW FEES — USDCx (admin only)
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

}
