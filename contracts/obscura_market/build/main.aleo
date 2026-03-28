import credits.aleo;
import merkle_tree.aleo;
import test_usdcx_multisig_core.aleo;
import test_usdcx_freezelist.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_multisig_core.aleo;
import test_usad_freezelist.aleo;
import test_usad_stablecoin.aleo;
program obscura_market_v1.aleo;

record QuoteRecord:
    owner as address.private;
    rfq_id as field.private;
    quote_amount as u128.private;
    quote_hash as field.private;
    seller_hash as field.private;
    token_type as u8.private;

record CleanSlateProof:
    owner as address.private;
    wallet_hash as field.private;
    proof_block as u64.private;
    auction_count as u64.private;

record EscrowReceipt:
    owner as address.private;
    auction_id as field.private;
    escrowed_amount as u128.private;
    bid_nonce as field.private;
    token_type as u8.private;

record RoyaltyReceipt:
    owner as address.private;
    auction_id as field.private;
    amount as u128.private;
    token_type as u8.private;

struct AuctionSeed:
    creator as address;
    item_hash as field;
    deadline as u64;
    nonce as field;

struct BidCommitment:
    bidder as address;
    auction_id as field;
    amount as u128;
    nonce as field;

struct RFQConfig:
    buyer_hash as field;
    category as u8;
    max_budget_hash as field;
    description_hash as field;
    deadline_block as u32;
    token_type as u8;
    is_active as u8;

struct FixedSaleConfig:
    seller_hash as field;
    item_hash as field;
    price as u128;
    token_type as u8;
    is_sold as u8;

struct TokenSaleConfig:
    seller_hash as field;
    total_supply as u128;
    remaining_supply as u128;
    min_price_per_token as u128;
    token_type as u8;
    deadline_block as u32;

struct RoyaltyRegistration:
    creator_hash as field;
    amount as u128;
    token_type as u8;
    claimed as u8;

mapping fixed_sales:
    key as field.public;
    value as FixedSaleConfig.public;

mapping sale_receipts:
    key as field.public;
    value as field.public;

mapping rfq_configs:
    key as field.public;
    value as RFQConfig.public;

mapping rfq_quote_count:
    key as field.public;
    value as u64.public;

mapping token_sales:
    key as field.public;
    value as TokenSaleConfig.public;

mapping royalty_balances:
    key as field.public;
    value as RoyaltyRegistration.public;

mapping provenance:
    key as field.public;
    value as field.public;

mapping result_reveal_block:
    key as field.public;
    value as u64.public;

mapping revealed_results:
    key as field.public;
    value as u128.public;

mapping forfeit_status:
    key as field.public;
    value as u8.public;

mapping reveal_deadlines_custom:
    key as field.public;
    value as u64.public;

mapping seller_disputed:
    key as field.public;
    value as u64.public;

mapping market_admin:
    key as u8.public;
    value as field.public;

function create_fixed_sale:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u8.private;
    input r3 as field.private;
    gte r1 1000u128 into r4;
    assert.eq r4 true;
    is.eq r2 1u8 into r5;
    is.eq r2 2u8 into r6;
    or r5 r6 into r7;
    is.eq r2 3u8 into r8;
    or r7 r8 into r9;
    assert.eq r9 true;
    cast self.caller into r10 as field;
    hash.bhp256 r10 into r11 as field;
    cast self.caller r0 0u64 r3 into r12 as AuctionSeed;
    hash.bhp256 r12 into r13 as field;
    async create_fixed_sale r13 r11 r0 r1 r2 into r14;
    output r13 as field.private;
    output r14 as obscura_market_v1.aleo/create_fixed_sale.future;

finalize create_fixed_sale:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u8.public;
    contains fixed_sales[r0] into r5;
    not r5 into r6;
    assert.eq r6 true;
    cast r1 r2 r3 r4 0u8 into r7 as FixedSaleConfig;
    set r7 into fixed_sales[r0];

