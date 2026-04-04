// ============================================================================
// OBSCURA MARKET v2 — Marketplace Extensions
// ============================================================================
// Fixed-price private sales, RFQ (reverse auctions), token sales,
// royalty enforcement, provenance tracking, and selective disclosure.
// Independent program — does not import obscura_core.
//
// 15 transitions | 3 records | 10 mappings | 6 structs
// ============================================================================

import credits.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;

program obscura_market_v2.aleo {

    @noupgrade
    constructor() {}

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const TOKEN_ALEO: u8 = 1u8;
    const TOKEN_USDCX: u8 = 2u8;
    const TOKEN_USAD: u8 = 3u8;

    const SALE_ACTIVE: u8 = 1u8;
    const SALE_SOLD: u8 = 2u8;
    const SALE_DELISTED: u8 = 3u8;

    const RFQ_OPEN: u8 = 1u8;
    const RFQ_ACCEPTED: u8 = 2u8;
    const RFQ_CANCELLED: u8 = 3u8;

    const PLATFORM_FEE_BPS: u128 = 100u128;
    const FEE_DENOMINATOR: u128 = 10000u128;

    // ========================================================================
    // RECORDS
    // ========================================================================

    record MarketReceipt {
        owner: address,
        listing_id: field,
        item_hash: field,
        purchase_amount: u128,
        token_type: u8,
    }

    record QuoteRecord {
        owner: address,
        rfq_id: field,
        quote_amount: u128,
        quote_hash: field,
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

    // ========================================================================
    // STRUCTS
    // ========================================================================

    struct FixedSaleConfig {
        seller_hash: field,
        item_hash: field,
        price: u128,
        token_type: u8,
        status: u8,
    }

    struct RFQConfig {
        buyer_hash: field,
        category: u8,
        description_hash: field,
        max_budget_hash: field,
        deadline: u64,
        token_type: u8,
        status: u8,
    }

    struct TokenSaleConfig {
        seller_hash: field,
        item_hash: field,
        total_supply: u128,
        remaining_supply: u128,
        min_price_per_unit: u128,
        token_type: u8,
        deadline: u64,
    }

    struct ListingSeed {
        creator: address,
        item_hash: field,
        nonce: field,
    }

    struct RoyaltyInfo {
        creator_hash: field,
        bps: u128,
    }

    struct ProvenanceEntry {
        previous_id: field,
        settled_at: u64,
    }

    // ========================================================================
    // MAPPINGS (10)
    // ========================================================================

    mapping fixed_sales: field => FixedSaleConfig;
    mapping rfq_configs: field => RFQConfig;
    mapping rfq_quote_count: field => u64;
    mapping token_sales: field => TokenSaleConfig;
    mapping provenance: field => field;
    mapping royalty_info: field => RoyaltyInfo;
    mapping market_treasury: u8 => u128;
    mapping market_balance: u8 => u128;
    mapping sale_escrow: field => u128;
    mapping market_config: u8 => field;

    // ########################################################################
    //              T1: CREATE FIXED SALE
    // ########################################################################

    fn create_fixed_sale(
        private item_hash: field,
        private price: u128,
        private token_type: u8,
        private nonce: field
    ) -> (field, Final) {
        assert(price > 0u128);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        let seed: ListingSeed = ListingSeed {
            creator: self.caller,
            item_hash: item_hash,
            nonce: nonce,
        };
        let listing_id: field = BHP256::hash_to_field(seed);

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

        return (listing_id, final {
            let exists: bool = fixed_sales.contains(listing_id);
            assert(!exists);

            fixed_sales.set(listing_id, FixedSaleConfig {
                seller_hash: seller_hash,
                item_hash: item_hash,
                price: price,
                token_type: token_type,
                status: SALE_ACTIVE,
            });
        });
    }

    // ########################################################################
    //              T2: BUY FIXED SALE — ALEO
    // ########################################################################

    fn buy_fixed_sale(
        private listing_id: field,
        private item_hash: field,
        private price: u128,
        private credits_in: credits.aleo::credits
    ) -> (MarketReceipt, credits.aleo::credits, Final) {
        let amount_u64: u64 = price as u64;
        let (change, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
                credits_in,
                self.address,
                amount_u64
            );

        let receipt: MarketReceipt = MarketReceipt {
            owner: self.caller,
            listing_id: listing_id,
            item_hash: item_hash,
            purchase_amount: price,
            token_type: TOKEN_ALEO,
        };

        return (receipt, change, final {
            transfer_final.run();

            let sale: FixedSaleConfig = fixed_sales.get(listing_id);
            assert_eq(sale.status, SALE_ACTIVE);
            assert_eq(sale.token_type, TOKEN_ALEO);
            assert(price >= sale.price);

            let fee: u128 = price * PLATFORM_FEE_BPS / FEE_DENOMINATOR;
            let treasury: u128 = market_treasury.get_or_use(0u8, 0u128);
            market_treasury.set(0u8, treasury + fee);

            let bal: u128 = market_balance.get_or_use(0u8, 0u128);
            market_balance.set(0u8, bal + price);

            sale_escrow.set(listing_id, price - fee);

            fixed_sales.set(listing_id, FixedSaleConfig {
                seller_hash: sale.seller_hash,
                item_hash: sale.item_hash,
                price: sale.price,
                token_type: sale.token_type,
                status: SALE_SOLD,
            });
        });
    }

    // ########################################################################
    //              T3: BUY FIXED SALE — USDCx
    // ########################################################################

    fn buy_fixed_sale_usdcx(
        private listing_id: field,
        private item_hash: field,
        private price: u128
    ) -> (MarketReceipt, Final) {
        let transfer_final: Final =
            test_usdcx_stablecoin.aleo::transfer_public_as_signer(
                self.address,
                price
            );

        let receipt: MarketReceipt = MarketReceipt {
            owner: self.caller,
            listing_id: listing_id,
            item_hash: item_hash,
            purchase_amount: price,
            token_type: TOKEN_USDCX,
        };

        return (receipt, final {
            transfer_final.run();

            let sale: FixedSaleConfig = fixed_sales.get(listing_id);
            assert_eq(sale.status, SALE_ACTIVE);
            assert_eq(sale.token_type, TOKEN_USDCX);
            assert(price >= sale.price);

            let fee: u128 = price * PLATFORM_FEE_BPS / FEE_DENOMINATOR;
            let treasury: u128 = market_treasury.get_or_use(1u8, 0u128);
            market_treasury.set(1u8, treasury + fee);

            let bal: u128 = market_balance.get_or_use(1u8, 0u128);
            market_balance.set(1u8, bal + price);

            sale_escrow.set(listing_id, price - fee);

            fixed_sales.set(listing_id, FixedSaleConfig {
                seller_hash: sale.seller_hash,
                item_hash: sale.item_hash,
                price: sale.price,
                token_type: sale.token_type,
                status: SALE_SOLD,
            });
        });
    }

    // ########################################################################
    //              T4: BUY FIXED SALE — USAD
    // ########################################################################

    fn buy_fixed_sale_usad(
        private listing_id: field,
        private item_hash: field,
        private price: u128
    ) -> (MarketReceipt, Final) {
        let transfer_final: Final =
            test_usad_stablecoin.aleo::transfer_public_as_signer(
                self.address,
                price
            );

        let receipt: MarketReceipt = MarketReceipt {
            owner: self.caller,
            listing_id: listing_id,
            item_hash: item_hash,
            purchase_amount: price,
            token_type: TOKEN_USAD,
        };

        return (receipt, final {
            transfer_final.run();

            let sale: FixedSaleConfig = fixed_sales.get(listing_id);
            assert_eq(sale.status, SALE_ACTIVE);
            assert_eq(sale.token_type, TOKEN_USAD);
            assert(price >= sale.price);

            let fee: u128 = price * PLATFORM_FEE_BPS / FEE_DENOMINATOR;
            let treasury: u128 = market_treasury.get_or_use(2u8, 0u128);
            market_treasury.set(2u8, treasury + fee);

            let bal: u128 = market_balance.get_or_use(2u8, 0u128);
            market_balance.set(2u8, bal + price);

            sale_escrow.set(listing_id, price - fee);

            fixed_sales.set(listing_id, FixedSaleConfig {
                seller_hash: sale.seller_hash,
                item_hash: sale.item_hash,
                price: sale.price,
                token_type: sale.token_type,
                status: SALE_SOLD,
            });
        });
    }

    // ########################################################################
    //              T5: DELIST ITEM
    // ########################################################################

    fn delist_item(
        private listing_id: field
    ) -> Final {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return final {
            let sale: FixedSaleConfig = fixed_sales.get(listing_id);
            assert_eq(sale.seller_hash, caller_hash);
            assert_eq(sale.status, SALE_ACTIVE);

            fixed_sales.set(listing_id, FixedSaleConfig {
                seller_hash: sale.seller_hash,
                item_hash: sale.item_hash,
                price: sale.price,
                token_type: sale.token_type,
                status: SALE_DELISTED,
            });
        };
    }

    // ########################################################################
    //              T6: CREATE RFQ (Request for Quote — reverse auction)
    // ########################################################################

    fn create_rfq(
        private category: u8,
        private description_hash: field,
        private max_budget: u128,
        private token_type: u8,
        private nonce: field,
        public deadline: u64
    ) -> (field, Final) {
        assert(max_budget > 0u128);
        assert(
            token_type == TOKEN_ALEO ||
            token_type == TOKEN_USDCX ||
            token_type == TOKEN_USAD
        );

        let seed: ListingSeed = ListingSeed {
            creator: self.caller,
            item_hash: description_hash,
            nonce: nonce,
        };
        let rfq_id: field = BHP256::hash_to_field(seed);

        let buyer_field: field = self.caller as field;
        let buyer_hash: field = BHP256::hash_to_field(buyer_field);

        let budget_field: field = max_budget as field;
        let budget_hash: field = BHP256::hash_to_field(budget_field);

        return (rfq_id, final {
            let exists: bool = rfq_configs.contains(rfq_id);
            assert(!exists);

            let current_height: u64 = block.height as u64;
            assert(deadline > current_height);

            rfq_configs.set(rfq_id, RFQConfig {
                buyer_hash: buyer_hash,
                category: category,
                description_hash: description_hash,
                max_budget_hash: budget_hash,
                deadline: deadline,
                token_type: token_type,
                status: RFQ_OPEN,
            });
        });
    }

    // ########################################################################
    //              T7: SUBMIT QUOTE
    // ########################################################################

    fn submit_quote(
        private rfq_id: field,
        private quote_amount: u128,
        private nonce: field
    ) -> (QuoteRecord, Final) {
        let quote_hash: field = BHP256::hash_to_field(quote_amount as field);

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

        let quote: QuoteRecord = QuoteRecord {
            owner: self.caller,
            rfq_id: rfq_id,
            quote_amount: quote_amount,
            quote_hash: quote_hash,
            token_type: 0u8,
        };

        return (quote, final {
            let rfq: RFQConfig = rfq_configs.get(rfq_id);
            assert_eq(rfq.status, RFQ_OPEN);

            let current_height: u64 = block.height as u64;
            assert(current_height <= rfq.deadline);

            let count: u64 = rfq_quote_count.get_or_use(rfq_id, 0u64);
            rfq_quote_count.set(rfq_id, count + 1u64);
        });
    }

    // ########################################################################
    //              T8: ACCEPT QUOTE — ALEO
    // ########################################################################

    fn accept_quote(
        private rfq_id: field,
        private quote: QuoteRecord,
        private seller_address: address,
        private credits_in: credits.aleo::credits
    ) -> (MarketReceipt, credits.aleo::credits, Final) {
        let amount_u64: u64 = quote.quote_amount as u64;
        let (change, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
                credits_in,
                seller_address,
                amount_u64
            );

        let receipt: MarketReceipt = MarketReceipt {
            owner: self.caller,
            listing_id: rfq_id,
            item_hash: quote.quote_hash,
            purchase_amount: quote.quote_amount,
            token_type: TOKEN_ALEO,
        };

        let buyer_field: field = self.caller as field;
        let buyer_hash: field = BHP256::hash_to_field(buyer_field);

        return (receipt, change, final {
            transfer_final.run();

            let rfq: RFQConfig = rfq_configs.get(rfq_id);
            assert_eq(rfq.status, RFQ_OPEN);
            assert_eq(rfq.buyer_hash, buyer_hash);

            rfq_configs.set(rfq_id, RFQConfig {
                buyer_hash: rfq.buyer_hash,
                category: rfq.category,
                description_hash: rfq.description_hash,
                max_budget_hash: rfq.max_budget_hash,
                deadline: rfq.deadline,
                token_type: rfq.token_type,
                status: RFQ_ACCEPTED,
            });
        });
    }

    // ########################################################################
    //              T9: ACCEPT QUOTE — USDCx
    // ########################################################################

    fn accept_quote_usdcx(
        private rfq_id: field,
        private quote: QuoteRecord,
        private seller_address: address
    ) -> (MarketReceipt, Final) {
        let transfer_final: Final =
            test_usdcx_stablecoin.aleo::transfer_public_as_signer(
                seller_address,
                quote.quote_amount
            );

        let receipt: MarketReceipt = MarketReceipt {
            owner: self.caller,
            listing_id: rfq_id,
            item_hash: quote.quote_hash,
            purchase_amount: quote.quote_amount,
            token_type: TOKEN_USDCX,
        };

        let buyer_field: field = self.caller as field;
        let buyer_hash: field = BHP256::hash_to_field(buyer_field);

        return (receipt, final {
            transfer_final.run();

            let rfq: RFQConfig = rfq_configs.get(rfq_id);
            assert_eq(rfq.status, RFQ_OPEN);
            assert_eq(rfq.buyer_hash, buyer_hash);

            rfq_configs.set(rfq_id, RFQConfig {
                buyer_hash: rfq.buyer_hash,
                category: rfq.category,
                description_hash: rfq.description_hash,
                max_budget_hash: rfq.max_budget_hash,
                deadline: rfq.deadline,
                token_type: rfq.token_type,
                status: RFQ_ACCEPTED,
            });
        });
    }

    // ########################################################################
    //              T10: CREATE TOKEN SALE
    // ########################################################################

    fn create_token_sale(
        private item_hash: field,
        private total_supply: u128,
        private min_price_per_unit: u128,
        private token_type: u8,
        private nonce: field,
        public deadline: u64
    ) -> (field, Final) {
        assert(total_supply > 0u128);
        assert(min_price_per_unit > 0u128);

        let seed: ListingSeed = ListingSeed {
            creator: self.caller,
            item_hash: item_hash,
            nonce: nonce,
        };
        let sale_id: field = BHP256::hash_to_field(seed);

        let seller_field: field = self.caller as field;
        let seller_hash: field = BHP256::hash_to_field(seller_field);

        return (sale_id, final {
            let exists: bool = token_sales.contains(sale_id);
            assert(!exists);

            let current_height: u64 = block.height as u64;
            assert(deadline > current_height);

            token_sales.set(sale_id, TokenSaleConfig {
                seller_hash: seller_hash,
                item_hash: item_hash,
                total_supply: total_supply,
                remaining_supply: total_supply,
                min_price_per_unit: min_price_per_unit,
                token_type: token_type,
                deadline: deadline,
            });
        });
    }

    // ########################################################################
    //              T11: BID TOKEN SALE — ALEO
    // ########################################################################

    fn bid_token_sale(
        private sale_id: field,
        private quantity: u128,
        private price_per_unit: u128,
        private credits_in: credits.aleo::credits
    ) -> (MarketReceipt, credits.aleo::credits, Final) {
        let total: u128 = quantity * price_per_unit;
        let total_u64: u64 = total as u64;

        let (change, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
                credits_in,
                self.address,
                total_u64
            );

        let receipt: MarketReceipt = MarketReceipt {
            owner: self.caller,
            listing_id: sale_id,
            item_hash: 0field,
            purchase_amount: total,
            token_type: TOKEN_ALEO,
        };

        return (receipt, change, final {
            transfer_final.run();

            let sale: TokenSaleConfig = token_sales.get(sale_id);
            assert_eq(sale.token_type, TOKEN_ALEO);

            let current_height: u64 = block.height as u64;
            assert(current_height <= sale.deadline);

            assert(price_per_unit >= sale.min_price_per_unit);
            assert(quantity <= sale.remaining_supply);

            token_sales.set(sale_id, TokenSaleConfig {
                seller_hash: sale.seller_hash,
                item_hash: sale.item_hash,
                total_supply: sale.total_supply,
                remaining_supply: sale.remaining_supply - quantity,
                min_price_per_unit: sale.min_price_per_unit,
                token_type: sale.token_type,
                deadline: sale.deadline,
            });

            let bal: u128 = market_balance.get_or_use(0u8, 0u128);
            market_balance.set(0u8, bal + total);

            let escrow: u128 = sale_escrow.get_or_use(sale_id, 0u128);
            sale_escrow.set(sale_id, escrow + total);
        });
    }

    // ########################################################################
    //              T12: BID TOKEN SALE — USDCx
    // ########################################################################

    fn bid_token_sale_usdcx(
        private sale_id: field,
        private quantity: u128,
        private price_per_unit: u128
    ) -> (MarketReceipt, Final) {
        let total: u128 = quantity * price_per_unit;

        let transfer_final: Final =
            test_usdcx_stablecoin.aleo::transfer_public_as_signer(
                self.address,
                total
            );

        let receipt: MarketReceipt = MarketReceipt {
            owner: self.caller,
            listing_id: sale_id,
            item_hash: 0field,
            purchase_amount: total,
            token_type: TOKEN_USDCX,
        };

        return (receipt, final {
            transfer_final.run();

            let sale: TokenSaleConfig = token_sales.get(sale_id);
            assert_eq(sale.token_type, TOKEN_USDCX);

            let current_height: u64 = block.height as u64;
            assert(current_height <= sale.deadline);

            assert(price_per_unit >= sale.min_price_per_unit);
            assert(quantity <= sale.remaining_supply);

            token_sales.set(sale_id, TokenSaleConfig {
                seller_hash: sale.seller_hash,
                item_hash: sale.item_hash,
                total_supply: sale.total_supply,
                remaining_supply: sale.remaining_supply - quantity,
                min_price_per_unit: sale.min_price_per_unit,
                token_type: sale.token_type,
                deadline: sale.deadline,
            });

            let bal: u128 = market_balance.get_or_use(1u8, 0u128);
            market_balance.set(1u8, bal + total);

            let escrow: u128 = sale_escrow.get_or_use(sale_id, 0u128);
            sale_escrow.set(sale_id, escrow + total);
        });
    }

    // ########################################################################
    //              T13: SET PROVENANCE
    // ########################################################################

    fn set_provenance(
        private auction_id: field,
        private previous_auction_id: field
    ) -> Final {
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return final {
            let already_set: bool = provenance.contains(auction_id);
            assert(!already_set);
            provenance.set(auction_id, previous_auction_id);
        };
    }

    // ########################################################################
    //              T14: SET ROYALTY
    // ########################################################################

    fn set_royalty(
        private auction_id: field,
        private bps: u128
    ) -> Final {
        assert(bps <= 1000u128);
        let caller_field: field = self.caller as field;
        let creator_hash: field = BHP256::hash_to_field(caller_field);
        return final {
            let already_set: bool = royalty_info.contains(auction_id);
            assert(!already_set);
            royalty_info.set(auction_id, RoyaltyInfo {
                creator_hash: creator_hash,
                bps: bps,
            });
        };
    }

    // ########################################################################
    //              T15: PROVE WON AUCTION (selective disclosure)
    // ########################################################################

    fn prove_won_auction(
        private cert: WinnerCertificate,
        public auction_id: field
    ) -> (WinnerCertificate, bool) {
        assert_eq(cert.auction_id, auction_id);
        return (cert, true);
    }
}
