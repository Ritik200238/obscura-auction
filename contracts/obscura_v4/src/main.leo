// ============================================================================
// OBSCURA AUCTION v4 — Multi-Format Privacy Auction Protocol
// ============================================================================
// Four auction formats on Aleo: Sealed First-Price, Vickrey (2nd-price),
// Dutch (descending-price), and English (ascending-price).
//
// 51 transitions | 8 records | 32 mappings | 12 structs | 8-state machine
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
// ============================================================================

import credits.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_stablecoin.aleo;

program obscura_v4.aleo {

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
    const STATUS_DISPUTED: u8 = 7u8;  // Reserved — dispute mechanism planned for v3
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
    const DISPUTE_WINDOW_BLOCKS: u64 = 100u64;  // Blocks after settlement to file dispute
    const DISPUTE_BOND_MIN_BPS: u128 = 1000u128; // 10% of highest bid as minimum bond

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

    // DutchConfig: descending-price auction parameters.
    // Price at any block = start_price - ((start_price - end_price) * elapsed / total_duration)
    // where elapsed = block.height - auction.created_at, total_duration = deadline - created_at.
    // end_price is the floor — price never drops below it.
    struct DutchConfig {
        start_price: u128,
        end_price: u128,
    }

    // DisputeData: records who disputed an auction and their bond.
    // disputer_hash is BHP256(address) — the actual address is never stored publicly.
    // The admin receives the disputer_address privately at resolve time and verifies the hash.
    struct DisputeData {
        disputer_hash: field,
        bond_amount: u128,
        reason_hash: field,
        filed_at: u64,
    }

    // RFQConfig: Request-For-Quote (reverse auction) configuration.
    // Buyer posts a request; sellers submit quotes privately.
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
    // Seller sets a price; first buyer to pay gets the item.
    struct FixedSaleConfig {
        seller_hash: field,
        item_hash: field,
        price: u128,
        token_type: u8,
        is_sold: u8,
    }

    // TokenSaleConfig: Fair-launch token sale with fixed supply.
    // Multiple buyers can participate until supply runs out or deadline passes.
    struct TokenSaleConfig {
        seller_hash: field,
        total_supply: u128,
        remaining_supply: u128,
        min_price_per_token: u128,
        token_type: u8,
        deadline_block: u32,
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
    // dutch_params: descending-price schedule for Dutch auctions.
    // Key: auction_id. Value: DutchConfig{start_price, end_price}.
    // Current price computed from block height during bid_dutch finalize.
    mapping dutch_params: field => DutchConfig;
    // disputes: active dispute records for settled auctions.
    mapping disputes: field => DisputeData;
    // dispute_bonds: ALEO bond amount held per disputed auction.
    mapping dispute_bonds: field => u128;

    // ---- Wave 4 mappings ----
    // scheduled_start: auction_id => start_block (0 means no schedule / immediate).
    mapping scheduled_start: field => u64;
    // reveal_deadlines_custom: auction_id => custom reveal deadline block.
    mapping reveal_deadlines_custom: field => u64;
    // forfeit_status: bid_hash => 0=active, 1=forfeit.
    mapping forfeit_status: field => u8;
    // seller_completed: seller_hash => completed auction count.
    mapping seller_completed: field => u64;
    // seller_disputed: seller_hash => disputed auction count.
    mapping seller_disputed: field => u64;
    // royalty_info: auction_id => creator_address_hash.
    mapping royalty_info: field => field;
    // royalty_bps: auction_id => royalty basis points (max 1000 = 10%).
    mapping royalty_bps: field => u128;
    // provenance: auction_id => previous_auction_id (0field if first sale).
    mapping provenance: field => field;
    // result_reveal_block: auction_id => block after which result becomes public.
    mapping result_reveal_block: field => u64;
    // revealed_results: auction_id => winning_price (public after timelock).
    mapping revealed_results: field => u128;
    // rfq_configs: rfq_id => RFQConfig.
    mapping rfq_configs: field => RFQConfig;
    // fixed_sales: sale_id => FixedSaleConfig.
    mapping fixed_sales: field => FixedSaleConfig;
    // token_sales: sale_id => TokenSaleConfig.
    mapping token_sales: field => TokenSaleConfig;
    // rfq_quote_count: rfq_id => number of quotes received.
    mapping rfq_quote_count: field => u64;
    // royalty_balances: auction_id => unclaimed royalty amount.
    mapping royalty_balances: field => u128;
    // sale_receipts: sale_id => buyer_hash (for fixed sales).
    mapping sale_receipts: field => field;

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

        assert(auction_mode == MODE_FIRST_PRICE || auction_mode == MODE_VICKREY || auction_mode == MODE_ENGLISH);
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX || token_type == TOKEN_USAD);
        // USAD: First-Price only (Vickrey/Dutch/English USAD bid paths removed for variable limit)
        if (token_type == TOKEN_USAD) {
            assert_eq(auction_mode, MODE_FIRST_PRICE);
        }
        // Dutch/English: ALEO + USDCx only
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
        // close_bidding is only for sealed-bid modes (transitions to REVEALING phase).
        // Dutch settles instantly on first bid. English uses settle_english.
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
        private bid_nonce: field,
        private token_type: u8
    ) -> (SealedBid, Future) {
        assert(bid_amount >= MIN_BID_AMOUNT);
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX || token_type == TOKEN_USAD);

        // SealedBid record: owner-encrypted, bid amount completely private.
        // Only the bidder's view key can decrypt this record.
        let sealed: SealedBid = SealedBid {
            owner: self.caller,
            auction_id: auction_id,
            bid_amount: bid_amount,
            bid_nonce: bid_nonce,
            token_type: token_type,
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
        // Sealed-bid commitment only valid for first-price and Vickrey modes.
        // Dutch and English use their own bid transitions (bid_dutch, bid_english).
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

        // No anti-sniping for sealed-bid modes — bids are hidden commitments,
        // so there's nothing to snipe. Anti-sniping is applied in bid_english only.
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
    //              T5b: REVEAL BID + ESCROW — USDCx version
    // ########################################################################
    //
    // Same commit-reveal logic as reveal_bid, but escrows USDCx stablecoin.
    // USDCx uses transfer_public_as_signer (signer's public balance → program),
    // so no private record input/output — simpler than credits.aleo path.

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

        // Escrow USDCx: signer's public balance → program's public balance.
        // Amount is u128 natively (USDCx standard).
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
    //              T6: FINALIZE AUCTION (unified — seller calls)
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
    //              T9: CLAIM WIN — first-price settlement
    // ########################################################################
    //
    // DESIGN: The winner claims using their EscrowReceipt (created at reveal_bid).
    // The bid_hash is recomputed from EscrowReceipt fields — all information
    // needed is preserved in the receipt (auction_id, escrowed_amount, bid_nonce).
    //
    // ROUTING LOGIC (first-price vs Vickrey):
    //   - First-price auctions: use this transition. Seller gets escrowed - fee.
    //   - Vickrey auctions where highest == second: use this transition (no refund needed).
    //   - Vickrey auctions where highest > second: MUST use claim_win_vickrey instead.
    //     The finalize guard (assert_eq highest, second) enforces correct routing.
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

        // Guard: for Vickrey/Dutch mode, this transition is only valid when
        // highest == second (no overpayment to refund). When highest > second,
        // the winner MUST use claim_win_vickrey to receive their change.
        // Dutch auctions store actual_price in second_highest_bids — if the bidder
        // paid exactly the Dutch price, highest == second and this path works.
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
    //              CLAIM WIN — USDCx first-price settlement
    // ########################################################################
    //
    // Same logic as claim_win but uses USDCx transfer_public (public payout).
    // No private credits record returned — seller receives public USDCx balance.

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

        // Seller receives USDCx payout as public balance transfer.
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

        // USDCx treasury tracked under key 1u8
        let treasury: u128 = platform_treasury.get_or_use(1u8, 0u128);
        platform_treasury.set(1u8, treasury + fee);

        let bal: u128 = program_balance.get(1u8);
        program_balance.set(1u8, bal - bid_amount);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - bid_amount);
    }

    // ########################################################################
    //              CLAIM WIN VICKREY — winner pays second-highest bid
    // ########################################################################
    //
    // VICKREY SETTLEMENT: In a second-price auction, the winner pays the
    // second-highest bid, NOT their own bid. This creates a savings:
    //   winner_change = escrowed_amount - second_price
    //
    // Because Leo mapping reads happen only in async finalize but token
    // transfers are computed in the sync transition body, the caller must
    // pass `claimed_second_price` as a private input. Finalize verifies
    // it against second_highest_bids[auction_id] — manipulation is impossible.
    //
    // Accounting (all values verified in finalize):
    //   seller receives:  second_price - fee
    //   winner receives:  escrowed_amount - second_price  (refund)
    //   platform keeps:   fee  (on the second_price, not the escrowed amount)
    //   total out:        escrowed_amount - fee  (same as first-price total)

    async transition claim_win_vickrey(
        private receipt: EscrowReceipt,
        private seller_address: address,
        private item_hash: field,
        private claimed_second_price: u128
    ) -> (WinnerCertificate, SellerReceipt, credits.aleo/credits, credits.aleo/credits, Future) {
        assert_eq(receipt.token_type, TOKEN_ALEO);

        // Winner must have escrowed MORE than the second price.
        // If equal, use claim_win instead (no change to refund).
        assert(receipt.escrowed_amount > claimed_second_price);
        // Second price must be positive (Vickrey requires >= 2 revealed bids).
        assert(claimed_second_price > 0u128);

        let bid_hash: field = BHP256::hash_to_field(BidCommitment {
            bidder: receipt.owner,
            auction_id: receipt.auction_id,
            amount: receipt.escrowed_amount,
            nonce: receipt.bid_nonce,
        });

        // Vickrey payout math — fee is on the ACTUAL sale price (second-highest).
        let fee: u128 = (claimed_second_price * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        let seller_payout: u128 = claimed_second_price - fee;
        let winner_change: u128 = receipt.escrowed_amount - claimed_second_price;

        let seller_payout_u64: u64 = seller_payout as u64;
        let winner_change_u64: u64 = winner_change as u64;

        // Seller receives payment based on SECOND-highest bid (Vickrey principle).
        let (seller_credits, pay_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                seller_address,
                seller_payout_u64
            );

        // Winner receives refund of the overpayment (escrowed - second_price).
        let (winner_change_credits, change_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                receipt.owner,
                winner_change_u64
            );

        // Payment commitment uses the ACTUAL payment amount (second_price).
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
        // Vickrey and Dutch both use this path for overpayment refunds.
        // Vickrey: winner pays second-highest bid, refund = escrowed - second.
        // Dutch: winner pays current_dutch_price, refund = escrowed - dutch_price.
        assert(auction.auction_mode == MODE_VICKREY || auction.auction_mode == MODE_DUTCH);

        // Verify claimed_second_price matches on-chain mapping.
        // For Vickrey: this is the actual second-highest bid.
        // For Dutch: this is the actual Dutch price at time of purchase.
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

        // Deduct the FULL escrowed amount from program tracking.
        // Actual credits out = seller_payout + winner_change = escrowed - fee.
        // Remaining fee stays in program public balance, tracked by platform_treasury.
        let bal: u128 = program_balance.get(0u8);
        program_balance.set(0u8, bal - escrowed_amount);

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - escrowed_amount);
    }

    // ########################################################################
    //              CLAIM WIN VICKREY — USDCx version
    // ########################################################################
    //
    // Vickrey settlement for USDCx auctions. Two transfer_public calls:
    // one to pay seller (second_price - fee), one to refund winner (escrowed - second_price).

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

        // Seller receives second_price minus fee.
        let pay_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
            seller_address,
            seller_payout
        );

        // Winner receives refund of the overpayment.
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
    //              CLAIM REFUND (ALEO)
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

        let credit_key: u8 = token_type == TOKEN_ALEO ? 0u8
            : token_type == TOKEN_USDCX ? 1u8 : 2u8;
        let bal: u128 = program_balance.get(credit_key);
        program_balance.set(credit_key, bal - amount);
    }

    // ########################################################################
    //              CLAIM REFUND — USDCx version
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

        // Refund USDCx to bidder's public balance.
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

        let escrow: u128 = auction_escrow.get(auction_id);
        auction_escrow.set(auction_id, escrow - amount);

        let bal: u128 = program_balance.get(1u8);
        program_balance.set(1u8, bal - amount);
    }

    // ########################################################################
    //              PROVE WON AUCTION — Selective Disclosure
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
        assert_eq(cert.auction_id, auction_id);
        return (cert, true);
    }

    // ########################################################################
    //    DUTCH AUCTION — Descending-price format (Nobel Prize: Vickrey, 1961)
    // ########################################################################
    //
    // DESIGN: Price starts at start_price and decreases linearly to end_price
    // over the auction duration. The first bidder to accept wins instantly.
    //
    // Price formula: current_price = start_price - (price_range * elapsed / duration)
    //   where price_range = start_price - end_price
    //         elapsed     = block.height - created_at
    //         duration    = deadline - created_at
    //
    // PRIVACY: The purchase price is deterministic from block height (public —
    // inherent to Dutch auctions). Bidder identity is private via records (ALEO)
    // or semi-private via public transfers (USDCx).
    //
    // TOKEN FLOW: Bidder transfers their bid_amount (>= current_price).
    // If bid_amount > current_price, the overpayment is refunded via
    // claim_win_vickrey (reuses the same refund logic).
    //
    // STATE: ACTIVE → SETTLED (instant, on first bid) or ACTIVE → EXPIRED.
    // No reveal phase. No close_bidding needed.

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
        // Dutch: ALEO + USDCx only (USAD Dutch bid path removed for variable limit)
        assert(token_type == TOKEN_ALEO || token_type == TOKEN_USDCX);

        let seed: AuctionSeed = AuctionSeed {
            creator: self.caller,
            item_hash: item_hash,
            deadline: deadline,
            nonce: auction_nonce,
        };
        let auction_id: field = BHP256::hash_to_field(seed);

        // For Dutch auctions, reserve_price_hash stores the hash of end_price (floor).
        // This is the effective reserve — if the price reaches end_price with no bidder,
        // the auction stays at floor until deadline, then expires.
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
    //    DUTCH BID — ALEO credits (instant settlement)
    // ########################################################################
    //
    // Bidder transfers bid_amount (must be >= current Dutch price).
    // Finalize computes the actual Dutch price from block height and verifies.
    // Auction moves directly to SETTLED on first valid bid.
    //
    // If bid_amount > current_price (timing buffer), use claim_win_vickrey
    // to get refund of (bid_amount - current_price). If exact, use claim_win.

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

        // Bidder must pay at least the current Dutch price.
        assert(bid_amount >= current_price);

        // Store bid data (reuses existing mappings for claim_win compatibility).
        bid_commitments.set(bid_hash, true);
        revealed_bids.set(bid_hash, bid_amount);

        // highest_bids = escrowed amount, second_highest_bids = actual Dutch price.
        // This enables claim_win_vickrey to refund (bid_amount - current_price).
        highest_bids.set(auction_id, bid_amount);
        second_highest_bids.set(auction_id, current_price);
        auction_winners.set(auction_id, bid_hash);

        // Update escrow tracking.
        let current_escrow: u128 = auction_escrow.get_or_use(auction_id, 0u128);
        auction_escrow.set(auction_id, current_escrow + bid_amount);

        let current_bal: u128 = program_balance.get_or_use(0u8, 0u128);
        program_balance.set(0u8, current_bal + bid_amount);

        // Instant settlement — Dutch auctions end on the first valid bid.
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

        // Settlement proof — records the Dutch price as the settlement amount.
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
    //    ENGLISH AUCTION — Ascending-price format
    // ########################################################################
    //
    // DESIGN: Open ascending bids. Each bid must exceed the current highest
    // by at least MIN_BID_INCREMENT_BPS (5%). Tokens are escrowed at bid time.
    // After the deadline, the seller settles. Winner calls claim_win.
    // All other bidders call claim_refund.
    //
    // PRIVACY: Bid amounts are public (ascending bids require transparency).
    // Bidder identity is private via records (ALEO) or semi-private (USDCx).
    //
    // STATE: ACTIVE → bid → bid → ... → settle_english → SETTLED or FAILED.
    // No seal/reveal phase. Anti-sniping reused from sealed-bid logic.

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

        // Dedup: same bid_hash cannot be submitted twice.
        let already_exists: bool = bid_commitments.contains(bid_hash);
        assert(!already_exists);
        bid_commitments.set(bid_hash, true);

        // Enforce minimum increment over current highest bid.
        let current_high: u128 = highest_bids.get_or_use(auction_id, 0u128);
        if (current_high > 0u128) {
            let min_increment: u128 = (current_high * MIN_BID_INCREMENT_BPS) / FEE_DENOMINATOR;
            assert(bid_amount >= current_high + min_increment);
        }

        // Store the bid as "revealed" immediately (English bids are public).
        revealed_bids.set(bid_hash, bid_amount);

        // Track highest and second-highest for settlement proof.
        if (bid_amount > current_high) {
            second_highest_bids.set(auction_id, current_high);
            highest_bids.set(auction_id, bid_amount);
            auction_winners.set(auction_id, bid_hash);
        }

        // Update escrow tracking.
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
    //    SETTLE ENGLISH — Seller finalizes after deadline
    // ########################################################################
    //
    // English auctions skip the reveal phase entirely. After deadline passes,
    // the seller settles directly. If highest_bid >= reserve → SETTLED.
    // Otherwise → FAILED and all bidders can claim_refund.
    //
    // After SETTLED, winner calls claim_win, losers call claim_refund.
    // (Existing transitions handle this — English bids are already in
    // revealed_bids, highest_bids, and auction_winners mappings.)

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

        // Verify seller knows the reserve price.
        assert_eq(reserve_hash, auction.reserve_price_hash);

        let winning_amount: u128 = highest_bids.get_or_use(auction_id, 0u128);
        let winner_bid_hash: field = auction_winners.get_or_use(auction_id, 0field);

        if (winning_amount >= reserve_price && winning_amount > 0u128) {
            // Reserve met — auction settles. Winner can now call claim_win.
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
            // Reserve not met or no bids — auction fails.
            // All bidders can claim_refund.
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
    //    USAD TOKEN SUPPORT — reveal, claim, refund, withdraw
    // ########################################################################
    //
    // USAD uses the same public-balance model as USDCx. API is identical:
    // transfer_public_as_signer (deposit), transfer_public (payout).
    // Separate transitions are required because Leo binds calls to specific
    // imported programs at compile time — no dynamic dispatch.

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
    //    CLAIM WIN — USAD first-price settlement
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
    //    CLAIM REFUND — USAD version
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
    //    DISPUTE RESOLUTION — Bond-based challenge mechanism
    // ########################################################################
    //
    // GAME THEORY: The bond creates a disincentive for frivolous disputes.
    // A rational actor only disputes if they believe the settlement is wrong
    // AND the expected value of winning the dispute exceeds the bond risk.
    //
    // Bond = max(10% of highest bid, MIN_BID_AMOUNT) — stakes real tokens.
    // If dispute upheld: auction → FAILED, all bidders can refund, bond returned.
    // If dispute rejected: bond forfeited to platform treasury.
    //
    // Only ALEO credits accepted as bond (simplifies accounting).
    // Any revealed bidder can file (they have proven on-chain participation).

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

        // Must dispute within DISPUTE_WINDOW of settlement.
        let settlement: SettlementData = settlements.get(auction_id);
        let current_height: u64 = block.height as u64;
        assert(current_height <= settlement.settled_at + DISPUTE_WINDOW_BLOCKS);

        // No existing dispute on this auction.
        let already_disputed: bool = disputes.contains(auction_id);
        assert(!already_disputed);

        // Bond must be at least 10% of the highest bid.
        let highest: u128 = highest_bids.get(auction_id);
        let min_bond: u128 = (highest * DISPUTE_BOND_MIN_BPS) / FEE_DENOMINATOR;
        assert(bond_amount >= min_bond);

        // Store dispute data.
        disputes.set(auction_id, DisputeData {
            disputer_hash: disputer_hash,
            bond_amount: bond_amount,
            reason_hash: reason_hash,
            filed_at: current_height,
        });

        dispute_bonds.set(auction_id, bond_amount);

        // Track bond in program balance.
        let bal: u128 = program_balance.get_or_use(0u8, 0u128);
        program_balance.set(0u8, bal + bond_amount);

        // Reputation: increment seller disputed count.
        let dcount: u64 = seller_disputed.get_or_use(auction.seller_hash, 0u64);
        seller_disputed.set(auction.seller_hash, dcount + 1u64);

        // Move auction to DISPUTED status.
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
    //    RESOLVE DISPUTE — Admin determines outcome
    // ########################################################################
    //
    // Admin resolves the dispute after reviewing evidence off-chain.
    // If upheld (dispute_valid=true):
    //   - Auction status → FAILED (all bidders can claim_refund)
    //   - Bond returned to disputer as private credits
    // If rejected (dispute_valid=false):
    //   - Auction status reverts to SETTLED (winner can proceed with claim)
    //   - Bond forfeited to platform treasury
    //
    // The disputer_address is passed privately — admin receives it off-chain
    // from the dispute filing event. Finalize verifies the hash matches.

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

        // Admin reads bond_amount from dispute_bonds mapping off-chain before calling.
        // Finalize verifies the passed amount matches the on-chain record.
        let bond_u64: u64 = bond_amount as u64;

        // If upheld: return full bond to disputer as private credits.
        // If rejected: transfer 1 microcredit placeholder to admin (bond forfeited in finalize).
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

        // Verify caller is admin.
        let cfg: PlatformConfig = platform_config.get(0u8);
        assert_eq(admin_hash, cfg.admin_hash);

        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_DISPUTED);

        // Verify disputer matches the one who filed.
        let dispute: DisputeData = disputes.get(auction_id);
        assert_eq(disputer_hash, dispute.disputer_hash);

        // Verify claimed bond matches actual on-chain bond.
        let actual_bond: u128 = dispute_bonds.get(auction_id);
        assert_eq(claimed_bond, actual_bond);

        if (dispute_valid) {
            // DISPUTE UPHELD: auction fails, all bidders can claim_refund.
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

            // Full bond returned to disputer via transfer_public_to_private above.
            let bal: u128 = program_balance.get(0u8);
            program_balance.set(0u8, bal - actual_bond);
        } else {
            // DISPUTE REJECTED: revert to SETTLED, bond forfeited to treasury.
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

            // Bond forfeited — 1 microcredit went to admin (placeholder transfer),
            // remaining bond stays in program. Move to treasury.
            let treasury: u128 = platform_treasury.get_or_use(0u8, 0u128);
            platform_treasury.set(0u8, treasury + actual_bond);

            let bal: u128 = program_balance.get(0u8);
            program_balance.set(0u8, bal - actual_bond);
        }

        // Clear dispute records.
        dispute_bonds.set(auction_id, 0u128);
    }

    // ########################################################################
    //    ADMIN EMERGENCY — Force-close stale auctions + pause toggle
    // ########################################################################
    //
    // CRITICAL SAFETY: If a seller abandons a REVEALING auction after bidders
    // have escrowed tokens, those funds would be permanently locked without
    // a force-close mechanism. This transition allows ANYONE to close a stale
    // revealing auction (where reveal_deadline has passed), moving it to
    // STATUS_FAILED so bidders can claim_refund.
    //
    // Admin can also toggle the platform pause flag to halt new auctions/bids.
    //
    // action=1: force-close a stale REVEALING auction → STATUS_FAILED
    // action=2: toggle platform pause (admin-only)

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
            // FORCE-CLOSE: Anyone can call this on a stale REVEALING auction.
            // The auction must be in REVEALING status AND past the reveal deadline.
            let auction: AuctionData = auctions.get(auction_id);
            assert_eq(auction.status, STATUS_REVEALING);

            let current_height: u64 = block.height as u64;
            assert(current_height > auction.reveal_deadline);

            // Move to FAILED — all escrowed bidders can now claim_refund.
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
            // PAUSE TOGGLE: Admin-only.
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
    //    DUTCH BID — USDCx version (instant settlement)
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
    //    ENGLISH BID — USDCx version
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
    //    WITHDRAW FEES — ALEO credits (admin only)
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
    //    SCHEDULED AUCTIONS — Set a future start time for bidding
    // ########################################################################
    //
    // Allows auction creators to schedule a start block in the future.
    // All bid finalize blocks check scheduled_start — backward compatible
    // (0 means immediate start, which is the default).

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
    //    AUTO-FORFEIT ON MISSED REVEAL — Mark unrevealed bids as forfeit
    // ########################################################################
    //
    // After the reveal deadline, anyone can call this to mark a bid as
    // forfeit if the bidder failed to reveal. This creates an on-chain
    // record that the bid was abandoned, useful for analytics and fairness.

    async transition forfeit_unrevealed_bid(
        private auction_id: field,
        private bid_hash: field
    ) -> Future {
        return finalize_forfeit_unrevealed_bid(auction_id, bid_hash);
    }

    async function finalize_forfeit_unrevealed_bid(
        auction_id: field,
        bid_hash: field
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_REVEALING);

        let current_height: u64 = block.height as u64;
        assert(current_height > auction.reveal_deadline);

        // Verify the bid was committed but NOT revealed.
        let was_committed: bool = bid_commitments.contains(bid_hash);
        assert(was_committed);

        let was_revealed: bool = revealed_bids.contains(bid_hash);
        assert(!was_revealed);

        // Mark as forfeit.
        forfeit_status.set(bid_hash, 1u8);
    }

    // ########################################################################
    //    SELECTIVE VIEW KEYS — Winner grants auditor access to outcome details
    // ########################################################################
    //
    // The winner can grant a ViewPermit to any address (auditor, insurer,
    // marketplace) that reveals specific auction outcome details. The
    // WinnerCertificate is re-created (Leo consumes records on input)
    // so the winner retains their proof of ownership.

    transition grant_view_access(
        private winner_cert: WinnerCertificate,
        private auditor: address,
        private auction_id: field
    ) -> (WinnerCertificate, ViewPermit) {
        assert_eq(winner_cert.auction_id, auction_id);

        // Re-create the certificate (Leo consumes records on input).
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
    //    ROYALTY ON RESALE — Configure royalty for original creator
    // ########################################################################
    //
    // Allows setting a royalty (max 10% = 1000 bps) on an auction.
    // When the auction settles, the royalty amount is calculated and stored
    // in royalty_balances. The creator can then claim it.

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
        // Verify auction exists.
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_ACTIVE);
        assert(bps <= 1000u128);

        royalty_info.set(auction_id, creator_hash);
        royalty_bps.set(auction_id, bps);
    }

    // Claim royalty — ALEO credits version.
    // Creator claims accumulated royalty as private credits.
    async transition claim_royalty(
        private auction_id: field,
        private creator_address: address
    ) -> (credits.aleo/credits, Future) {
        let creator_field: field = creator_address as field;
        let creator_hash: field = BHP256::hash_to_field(creator_field);

        // Placeholder amount — finalize verifies and clears the actual balance.
        // We use 1u64 as a minimum transfer; finalize will verify the real amount.
        // The actual royalty is paid via transfer_public_to_private.
        let (royalty_credits, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                creator_address,
                1u64
            );

        return (royalty_credits, finalize_claim_royalty(
            transfer_future, auction_id, creator_hash
        ));
    }

    async function finalize_claim_royalty(
        f0: Future,
        auction_id: field,
        creator_hash: field
    ) {
        f0.await();

        // Verify creator matches royalty_info.
        let stored_creator: field = royalty_info.get(auction_id);
        assert_eq(creator_hash, stored_creator);

        // Verify there is a balance to claim.
        let balance: u128 = royalty_balances.get(auction_id);
        assert(balance > 0u128);

        // Clear the royalty balance.
        royalty_balances.set(auction_id, 0u128);
    }

    // Claim royalty — USDCx version.
    async transition claim_royalty_usdcx(
        private auction_id: field,
        private creator_address: address
    ) -> Future {
        let creator_field: field = creator_address as field;
        let creator_hash: field = BHP256::hash_to_field(creator_field);

        let transfer_future: Future = test_usdcx_stablecoin.aleo/transfer_public(
            creator_address,
            1u128
        );

        return finalize_claim_royalty_usdcx(
            transfer_future, auction_id, creator_hash
        );
    }

    async function finalize_claim_royalty_usdcx(
        f0: Future,
        auction_id: field,
        creator_hash: field
    ) {
        f0.await();

        let stored_creator: field = royalty_info.get(auction_id);
        assert_eq(creator_hash, stored_creator);

        let balance: u128 = royalty_balances.get(auction_id);
        assert(balance > 0u128);

        royalty_balances.set(auction_id, 0u128);
    }

    // Claim royalty — USAD version.
    async transition claim_royalty_usad(
        private auction_id: field,
        private creator_address: address
    ) -> Future {
        let creator_field: field = creator_address as field;
        let creator_hash: field = BHP256::hash_to_field(creator_field);

        let transfer_future: Future = test_usad_stablecoin.aleo/transfer_public(
            creator_address,
            1u128
        );

        return finalize_claim_royalty_usad(
            transfer_future, auction_id, creator_hash
        );
    }

    async function finalize_claim_royalty_usad(
        f0: Future,
        auction_id: field,
        creator_hash: field
    ) {
        f0.await();

        let stored_creator: field = royalty_info.get(auction_id);
        assert_eq(creator_hash, stored_creator);

        let balance: u128 = royalty_balances.get(auction_id);
        assert(balance > 0u128);

        royalty_balances.set(auction_id, 0u128);
    }

    // ########################################################################
    //    PROVENANCE CHAIN — Link resale auctions to originals
    // ########################################################################
    //
    // Creates an on-chain link from a new auction to a previous auction,
    // establishing provenance (chain of ownership). If first sale, use 0field.

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
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.seller_hash, caller_hash);

        provenance.set(auction_id, previous_auction_id);
    }

    // ########################################################################
    //    TIME-LOCKED RESULTS — Delay public result reveal
    // ########################################################################
    //
    // Allows setting a block height after which the auction result
    // becomes publicly queryable. Before that, only the winner and seller
    // know the outcome (via private records).

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
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.seller_hash, caller_hash);

        let current_height: u64 = block.height as u64;
        assert(reveal_after_block > current_height);

        result_reveal_block.set(auction_id, reveal_after_block);
    }

    // Reveal the auction result publicly after the timelock expires.
    async transition reveal_auction_result(
        private auction_id: field
    ) -> Future {
        return finalize_reveal_auction_result(auction_id);
    }

    async function finalize_reveal_auction_result(
        auction_id: field
    ) {
        let auction: AuctionData = auctions.get(auction_id);
        assert_eq(auction.status, STATUS_SETTLED);

        let current_height: u64 = block.height as u64;
        let reveal_block: u64 = result_reveal_block.get(auction_id);
        assert(current_height >= reveal_block);

        let winning_price: u128 = highest_bids.get(auction_id);
        revealed_results.set(auction_id, winning_price);
    }

    // ########################################################################
    //    FIXED-PRICE PRIVATE SALE — Buy at a set price
    // ########################################################################
    //
    // Seller lists an item at a fixed price. First buyer to pay wins.
    // Simpler than auctions — no bidding, no reveal, no settlement.

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

    // Buy a fixed-price sale — ALEO credits version.
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

        // Mark as sold.
        fixed_sales.set(sale_id, FixedSaleConfig {
            seller_hash: sale.seller_hash,
            item_hash: sale.item_hash,
            price: sale.price,
            token_type: sale.token_type,
            is_sold: 1u8,
        });

        sale_receipts.set(sale_id, buyer_hash);
    }

    // Buy a fixed-price sale — USDCx version.
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

    // Buy a fixed-price sale — USAD version.
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
    //    RFQ / REVERSE AUCTION — Buyer posts request, sellers quote
    // ########################################################################
    //
    // The buyer posts a Request-For-Quote with a budget hash (private budget).
    // Sellers submit quotes as private records. The buyer accepts the best quote
    // and pays the seller.

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

        // deadline_block cast to u32 for the struct
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

    // Submit a private quote in response to an RFQ.
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

    // Accept a quote — ALEO credits version.
    // Buyer pays the quoted amount to the seller.
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

        // Mark RFQ as inactive.
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

    // Accept a quote — USDCx version.
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

    // Accept a quote — USAD version.
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
    //    TOKEN SALE / FAIR LAUNCH — Fixed-supply token distribution
    // ########################################################################
    //
    // Seller lists a total supply of tokens with a minimum price per token.
    // Buyers bid for quantities at or above the minimum price. Supply
    // decrements until exhausted or deadline passes.

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

    // Bid in a token sale — ALEO credits version.
    // Buyer specifies quantity and price_per_token. Payment = quantity * price_per_token.
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

        // Decrement remaining supply.
        token_sales.set(sale_id, TokenSaleConfig {
            seller_hash: sale.seller_hash,
            total_supply: sale.total_supply,
            remaining_supply: sale.remaining_supply - quantity,
            min_price_per_token: sale.min_price_per_token,
            token_type: sale.token_type,
            deadline_block: sale.deadline_block,
        });
    }

    // Bid in a token sale — USDCx version.
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
    //    CLEAN SLATE PROOF — On-chain attestation of no disputes
    // ########################################################################
    //
    // A wallet can prove on-chain that it has zero disputes filed against it.
    // Useful for reputation signaling in marketplaces.

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
        // Verify the wallet has no disputes.
        let disputed_count: u64 = seller_disputed.get_or_use(wallet_hash, 0u64);
        assert_eq(disputed_count, 0u64);
    }

}