function buy_fixed_sale:
    input r0 as field.private;
    input r1 as credits.aleo/credits.record;
    input r2 as u128.private;
    cast r2 into r3 as u64;
    call credits.aleo/transfer_private_to_public r1 obscura_market_v1.aleo r3 into r4 r5;
    cast self.caller into r6 as field;
    hash.bhp256 r6 into r7 as field;
    async buy_fixed_sale r5 r0 r7 r2 into r8;
    output r4 as credits.aleo/credits.record;
    output r8 as obscura_market_v1.aleo/buy_fixed_sale.future;

finalize buy_fixed_sale:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    await r0;
    get fixed_sales[r1] into r4;
    assert.eq r4.is_sold 0u8;
    assert.eq r4.token_type 1u8;
    gte r3 r4.price into r5;
    assert.eq r5 true;
    cast r4.seller_hash r4.item_hash r4.price r4.token_type 1u8 into r6 as FixedSaleConfig;
    set r6 into fixed_sales[r1];
    set r2 into sale_receipts[r1];

function buy_fixed_sale_usdcx:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as u128.private;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer obscura_market_v1.aleo r2 into r3;
    cast self.caller into r4 as field;
    hash.bhp256 r4 into r5 as field;
    async buy_fixed_sale_usdcx r3 r0 r5 r2 into r6;
    output r6 as obscura_market_v1.aleo/buy_fixed_sale_usdcx.future;

finalize buy_fixed_sale_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    await r0;
    get fixed_sales[r1] into r4;
    assert.eq r4.is_sold 0u8;
    assert.eq r4.token_type 2u8;
    gte r3 r4.price into r5;
    assert.eq r5 true;
    cast r4.seller_hash r4.item_hash r4.price r4.token_type 1u8 into r6 as FixedSaleConfig;
    set r6 into fixed_sales[r1];
    set r2 into sale_receipts[r1];

function buy_fixed_sale_usad:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as u128.private;
    call test_usad_stablecoin.aleo/transfer_public_as_signer obscura_market_v1.aleo r2 into r3;
    cast self.caller into r4 as field;
    hash.bhp256 r4 into r5 as field;
    async buy_fixed_sale_usad r3 r0 r5 r2 into r6;
    output r6 as obscura_market_v1.aleo/buy_fixed_sale_usad.future;

finalize buy_fixed_sale_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    await r0;
    get fixed_sales[r1] into r4;
    assert.eq r4.is_sold 0u8;
    assert.eq r4.token_type 3u8;
    gte r3 r4.price into r5;
    assert.eq r5 true;
    cast r4.seller_hash r4.item_hash r4.price r4.token_type 1u8 into r6 as FixedSaleConfig;
    set r6 into fixed_sales[r1];
    set r2 into sale_receipts[r1];

function create_rfq:
    input r0 as u8.private;
    input r1 as field.private;
    input r2 as u128.private;
    input r3 as u64.private;
    input r4 as u8.private;
    input r5 as field.private;
    is.eq r4 1u8 into r6;
    is.eq r4 2u8 into r7;
    or r6 r7 into r8;
    is.eq r4 3u8 into r9;
    or r8 r9 into r10;
    assert.eq r10 true;
    cast self.caller into r11 as field;
    hash.bhp256 r11 into r12 as field;
    cast r2 into r13 as field;
    hash.bhp256 r13 into r14 as field;
    cast self.caller r1 r3 r5 into r15 as AuctionSeed;
    hash.bhp256 r15 into r16 as field;
    cast r3 into r17 as u32;
    async create_rfq r16 r12 r0 r14 r1 r17 r4 into r18;
    output r16 as field.private;
    output r18 as obscura_market_v1.aleo/create_rfq.future;

finalize create_rfq:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u8.public;
    input r3 as field.public;
    input r4 as field.public;
    input r5 as u32.public;
    input r6 as u8.public;
    contains rfq_configs[r0] into r7;
    not r7 into r8;
    assert.eq r8 true;
    cast r1 r2 r3 r4 r5 r6 1u8 into r9 as RFQConfig;
    set r9 into rfq_configs[r0];

function submit_quote:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    cast self.caller into r3 as field;
    hash.bhp256 r3 into r4 as field;
    cast self.caller r0 r1 r2 into r5 as BidCommitment;
    hash.bhp256 r5 into r6 as field;
    cast self.caller r0 r1 r6 r4 1u8 into r7 as QuoteRecord.record;
    async submit_quote r0 into r8;
    output r7 as QuoteRecord.record;
    output r8 as obscura_market_v1.aleo/submit_quote.future;

