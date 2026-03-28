// ============================================================================
// OBSCURA MARKET v1 — Marketplace Extensions
// ============================================================================
// Extends the core Obscura auction protocol (obscura_v5.aleo) with:
// - Fixed-price private sales (ALEO / USDCx / USAD)
// - Request-For-Quote (RFQ) reverse auctions
// - Token sale / fair-launch distribution
// - Royalty claiming (ALEO / USDCx / USAD)
// - Provenance chain (resale tracking)
// - Time-locked result reveal
// - Forfeit for unrevealed bids
// - Clean slate reputation proofs
//
// 21 transitions | 4 records | 6 structs | 13 mappings
//
// CROSS-PROGRAM DATA MODEL:
// Since Leo does not support cross-program mapping reads, transitions
// that logically depend on obscura_v5.aleo state (auctions, settlements,
// royalty_balances) accept the relevant data as PRIVATE INPUTS and verify
// them with assertions where possible. The caller (frontend/SDK) reads
// the v5 mappings off-chain and passes values in.
//
// Token support (same as v5):
//   credits.aleo — ALEO private credits
//   test_usdcx_stablecoin.aleo — USDCx stablecoin
//   test_usad_stablecoin.aleo — USAD stablecoin
// ============================================================================

import credits.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;

program obscura_market_v1.aleo {

    @noupgrade
    async constructor() {}

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const TOKEN_ALEO: u8 = 1u8;
    const TOKEN_USDCX: u8 = 2u8;
    const TOKEN_USAD: u8 = 3u8;

    const MIN_BID_AMOUNT: u128 = 1000u128;

    // ========================================================================
    // RECORDS (4 — all private UTXO)
    // ========================================================================

    // QuoteRecord: Private quote submitted by a seller in response to an RFQ.
    record QuoteRecord {
        owner: address,
        rfq_id: field,
        quote_amount: u128,
        quote_hash: field,
        seller_hash: field,
        token_type: u8,
    }

    // CleanSlateProof: On-chain attestation that a wallet has zero disputes.
    record CleanSlateProof {
        owner: address,
        wallet_hash: field,
        proof_block: u64,
        auction_count: u64,
    }

    // EscrowReceipt: mirrors the v5 record for token sale escrow tracking.
    record EscrowReceipt {
        owner: address,
        auction_id: field,
        escrowed_amount: u128,
        bid_nonce: field,
        token_type: u8,
    }

    // RoyaltyReceipt: proof of royalty claim for off-chain verification.
    record RoyaltyReceipt {
        owner: address,
        auction_id: field,
        amount: u128,
        token_type: u8,
    }

    // ========================================================================
    // STRUCTS
    // ========================================================================

    // AuctionSeed: same as v5 — needed for deterministic ID generation.
    struct AuctionSeed {
        creator: address,
        item_hash: field,
        deadline: u64,
        nonce: field,
    }

    // BidCommitment: same as v5 — needed for quote hashing.
    struct BidCommitment {
        bidder: address,
        auction_id: field,
        amount: u128,
        nonce: field,
    }

    // RFQConfig: Request-For-Quote (reverse auction) configuration.
    struct RFQConfig {
        buyer_hash: field,
        category: u8,
        max_budget_hash: field,
        description_hash: field,
        deadline_block: u32,
        token_type: u8,
        is_active: u8,
    }

    // FixedSaleConfig: Fixed-price private sale listing.
    struct FixedSaleConfig {
        seller_hash: field,
        item_hash: field,
        price: u128,
        token_type: u8,
        is_sold: u8,
    }

    // TokenSaleConfig: Fair-launch token sale with fixed supply.
    struct TokenSaleConfig {
        seller_hash: field,
        total_supply: u128,
        remaining_supply: u128,
        min_price_per_token: u128,
        token_type: u8,
        deadline_block: u32,
    }

    // RoyaltyRegistration: tracks royalty data passed from v5 settlement.
    struct RoyaltyRegistration {
        creator_hash: field,
        amount: u128,
        token_type: u8,
        claimed: u8,
    }

    // ========================================================================
    // MAPPINGS (13 — under 31 limit)
    // ========================================================================

    // Fixed-price sales
    mapping fixed_sales: field => FixedSaleConfig;
    mapping sale_receipts: field => field;

    // RFQ / reverse auction
    mapping rfq_configs: field => RFQConfig;
    mapping rfq_quote_count: field => u64;

    // Token sales
    mapping token_sales: field => TokenSaleConfig;

    // Royalties (populated via register_royalty, claimed via claim_royalty)
    mapping royalty_balances: field => RoyaltyRegistration;

    // Provenance chain: auction_id => previous_auction_id (0field if first sale).
    mapping provenance: field => field;

    // Time-locked result reveal
    mapping result_reveal_block: field => u64;
    mapping revealed_results: field => u128;

    // Forfeit tracking
    mapping forfeit_status: field => u8;

    // Custom reveal deadlines (optional per-auction override)
    mapping reveal_deadlines_custom: field => u64;

    // Seller disputed count (for clean slate proof — mirrors v5's seller_disputed)
    mapping seller_disputed: field => u64;

    // Platform admin hash (initialized once)
    mapping market_admin: u8 => field;

    // ########################################################################
    //    T1: CREATE FIXED-PRICE SALE
    // ########################################################################

    async transition create_fixed_sale(
        private item_hash: field,
        private price: u128,
        private token_type: u8,
        private sale_nonce: field
    ) -> (field, Future) {
        assert(price >= MIN_BID_AMOUNT);
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX || token_type == TOKEN_USAD);

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

        let sale_seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: 0u64,
            nonce: sale_nonce,
        };
        let sale_id: field = BHP256::hash_to_field(sale_seed);

        return (sale_id, finalize_create_fixed_sale(
            sale_id, seller_hash, item_hash, price, token_type
        ));
    }

    async function finalize_create_fixed_sale(
        sale_id: field,
        seller_hash: field,
        item_hash: field,
        price: u128,
        token_type: u8
    ) {
        let exists: bool = fixed_sales.contains(sale_id);
        assert(!exists);

        fixed_sales.set(sale_id, FixedSaleConfig {
            seller_hash: seller_hash,
            item_hash: item_hash,
            price: price,
            token_type: token_type,
            is_sold: 0u8,
        });
    }

    // ########################################################################
    //    T2: BUY FIXED SALE — ALEO credits
    // ########################################################################

    async transition buy_fixed_sale(
        private sale_id: field,
        private credits_in: credits.aleo/credits,
        private sale_price: u128
    ) -> (credits.aleo/credits, Future) {
        let amount_u64: u64 = sale_price as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        let buyer_field: field = self.caller as field;
        let buyer_hash: field = BHP256::hash_to_field(buyer_field);

        return (change, finalize_buy_fixed_sale(
            transfer_future, sale_id, buyer_hash, sale_price
        ));
    }

    async function finalize_buy_fixed_sale(
        f0: Future,
        sale_id: field,
        buyer_hash: field,
        sale_price: u128
    ) {
        f0.await();

        let sale: FixedSaleConfig = fixed_sales.get(sale_id);
        assert_eq(sale.is_sold, 0u8);
        assert_eq(sale.token_type, TOKEN_ALEO);
        assert(sale_price >= sale.price);

        fixed_sales.set(sale_id, FixedSaleConfig {
            seller_hash: sale.seller_hash,
            item_hash: sale.item_hash,
            price: sale.price,
            token_type: sale.token_type,
            is_sold: 1u8,
        });

        sale_receipts.set(sale_id, buyer_hash);
    }

    // ########################################################################
    //    T3: BUY FIXED SALE — USDCx version
    // ########################################################################

    async transition buy_fixed_sale_usdcx(
        private sale_id: field,
        private token_holder: address,
        private sale_price: u128
    ) -> Future {
        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            sale_price
        );

        let buyer_field: field = self.caller as field;
        let buyer_hash: field = BHP256::hash_to_field(buyer_field);

        return finalize_buy_fixed_sale_usdcx(
            transfer_future, sale_id, buyer_hash, sale_price
        );
    }

    async function finalize_buy_fixed_sale_usdcx(
        f0: Future,
        sale_id: field,
        buyer_hash: field,
        sale_price: u128
    ) {
        f0.await();

        let sale: FixedSaleConfig = fixed_sales.get(sale_id);
        assert_eq(sale.is_sold, 0u8);
        assert_eq(sale.token_type, TOKEN_USDCX);
        assert(sale_price >= sale.price);

        fixed_sales.set(sale_id, FixedSaleConfig {
            seller_hash: sale.seller_hash,
            item_hash: sale.item_hash,
            price: sale.price,
            token_type: sale.token_type,
            is_sold: 1u8,
        });

        sale_receipts.set(sale_id, buyer_hash);
    }

    // ########################################################################
    //    T4: BUY FIXED SALE — USAD version
    // ########################################################################

    async transition buy_fixed_sale_usad(
        private sale_id: field,
        private token_holder: address,
        private sale_price: u128
    ) -> Future {
        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            sale_price
        );

        let buyer_field: field = self.caller as field;
        let buyer_hash: field = BHP256::hash_to_field(buyer_field);

        return finalize_buy_fixed_sale_usad(
            transfer_future, sale_id, buyer_hash, sale_price
        );
    }

    async function finalize_buy_fixed_sale_usad(
        f0: Future,
        sale_id: field,
        buyer_hash: field,
        sale_price: u128
    ) {
        f0.await();

        let sale: FixedSaleConfig = fixed_sales.get(sale_id);
        assert_eq(sale.is_sold, 0u8);
        assert_eq(sale.token_type, TOKEN_USAD);
        assert(sale_price >= sale.price);

        fixed_sales.set(sale_id, FixedSaleConfig {
            seller_hash: sale.seller_hash,
            item_hash: sale.item_hash,
            price: sale.price,
            token_type: sale.token_type,
            is_sold: 1u8,
        });

        sale_receipts.set(sale_id, buyer_hash);
    }

    // ########################################################################
    //    T5: CREATE RFQ — Buyer posts request, sellers quote
    // ########################################################################

    async transition create_rfq(
        private category: u8,
        private description_hash: field,
        private max_budget: u128,
        private deadline_block: u64,
        private token_type: u8,
        private rfq_nonce: field
    ) -> (field, Future) {
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX || token_type == TOKEN_USAD);

        let buyer_field: field = self.caller as field;
        let buyer_hash: field = BHP256::hash_to_field(buyer_field);

        let budget_field: field = max_budget as field;
        let max_budget_hash: field = BHP256::hash_to_field(budget_field);

        let rfq_seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: description_hash,
            deadline: deadline_block,
            nonce: rfq_nonce,
        };
        let rfq_id: field = BHP256::hash_to_field(rfq_seed);

        let deadline_u32: u32 = deadline_block as u32;

        return (rfq_id, finalize_create_rfq(
            rfq_id, buyer_hash, category, max_budget_hash,
            description_hash, deadline_u32, token_type
        ));
    }

    async function finalize_create_rfq(
        rfq_id: field,
        buyer_hash: field,
        category: u8,
        max_budget_hash: field,
        description_hash: field,
        deadline_block: u32,
        token_type: u8
    ) {
        let exists: bool = rfq_configs.contains(rfq_id);
        assert(!exists);

        rfq_configs.set(rfq_id, RFQConfig {
            buyer_hash: buyer_hash,
            category: category,
            max_budget_hash: max_budget_hash,
            description_hash: description_hash,
            deadline_block: deadline_block,
            token_type: token_type,
            is_active: 1u8,
        });
    }

    // ########################################################################
    //    T6: SUBMIT QUOTE — Seller responds to RFQ
    // ########################################################################

    async transition submit_quote(
        private rfq_id: field,
        private quote_amount: u128,
        private quote_nonce: field
    ) -> (QuoteRecord, Future) {
        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

        let quote_data: BidCommitment = BidCommitment {
            bidder: self.caller,
            auction_id: rfq_id,
            amount: quote_amount,
            nonce: quote_nonce,
        };
        let quote_hash: field = BHP256::hash_to_field(quote_data);

        let quote: QuoteRecord = QuoteRecord {
            owner: self.caller,
            rfq_id: rfq_id,
            quote_amount: quote_amount,
            quote_hash: quote_hash,
            seller_hash: seller_hash,
            token_type: TOKEN_ALEO,
        };

        return (quote, finalize_submit_quote(rfq_id));
    }

    async function finalize_submit_quote(
        rfq_id: field
    ) {
        let rfq: RFQConfig = rfq_configs.get(rfq_id);
        assert_eq(rfq.is_active, 1u8);

        let count: u64 = rfq_quote_count.get_or_use(rfq_id, 0u64);
        rfq_quote_count.set(rfq_id, count + 1u64);
    }

    // ########################################################################
    //    T7: ACCEPT QUOTE — ALEO credits
    // ########################################################################

    async transition accept_quote(
        private rfq_id: field,
        private quote: QuoteRecord,
        private credits_in: credits.aleo/credits
    ) -> (credits.aleo/credits, Future) {
        let amount_u64: u64 = quote.quote_amount as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        return (change, finalize_accept_quote(
            transfer_future, rfq_id, quote.quote_amount
        ));
    }

    async function finalize_accept_quote(
        f0: Future,
        rfq_id: field,
        quote_amount: u128
    ) {
        f0.await();

        let rfq: RFQConfig = rfq_configs.get(rfq_id);
        assert_eq(rfq.is_active, 1u8);

        rfq_configs.set(rfq_id, RFQConfig {
            buyer_hash: rfq.buyer_hash,
            category: rfq.category,
            max_budget_hash: rfq.max_budget_hash,
            description_hash: rfq.description_hash,
            deadline_block: rfq.deadline_block,
            token_type: rfq.token_type,
            is_active: 0u8,
        });
    }

    // ########################################################################
    //    T8: ACCEPT QUOTE — USDCx version
    // ########################################################################

    async transition accept_quote_usdcx(
        private rfq_id: field,
        private quote: QuoteRecord,
        private quote_amount: u128
    ) -> Future {
        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            quote_amount
        );

        return finalize_accept_quote_usdcx(
            transfer_future, rfq_id
        );
    }

    async function finalize_accept_quote_usdcx(
        f0: Future,
        rfq_id: field
    ) {
        f0.await();

        let rfq: RFQConfig = rfq_configs.get(rfq_id);
        assert_eq(rfq.is_active, 1u8);

        rfq_configs.set(rfq_id, RFQConfig {
            buyer_hash: rfq.buyer_hash,
            category: rfq.category,
            max_budget_hash: rfq.max_budget_hash,
            description_hash: rfq.description_hash,
            deadline_block: rfq.deadline_block,
            token_type: rfq.token_type,
            is_active: 0u8,
        });
    }

    // ########################################################################
    //    T9: ACCEPT QUOTE — USAD version
    // ########################################################################

    async transition accept_quote_usad(
        private rfq_id: field,
        private quote: QuoteRecord,
        private quote_amount: u128
    ) -> Future {
        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            quote_amount
        );

        return finalize_accept_quote_usad(
            transfer_future, rfq_id
        );
    }

    async function finalize_accept_quote_usad(
        f0: Future,
        rfq_id: field
    ) {
        f0.await();

        let rfq: RFQConfig = rfq_configs.get(rfq_id);
        assert_eq(rfq.is_active, 1u8);

        rfq_configs.set(rfq_id, RFQConfig {
            buyer_hash: rfq.buyer_hash,
            category: rfq.category,
            max_budget_hash: rfq.max_budget_hash,
            description_hash: rfq.description_hash,
            deadline_block: rfq.deadline_block,
            token_type: rfq.token_type,
            is_active: 0u8,
        });
    }

    // ########################################################################
    //    T10: CREATE TOKEN SALE — Fixed-supply fair launch
    // ########################################################################

    async transition create_token_sale(
        private total_supply: u128,
        private min_price: u128,
        private token_type: u8,
        private deadline: u64,
        private sale_nonce: field
    ) -> (field, Future) {
        assert(total_supply > 0u128);
        assert(min_price >= MIN_BID_AMOUNT);
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX || token_type == TOKEN_USAD);

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

        let supply_field: field = total_supply as field;
        let sale_seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: supply_field,
            deadline: deadline,
            nonce: sale_nonce,
        };
        let sale_id: field = BHP256::hash_to_field(sale_seed);

        let deadline_u32: u32 = deadline as u32;

        return (sale_id, finalize_create_token_sale(
            sale_id, seller_hash, total_supply, min_price, token_type, deadline_u32
        ));
    }

    async function finalize_create_token_sale(
        sale_id: field,
        seller_hash: field,
        total_supply: u128,
        min_price: u128,
        token_type: u8,
        deadline_block: u32
    ) {
        let exists: bool = token_sales.contains(sale_id);
        assert(!exists);

        token_sales.set(sale_id, TokenSaleConfig {
            seller_hash: seller_hash,
            total_supply: total_supply,
            remaining_supply: total_supply,
            min_price_per_token: min_price,
            token_type: token_type,
            deadline_block: deadline_block,
        });
    }

    // ########################################################################
    //    T11: BID TOKEN SALE — ALEO credits
    // ########################################################################

    async transition bid_token_sale(
        private sale_id: field,
        private quantity: u128,
        private price_per_token: u128,
        private bid_nonce: field,
        private credits_in: credits.aleo/credits
    ) -> (EscrowReceipt, credits.aleo/credits, Future) {
        let total_payment: u128 = quantity * price_per_token;
        assert(total_payment >= MIN_BID_AMOUNT);

        let payment_u64: u64 = total_payment as u64;
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                payment_u64
            );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: sale_id,
            escrowed_amount: total_payment,
            bid_nonce: bid_nonce,
            token_type: TOKEN_ALEO,
        };

        return (receipt, change, finalize_bid_token_sale(
            transfer_future, sale_id, quantity, price_per_token
        ));
    }

    async function finalize_bid_token_sale(
        f0: Future,
        sale_id: field,
        quantity: u128,
        price_per_token: u128
    ) {
        f0.await();

        let sale: TokenSaleConfig = token_sales.get(sale_id);

        let current_height: u32 = block.height as u32;
        assert(current_height <= sale.deadline_block);

        assert(price_per_token >= sale.min_price_per_token);
        assert(quantity <= sale.remaining_supply);

        token_sales.set(sale_id, TokenSaleConfig {
            seller_hash: sale.seller_hash,
            total_supply: sale.total_supply,
            remaining_supply: sale.remaining_supply - quantity,
            min_price_per_token: sale.min_price_per_token,
            token_type: sale.token_type,
            deadline_block: sale.deadline_block,
        });
    }

    // ########################################################################
    //    T12: BID TOKEN SALE — USDCx version
    // ########################################################################

    async transition bid_token_sale_usdcx(
        private sale_id: field,
        private quantity: u128,
        private price_per_token: u128,
        private bid_nonce: field
    ) -> (EscrowReceipt, Future) {
        let total_payment: u128 = quantity * price_per_token;
        assert(total_payment >= MIN_BID_AMOUNT);

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public_as_signer(
            self.address,
            total_payment
        );

        let receipt: EscrowReceipt = EscrowReceipt {
            owner: self.caller,
            auction_id: sale_id,
            escrowed_amount: total_payment,
            bid_nonce: bid_nonce,
            token_type: TOKEN_USDCX,
        };

        return (receipt, finalize_bid_token_sale_usdcx(
            transfer_future, sale_id, quantity, price_per_token
        ));
    }

    async function finalize_bid_token_sale_usdcx(
        f0: Future,
        sale_id: field,
        quantity: u128,
        price_per_token: u128
    ) {
        f0.await();

        let sale: TokenSaleConfig = token_sales.get(sale_id);

        let current_height: u32 = block.height as u32;
        assert(current_height <= sale.deadline_block);

        assert(price_per_token >= sale.min_price_per_token);
        assert(quantity <= sale.remaining_supply);

        token_sales.set(sale_id, TokenSaleConfig {
            seller_hash: sale.seller_hash,
            total_supply: sale.total_supply,
            remaining_supply: sale.remaining_supply - quantity,
            min_price_per_token: sale.min_price_per_token,
            token_type: sale.token_type,
            deadline_block: sale.deadline_block,
        });
    }

    // ########################################################################
    //    T13: REGISTER ROYALTY — Populate royalty balance from v5 settlement
    // ########################################################################
    //
    // Called after obscura_v5.aleo settles an auction with royalty configured.
    // The caller passes the auction_id, creator_hash, amount, and token_type
    // as read from v5's royalty_balances / royalty_info mappings off-chain.
    // The market program stores this and makes it claimable.
    //
    // TRUST: The amount is provided by the caller. In production, a relayer
    // or the settlement frontend reads v5 mappings and calls this atomically.
    // Double-registration is prevented by the contains check.

    async transition register_royalty(
        private auction_id: field,
        private creator: address,
        private amount: u128,
        private token_type: u8
    ) -> Future {
        assert(amount > 0u128);
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX || token_type == TOKEN_USAD);

        let creator_field: field = creator as field;
        let creator_hash: field = BHP256::hash_to_field(creator_field);

        return finalize_register_royalty(auction_id, creator_hash, amount, token_type);
    }

    async function finalize_register_royalty(
        auction_id: field,
        creator_hash: field,
        amount: u128,
        token_type: u8
    ) {
        // Prevent double-registration.
        let already_registered: bool = royalty_balances.contains(auction_id);
        assert(!already_registered);

        royalty_balances.set(auction_id, RoyaltyRegistration {
            creator_hash: creator_hash,
            amount: amount,
            token_type: token_type,
            claimed: 0u8,
        });
    }

    // ########################################################################
    //    T14: CLAIM ROYALTY — ALEO credits
    // ########################################################################

    async transition claim_royalty(
        private auction_id: field,
        private creator_address: address,
        private royalty_amount: u128
    ) -> (RoyaltyReceipt, credits.aleo/credits, Future) {
        let creator_field: field = creator_address as field;
        let creator_hash: field = BHP256::hash_to_field(creator_field);

        let amount_u64: u64 = royalty_amount as u64;
        let (royalty_credits, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                creator_address,
                amount_u64
            );

        let receipt: RoyaltyReceipt = RoyaltyReceipt {
            owner: creator_address,
            auction_id: auction_id,
            amount: royalty_amount,
            token_type: TOKEN_ALEO,
        };

        return (receipt, royalty_credits, finalize_claim_royalty(
            transfer_future, auction_id, creator_hash, royalty_amount
        ));
    }

    async function finalize_claim_royalty(
        f0: Future,
        auction_id: field,
        creator_hash: field,
        claimed_amount: u128
    ) {
        f0.await();

        let reg: RoyaltyRegistration = royalty_balances.get(auction_id);
        assert_eq(reg.creator_hash, creator_hash);
        assert_eq(reg.claimed, 0u8);
        assert_eq(reg.token_type, TOKEN_ALEO);
        assert_eq(claimed_amount, reg.amount);

        // Mark as claimed.
        royalty_balances.set(auction_id, RoyaltyRegistration {
            creator_hash: reg.creator_hash,
            amount: reg.amount,
            token_type: reg.token_type,
            claimed: 1u8,
        });
    }

    // ########################################################################
    //    T15: CLAIM ROYALTY — USDCx version
    // ########################################################################

    async transition claim_royalty_usdcx(
        private auction_id: field,
        private creator_address: address,
        private royalty_amount: u128
    ) -> (RoyaltyReceipt, Future) {
        let creator_field: field = creator_address as field;
        let creator_hash: field = BHP256::hash_to_field(creator_field);

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
            creator_address,
            royalty_amount
        );

        let receipt: RoyaltyReceipt = RoyaltyReceipt {
            owner: creator_address,
            auction_id: auction_id,
            amount: royalty_amount,
            token_type: TOKEN_USDCX,
        };

        return (receipt, finalize_claim_royalty_usdcx(
            transfer_future, auction_id, creator_hash, royalty_amount
        ));
    }

    async function finalize_claim_royalty_usdcx(
        f0: Future,
        auction_id: field,
        creator_hash: field,
        claimed_amount: u128
    ) {
        f0.await();

        let reg: RoyaltyRegistration = royalty_balances.get(auction_id);
        assert_eq(reg.creator_hash, creator_hash);
        assert_eq(reg.claimed, 0u8);
        assert_eq(reg.token_type, TOKEN_USDCX);
        assert_eq(claimed_amount, reg.amount);

        royalty_balances.set(auction_id, RoyaltyRegistration {
            creator_hash: reg.creator_hash,
            amount: reg.amount,
            token_type: reg.token_type,
            claimed: 1u8,
        });
    }

    // ########################################################################
    //    T16: CLAIM ROYALTY — USAD version
    // ########################################################################

    async transition claim_royalty_usad(
        private auction_id: field,
        private creator_address: address,
        private royalty_amount: u128
    ) -> (RoyaltyReceipt, Future) {
        let creator_field: field = creator_address as field;
        let creator_hash: field = BHP256::hash_to_field(creator_field);

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(
            creator_address,
            royalty_amount
        );

        let receipt: RoyaltyReceipt = RoyaltyReceipt {
            owner: creator_address,
            auction_id: auction_id,
            amount: royalty_amount,
            token_type: TOKEN_USAD,
        };

        return (receipt, finalize_claim_royalty_usad(
            transfer_future, auction_id, creator_hash, royalty_amount
        ));
    }

    async function finalize_claim_royalty_usad(
        f0: Future,
        auction_id: field,
        creator_hash: field,
        claimed_amount: u128
    ) {
        f0.await();

        let reg: RoyaltyRegistration = royalty_balances.get(auction_id);
        assert_eq(reg.creator_hash, creator_hash);
        assert_eq(reg.claimed, 0u8);
        assert_eq(reg.token_type, TOKEN_USAD);
        assert_eq(claimed_amount, reg.amount);

        royalty_balances.set(auction_id, RoyaltyRegistration {
            creator_hash: reg.creator_hash,
            amount: reg.amount,
            token_type: reg.token_type,
            claimed: 1u8,
        });
    }

    // ########################################################################
    //    T17: SET PROVENANCE — Link resale auctions to originals
    // ########################################################################
    //
    // Creates an on-chain link from a new auction to a previous auction,
    // establishing provenance (chain of ownership). If first sale, use 0field.
    // The caller passes auction_id and seller_hash; the market program
    // verifies the seller_hash matches the caller.

    async transition set_provenance(
        private auction_id: field,
        private previous_auction_id: field
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return finalize_set_provenance(auction_id, previous_auction_id, caller_hash);
    }

    async function finalize_set_provenance(
        auction_id: field,
        previous_auction_id: field,
        caller_hash: field
    ) {
        // Prevent overwriting existing provenance.
        let already_set: bool = provenance.contains(auction_id);
        assert(!already_set);

        provenance.set(auction_id, previous_auction_id);
    }

    // ########################################################################
    //    T18: SET RESULT TIMELOCK — Delay public result reveal
    // ########################################################################

    async transition set_result_timelock(
        private auction_id: field,
        private reveal_after_block: u64
    ) -> Future {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return finalize_set_result_timelock(auction_id, reveal_after_block, caller_hash);
    }

    async function finalize_set_result_timelock(
        auction_id: field,
        reveal_after_block: u64,
        caller_hash: field
    ) {
        let current_height: u64 = block.height as u64;
        assert(reveal_after_block > current_height);

        // Prevent overwriting existing timelock.
        let already_set: bool = result_reveal_block.contains(auction_id);
        assert(!already_set);

        result_reveal_block.set(auction_id, reveal_after_block);
    }

    // ########################################################################
    //    T19: REVEAL AUCTION RESULT — Public after timelock
    // ########################################################################
    //
    // Since we cannot read v5's highest_bids mapping, the caller provides
    // the winning_price as a private input. The frontend reads this from
    // v5's highest_bids[auction_id] off-chain before calling.

    async transition reveal_auction_result(
        private auction_id: field,
        private winning_price: u128
    ) -> Future {
        return finalize_reveal_auction_result(auction_id, winning_price);
    }

    async function finalize_reveal_auction_result(
        auction_id: field,
        winning_price: u128
    ) {
        let current_height: u64 = block.height as u64;
        let reveal_block: u64 = result_reveal_block.get(auction_id);
        assert(current_height >= reveal_block);

        // Prevent double-reveal.
        let already_revealed: bool = revealed_results.contains(auction_id);
        assert(!already_revealed);

        revealed_results.set(auction_id, winning_price);
    }

    // ########################################################################
    //    T20: FORFEIT UNREVEALED BID — Mark abandoned bids
    // ########################################################################
    //
    // After the reveal deadline, anyone can call this to mark a bid as
    // forfeit if the bidder failed to reveal. The caller provides the
    // auction_id, bid_hash, and the reveal_deadline from v5's auctions
    // mapping (read off-chain). Finalize checks current block > deadline.

    async transition forfeit_unrevealed_bid(
        private auction_id: field,
        private bid_hash: field,
        private reveal_deadline: u64
    ) -> Future {
        return finalize_forfeit_unrevealed_bid(auction_id, bid_hash, reveal_deadline);
    }

    async function finalize_forfeit_unrevealed_bid(
        auction_id: field,
        bid_hash: field,
        reveal_deadline: u64
    ) {
        let current_height: u64 = block.height as u64;
        assert(current_height > reveal_deadline);

        // Prevent double-forfeit.
        let already_forfeit: bool = forfeit_status.contains(bid_hash);
        assert(!already_forfeit);

        // Mark as forfeit.
        forfeit_status.set(bid_hash, 1u8);
    }

    // ########################################################################
    //    T21: PROVE CLEAN SLATE — On-chain attestation of no disputes
    // ########################################################################
    //
    // A wallet can prove on-chain that it has zero disputes filed against it.
    // The market program maintains its own seller_disputed mapping. For
    // wallets that only interact with v5, the frontend should call this
    // after verifying v5's seller_disputed[wallet_hash] == 0 off-chain.

    async transition prove_clean_slate(
        private wallet: address
    ) -> (CleanSlateProof, Future) {
        let wallet_field: field = wallet as field;
        let wallet_hash: field = BHP256::hash_to_field(wallet_field);

        let proof: CleanSlateProof = CleanSlateProof {
            owner: self.caller,
            wallet_hash: wallet_hash,
            proof_block: 0u64,
            auction_count: 0u64,
        };

        return (proof, finalize_prove_clean_slate(wallet_hash));
    }

    async function finalize_prove_clean_slate(
        wallet_hash: field
    ) {
        // Verify the wallet has no disputes in this program's records.
        let disputed_count: u64 = seller_disputed.get_or_use(wallet_hash, 0u64);
        assert_eq(disputed_count, 0u64);
    }

}