finalize submit_quote:
    input r0 as field.public;
    get rfq_configs[r0] into r1;
    assert.eq r1.is_active 1u8;
    get.or_use rfq_quote_count[r0] 0u64 into r2;
    add r2 1u64 into r3;
    set r3 into rfq_quote_count[r0];

function accept_quote:
    input r0 as field.private;
    input r1 as QuoteRecord.record;
    input r2 as credits.aleo/credits.record;
    cast r1.quote_amount into r3 as u64;
    call credits.aleo/transfer_private_to_public r2 obscura_market_v1.aleo r3 into r4 r5;
    async accept_quote r5 r0 r1.quote_amount into r6;
    output r4 as credits.aleo/credits.record;
    output r6 as obscura_market_v1.aleo/accept_quote.future;

finalize accept_quote:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u128.public;
    await r0;
    get rfq_configs[r1] into r3;
    assert.eq r3.is_active 1u8;
    cast r3.buyer_hash r3.category r3.max_budget_hash r3.description_hash r3.deadline_block r3.token_type 0u8 into r4 as RFQConfig;
    set r4 into rfq_configs[r1];

function accept_quote_usdcx:
    input r0 as field.private;
    input r1 as QuoteRecord.record;
    input r2 as u128.private;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer obscura_market_v1.aleo r2 into r3;
    async accept_quote_usdcx r3 r0 into r4;
    output r4 as obscura_market_v1.aleo/accept_quote_usdcx.future;

finalize accept_quote_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    await r0;
    get rfq_configs[r1] into r2;
    assert.eq r2.is_active 1u8;
    cast r2.buyer_hash r2.category r2.max_budget_hash r2.description_hash r2.deadline_block r2.token_type 0u8 into r3 as RFQConfig;
    set r3 into rfq_configs[r1];

function accept_quote_usad:
    input r0 as field.private;
    input r1 as QuoteRecord.record;
    input r2 as u128.private;
    call test_usad_stablecoin.aleo/transfer_public_as_signer obscura_market_v1.aleo r2 into r3;
    async accept_quote_usad r3 r0 into r4;
    output r4 as obscura_market_v1.aleo/accept_quote_usad.future;

finalize accept_quote_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    await r0;
    get rfq_configs[r1] into r2;
    assert.eq r2.is_active 1u8;
    cast r2.buyer_hash r2.category r2.max_budget_hash r2.description_hash r2.deadline_block r2.token_type 0u8 into r3 as RFQConfig;
    set r3 into rfq_configs[r1];

function create_token_sale:
    input r0 as u128.private;
    input r1 as u128.private;
    input r2 as u8.private;
    input r3 as u64.private;
    input r4 as field.private;
    gt r0 0u128 into r5;
    assert.eq r5 true;
    gte r1 1000u128 into r6;
    assert.eq r6 true;
    is.eq r2 1u8 into r7;
    is.eq r2 2u8 into r8;
    or r7 r8 into r9;
    is.eq r2 3u8 into r10;
    or r9 r10 into r11;
    assert.eq r11 true;
    cast self.caller into r12 as field;
    hash.bhp256 r12 into r13 as field;
    cast r0 into r14 as field;
    cast self.caller r14 r3 r4 into r15 as AuctionSeed;
    hash.bhp256 r15 into r16 as field;
    cast r3 into r17 as u32;
    async create_token_sale r16 r13 r0 r1 r2 r17 into r18;
    output r16 as field.private;
    output r18 as obscura_market_v1.aleo/create_token_sale.future;

finalize create_token_sale:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u8.public;
    input r5 as u32.public;
    contains token_sales[r0] into r6;
    not r6 into r7;
    assert.eq r7 true;
    cast r1 r2 r2 r3 r4 r5 into r8 as TokenSaleConfig;
    set r8 into token_sales[r0];

function bid_token_sale:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as field.private;
    input r4 as credits.aleo/credits.record;
    mul r1 r2 into r5;
    gte r5 1000u128 into r6;
    assert.eq r6 true;
    cast r5 into r7 as u64;
    call credits.aleo/transfer_private_to_public r4 obscura_market_v1.aleo r7 into r8 r9;
    cast self.caller r0 r5 r3 1u8 into r10 as EscrowReceipt.record;
    async bid_token_sale r9 r0 r1 r2 into r11;
    output r10 as EscrowReceipt.record;
    output r8 as credits.aleo/credits.record;
    output r11 as obscura_market_v1.aleo/bid_token_sale.future;

finalize bid_token_sale:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    await r0;
    get token_sales[r1] into r4;
    cast block.height into r5 as u32;
    lte r5 r4.deadline_block into r6;
    assert.eq r6 true;
    gte r3 r4.min_price_per_token into r7;
    assert.eq r7 true;
    lte r2 r4.remaining_supply into r8;
    assert.eq r8 true;
    sub r4.remaining_supply r2 into r9;
    cast r4.seller_hash r4.total_supply r9 r4.min_price_per_token r4.token_type r4.deadline_block into r10 as TokenSaleConfig;
    set r10 into token_sales[r1];

function bid_token_sale_usdcx:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as field.private;
    mul r1 r2 into r4;
    gte r4 1000u128 into r5;
    assert.eq r5 true;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer obscura_market_v1.aleo r4 into r6;
    cast self.caller r0 r4 r3 2u8 into r7 as EscrowReceipt.record;
    async bid_token_sale_usdcx r6 r0 r1 r2 into r8;
    output r7 as EscrowReceipt.record;
    output r8 as obscura_market_v1.aleo/bid_token_sale_usdcx.future;

finalize bid_token_sale_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    await r0;
    get token_sales[r1] into r4;
    cast block.height into r5 as u32;
    lte r5 r4.deadline_block into r6;
    assert.eq r6 true;
    gte r3 r4.min_price_per_token into r7;
    assert.eq r7 true;
    lte r2 r4.remaining_supply into r8;
    assert.eq r8 true;
    sub r4.remaining_supply r2 into r9;
    cast r4.seller_hash r4.total_supply r9 r4.min_price_per_token r4.token_type r4.deadline_block into r10 as TokenSaleConfig;
    set r10 into token_sales[r1];

function register_royalty:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as u128.private;
    input r3 as u8.private;
    gt r2 0u128 into r4;
    assert.eq r4 true;
    is.eq r3 1u8 into r5;
    is.eq r3 2u8 into r6;
    or r5 r6 into r7;
    is.eq r3 3u8 into r8;
    or r7 r8 into r9;
    assert.eq r9 true;
    cast r1 into r10 as field;
    hash.bhp256 r10 into r11 as field;
    async register_royalty r0 r11 r2 r3 into r12;
    output r12 as obscura_market_v1.aleo/register_royalty.future;

finalize register_royalty:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u8.public;
    contains royalty_balances[r0] into r4;
    not r4 into r5;
    assert.eq r5 true;
    cast r1 r2 r3 0u8 into r6 as RoyaltyRegistration;
    set r6 into royalty_balances[r0];

function claim_royalty:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as u128.private;
    cast r1 into r3 as field;
    hash.bhp256 r3 into r4 as field;
    cast r2 into r5 as u64;
    call credits.aleo/transfer_public_to_private r1 r5 into r6 r7;
    cast r1 r0 r2 1u8 into r8 as RoyaltyReceipt.record;
    async claim_royalty r7 r0 r4 r2 into r9;
    output r8 as RoyaltyReceipt.record;
    output r6 as credits.aleo/credits.record;
    output r9 as obscura_market_v1.aleo/claim_royalty.future;

finalize claim_royalty:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    await r0;
    get royalty_balances[r1] into r4;
    assert.eq r4.creator_hash r2;
    assert.eq r4.claimed 0u8;
    assert.eq r4.token_type 1u8;
    assert.eq r3 r4.amount;
    cast r4.creator_hash r4.amount r4.token_type 1u8 into r5 as RoyaltyRegistration;
    set r5 into royalty_balances[r1];

function claim_royalty_usdcx:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as u128.private;
    cast r1 into r3 as field;
    hash.bhp256 r3 into r4 as field;
    call test_usdcx_stablecoin.aleo/transfer_public r1 r2 into r5;
    cast r1 r0 r2 2u8 into r6 as RoyaltyReceipt.record;
    async claim_royalty_usdcx r5 r0 r4 r2 into r7;
    output r6 as RoyaltyReceipt.record;
    output r7 as obscura_market_v1.aleo/claim_royalty_usdcx.future;

finalize claim_royalty_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    await r0;
    get royalty_balances[r1] into r4;
    assert.eq r4.creator_hash r2;
    assert.eq r4.claimed 0u8;
    assert.eq r4.token_type 2u8;
    assert.eq r3 r4.amount;
    cast r4.creator_hash r4.amount r4.token_type 1u8 into r5 as RoyaltyRegistration;
    set r5 into royalty_balances[r1];

function claim_royalty_usad:
    input r0 as field.private;
    input r1 as address.private;
    input r2 as u128.private;
    cast r1 into r3 as field;
    hash.bhp256 r3 into r4 as field;
    call test_usad_stablecoin.aleo/transfer_public r1 r2 into r5;
    cast r1 r0 r2 3u8 into r6 as RoyaltyReceipt.record;
    async claim_royalty_usad r5 r0 r4 r2 into r7;
    output r6 as RoyaltyReceipt.record;
    output r7 as obscura_market_v1.aleo/claim_royalty_usad.future;

finalize claim_royalty_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    await r0;
    get royalty_balances[r1] into r4;
    assert.eq r4.creator_hash r2;
    assert.eq r4.claimed 0u8;
    assert.eq r4.token_type 3u8;
    assert.eq r3 r4.amount;
    cast r4.creator_hash r4.amount r4.token_type 1u8 into r5 as RoyaltyRegistration;
    set r5 into royalty_balances[r1];

function set_provenance:
    input r0 as field.private;
    input r1 as field.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    async set_provenance r0 r1 r3 into r4;
    output r4 as obscura_market_v1.aleo/set_provenance.future;

finalize set_provenance:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    contains provenance[r0] into r3;
    not r3 into r4;
    assert.eq r4 true;
    set r1 into provenance[r0];

function set_result_timelock:
    input r0 as field.private;
    input r1 as u64.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    async set_result_timelock r0 r1 r3 into r4;
    output r4 as obscura_market_v1.aleo/set_result_timelock.future;

finalize set_result_timelock:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    cast block.height into r3 as u64;
    gt r1 r3 into r4;
    assert.eq r4 true;
    contains result_reveal_block[r0] into r5;
    not r5 into r6;
    assert.eq r6 true;
    set r1 into result_reveal_block[r0];

function reveal_auction_result:
    input r0 as field.private;
    input r1 as u128.private;
    async reveal_auction_result r0 r1 into r2;
    output r2 as obscura_market_v1.aleo/reveal_auction_result.future;

finalize reveal_auction_result:
    input r0 as field.public;
    input r1 as u128.public;
    cast block.height into r2 as u64;
    get result_reveal_block[r0] into r3;
    gte r2 r3 into r4;
    assert.eq r4 true;
    contains revealed_results[r0] into r5;
    not r5 into r6;
    assert.eq r6 true;
    set r1 into revealed_results[r0];

function forfeit_unrevealed_bid:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as u64.private;
    async forfeit_unrevealed_bid r0 r1 r2 into r3;
    output r3 as obscura_market_v1.aleo/forfeit_unrevealed_bid.future;

finalize forfeit_unrevealed_bid:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u64.public;
    cast block.height into r3 as u64;
    gt r3 r2 into r4;
    assert.eq r4 true;
    contains forfeit_status[r1] into r5;
    not r5 into r6;
    assert.eq r6 true;
    set 1u8 into forfeit_status[r1];

function prove_clean_slate:
    input r0 as address.private;
    cast r0 into r1 as field;
    hash.bhp256 r1 into r2 as field;
    cast self.caller r2 0u64 0u64 into r3 as CleanSlateProof.record;
    async prove_clean_slate r2 into r4;
    output r3 as CleanSlateProof.record;
    output r4 as obscura_market_v1.aleo/prove_clean_slate.future;

finalize prove_clean_slate:
    input r0 as field.public;
    get.or_use seller_disputed[r0] 0u64 into r1;
    assert.eq r1 0u64;

constructor:
    assert.eq edition 0u16;
