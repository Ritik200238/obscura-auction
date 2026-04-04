import credits.aleo;
import merkle_tree.aleo;
import test_usdcx_multisig_core.aleo;
import test_usdcx_freezelist.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_multisig_core.aleo;
import test_usad_freezelist.aleo;
import test_usad_stablecoin.aleo;
program obscura_market_v2.aleo;

record MarketReceipt:
    owner as address.private;
    listing_id as field.private;
    item_hash as field.private;
    purchase_amount as u128.private;
    token_type as u8.private;

record QuoteRecord:
    owner as address.private;
    rfq_id as field.private;
    quote_amount as u128.private;
    quote_hash as field.private;
    token_type as u8.private;

record WinnerCertificate:
    owner as address.private;
    auction_id as field.private;
    item_hash as field.private;
    winning_amount as u128.private;
    token_type as u8.private;
    certificate_id as field.private;

struct FixedSaleConfig:
    seller_hash as field;
    item_hash as field;
    price as u128;
    token_type as u8;
    status as u8;

struct RFQConfig:
    buyer_hash as field;
    category as u8;
    description_hash as field;
    max_budget_hash as field;
    deadline as u64;
    token_type as u8;
    status as u8;

struct TokenSaleConfig:
    seller_hash as field;
    item_hash as field;
    total_supply as u128;
    remaining_supply as u128;
    min_price_per_unit as u128;
    token_type as u8;
    deadline as u64;

struct ListingSeed:
    creator as address;
    item_hash as field;
    nonce as field;

struct RoyaltyInfo:
    creator_hash as field;
    bps as u128;

mapping fixed_sales:
    key as field.public;
    value as FixedSaleConfig.public;

mapping rfq_configs:
    key as field.public;
    value as RFQConfig.public;

mapping rfq_quote_count:
    key as field.public;
    value as u64.public;

mapping token_sales:
    key as field.public;
    value as TokenSaleConfig.public;

mapping provenance:
    key as field.public;
    value as field.public;

mapping royalty_info:
    key as field.public;
    value as RoyaltyInfo.public;

mapping market_treasury:
    key as u8.public;
    value as u128.public;

mapping market_balance:
    key as u8.public;
    value as u128.public;

mapping sale_escrow:
    key as field.public;
    value as u128.public;

mapping market_config:
    key as u8.public;
    value as field.public;

function create_fixed_sale:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u8.private;
    input r3 as field.private;
    gt r1 0u128 into r4;
    assert.eq r4 true;
    is.eq r2 1u8 into r5;
    is.eq r2 2u8 into r6;
    or r5 r6 into r7;
    is.eq r2 3u8 into r8;
    or r7 r8 into r9;
    assert.eq r9 true;
    cast self.caller r0 r3 into r10 as ListingSeed;
    hash.bhp256 r10 into r11 as field;
    cast self.caller into r12 as field;
    hash.bhp256 r12 into r13 as field;
    async create_fixed_sale r11 r13 r0 r1 r2 into r14;
    output r11 as field.private;
    output r14 as obscura_market_v2.aleo/create_fixed_sale.future;

finalize create_fixed_sale:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u8.public;
    contains fixed_sales[r0] into r5;
    not r5 into r6;
    assert.eq r6 true;
    cast r1 r2 r3 r4 1u8 into r7 as FixedSaleConfig;
    set r7 into fixed_sales[r0];

function buy_fixed_sale:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as u128.private;
    input r3 as credits.aleo/credits.record;
    cast r2 into r4 as u64;
    call credits.aleo/transfer_private_to_public r3 obscura_market_v2.aleo r4 into r5 r6;
    cast self.caller r0 r1 r2 1u8 into r7 as MarketReceipt.record;
    async buy_fixed_sale r6 r0 r2 into r8;
    output r7 as MarketReceipt.record;
    output r5 as credits.aleo/credits.record;
    output r8 as obscura_market_v2.aleo/buy_fixed_sale.future;

finalize buy_fixed_sale:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u128.public;
    await r0;
    get fixed_sales[r1] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.token_type 1u8;
    gte r2 r3.price into r4;
    assert.eq r4 true;
    mul r2 100u128 into r5;
    div r5 10000u128 into r6;
    get.or_use market_treasury[0u8] 0u128 into r7;
    add r7 r6 into r8;
    set r8 into market_treasury[0u8];
    get.or_use market_balance[0u8] 0u128 into r9;
    add r9 r2 into r10;
    set r10 into market_balance[0u8];
    sub r2 r6 into r11;
    set r11 into sale_escrow[r1];
    cast r3.seller_hash r3.item_hash r3.price r3.token_type 2u8 into r12 as FixedSaleConfig;
    set r12 into fixed_sales[r1];

function buy_fixed_sale_usdcx:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as u128.private;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer obscura_market_v2.aleo r2 into r3;
    cast self.caller r0 r1 r2 2u8 into r4 as MarketReceipt.record;
    async buy_fixed_sale_usdcx r3 r0 r2 into r5;
    output r4 as MarketReceipt.record;
    output r5 as obscura_market_v2.aleo/buy_fixed_sale_usdcx.future;

finalize buy_fixed_sale_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as u128.public;
    await r0;
    get fixed_sales[r1] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.token_type 2u8;
    gte r2 r3.price into r4;
    assert.eq r4 true;
    mul r2 100u128 into r5;
    div r5 10000u128 into r6;
    get.or_use market_treasury[1u8] 0u128 into r7;
    add r7 r6 into r8;
    set r8 into market_treasury[1u8];
    get.or_use market_balance[1u8] 0u128 into r9;
    add r9 r2 into r10;
    set r10 into market_balance[1u8];
    sub r2 r6 into r11;
    set r11 into sale_escrow[r1];
    cast r3.seller_hash r3.item_hash r3.price r3.token_type 2u8 into r12 as FixedSaleConfig;
    set r12 into fixed_sales[r1];

function buy_fixed_sale_usad:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as u128.private;
    call test_usad_stablecoin.aleo/transfer_public_as_signer obscura_market_v2.aleo r2 into r3;
    cast self.caller r0 r1 r2 3u8 into r4 as MarketReceipt.record;
    async buy_fixed_sale_usad r3 r0 r2 into r5;
    output r4 as MarketReceipt.record;
    output r5 as obscura_market_v2.aleo/buy_fixed_sale_usad.future;

finalize buy_fixed_sale_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as u128.public;
    await r0;
    get fixed_sales[r1] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.token_type 3u8;
    gte r2 r3.price into r4;
    assert.eq r4 true;
    mul r2 100u128 into r5;
    div r5 10000u128 into r6;
    get.or_use market_treasury[2u8] 0u128 into r7;
    add r7 r6 into r8;
    set r8 into market_treasury[2u8];
    get.or_use market_balance[2u8] 0u128 into r9;
    add r9 r2 into r10;
    set r10 into market_balance[2u8];
    sub r2 r6 into r11;
    set r11 into sale_escrow[r1];
    cast r3.seller_hash r3.item_hash r3.price r3.token_type 2u8 into r12 as FixedSaleConfig;
    set r12 into fixed_sales[r1];

function delist_item:
    input r0 as field.private;
    cast self.caller into r1 as field;
    hash.bhp256 r1 into r2 as field;
    async delist_item r0 r2 into r3;
    output r3 as obscura_market_v2.aleo/delist_item.future;

finalize delist_item:
    input r0 as field.public;
    input r1 as field.public;
    get fixed_sales[r0] into r2;
    assert.eq r2.seller_hash r1;
    assert.eq r2.status 1u8;
    cast r2.seller_hash r2.item_hash r2.price r2.token_type 3u8 into r3 as FixedSaleConfig;
    set r3 into fixed_sales[r0];

function create_rfq:
    input r0 as u8.private;
    input r1 as field.private;
    input r2 as u128.private;
    input r3 as u8.private;
    input r4 as field.private;
    input r5 as u64.public;
    gt r2 0u128 into r6;
    assert.eq r6 true;
    is.eq r3 1u8 into r7;
    is.eq r3 2u8 into r8;
    or r7 r8 into r9;
    is.eq r3 3u8 into r10;
    or r9 r10 into r11;
    assert.eq r11 true;
    cast self.caller r1 r4 into r12 as ListingSeed;
    hash.bhp256 r12 into r13 as field;
    cast self.caller into r14 as field;
    hash.bhp256 r14 into r15 as field;
    cast r2 into r16 as field;
    hash.bhp256 r16 into r17 as field;
    async create_rfq r13 r5 r15 r0 r1 r17 r3 into r18;
    output r13 as field.private;
    output r18 as obscura_market_v2.aleo/create_rfq.future;

finalize create_rfq:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as u8.public;
    input r4 as field.public;
    input r5 as field.public;
    input r6 as u8.public;
    contains rfq_configs[r0] into r7;
    not r7 into r8;
    assert.eq r8 true;
    cast block.height into r9 as u64;
    gt r1 r9 into r10;
    assert.eq r10 true;
    cast r2 r3 r4 r5 r1 r6 1u8 into r11 as RFQConfig;
    set r11 into rfq_configs[r0];

function submit_quote:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    cast r1 into r3 as field;
    hash.bhp256 r3 into r4 as field;
    cast self.caller into r5 as field;
    cast self.caller r0 r1 r4 0u8 into r6 as QuoteRecord.record;
    async submit_quote r0 into r7;
    output r6 as QuoteRecord.record;
    output r7 as obscura_market_v2.aleo/submit_quote.future;

finalize submit_quote:
    input r0 as field.public;
    get rfq_configs[r0] into r1;
    assert.eq r1.status 1u8;
    cast block.height into r2 as u64;
    lte r2 r1.deadline into r3;
    assert.eq r3 true;
    get.or_use rfq_quote_count[r0] 0u64 into r4;
    add r4 1u64 into r5;
    set r5 into rfq_quote_count[r0];

function accept_quote:
    input r0 as field.private;
    input r1 as QuoteRecord.record;
    input r2 as address.private;
    input r3 as credits.aleo/credits.record;
    cast r1.quote_amount into r4 as u64;
    call credits.aleo/transfer_private_to_public r3 r2 r4 into r5 r6;
    cast self.caller r0 r1.quote_hash r1.quote_amount 1u8 into r7 as MarketReceipt.record;
    cast self.caller into r8 as field;
    hash.bhp256 r8 into r9 as field;
    async accept_quote r6 r0 r9 into r10;
    output r7 as MarketReceipt.record;
    output r5 as credits.aleo/credits.record;
    output r10 as obscura_market_v2.aleo/accept_quote.future;

finalize accept_quote:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as field.public;
    await r0;
    get rfq_configs[r1] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.buyer_hash r2;
    cast r3.buyer_hash r3.category r3.description_hash r3.max_budget_hash r3.deadline r3.token_type 2u8 into r4 as RFQConfig;
    set r4 into rfq_configs[r1];

function accept_quote_usdcx:
    input r0 as field.private;
    input r1 as QuoteRecord.record;
    input r2 as address.private;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer r2 r1.quote_amount into r3;
    cast self.caller r0 r1.quote_hash r1.quote_amount 2u8 into r4 as MarketReceipt.record;
    cast self.caller into r5 as field;
    hash.bhp256 r5 into r6 as field;
    async accept_quote_usdcx r3 r0 r6 into r7;
    output r4 as MarketReceipt.record;
    output r7 as obscura_market_v2.aleo/accept_quote_usdcx.future;

finalize accept_quote_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as field.public;
    await r0;
    get rfq_configs[r1] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.buyer_hash r2;
    cast r3.buyer_hash r3.category r3.description_hash r3.max_budget_hash r3.deadline r3.token_type 2u8 into r4 as RFQConfig;
    set r4 into rfq_configs[r1];

function create_token_sale:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u8.private;
    input r4 as field.private;
    input r5 as u64.public;
    gt r1 0u128 into r6;
    assert.eq r6 true;
    gt r2 0u128 into r7;
    assert.eq r7 true;
    cast self.caller r0 r4 into r8 as ListingSeed;
    hash.bhp256 r8 into r9 as field;
    cast self.caller into r10 as field;
    hash.bhp256 r10 into r11 as field;
    async create_token_sale r9 r5 r11 r0 r1 r2 r3 into r12;
    output r9 as field.private;
    output r12 as obscura_market_v2.aleo/create_token_sale.future;

finalize create_token_sale:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u8.public;
    contains token_sales[r0] into r7;
    not r7 into r8;
    assert.eq r8 true;
    cast block.height into r9 as u64;
    gt r1 r9 into r10;
    assert.eq r10 true;
    cast r2 r3 r4 r4 r5 r6 r1 into r11 as TokenSaleConfig;
    set r11 into token_sales[r0];

function bid_token_sale:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as credits.aleo/credits.record;
    mul r1 r2 into r4;
    cast r4 into r5 as u64;
    call credits.aleo/transfer_private_to_public r3 obscura_market_v2.aleo r5 into r6 r7;
    cast self.caller r0 0field r4 1u8 into r8 as MarketReceipt.record;
    async bid_token_sale r7 r0 r2 r1 r4 into r9;
    output r8 as MarketReceipt.record;
    output r6 as credits.aleo/credits.record;
    output r9 as obscura_market_v2.aleo/bid_token_sale.future;

finalize bid_token_sale:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    await r0;
    get token_sales[r1] into r5;
    assert.eq r5.token_type 1u8;
    cast block.height into r6 as u64;
    lte r6 r5.deadline into r7;
    assert.eq r7 true;
    gte r2 r5.min_price_per_unit into r8;
    assert.eq r8 true;
    lte r3 r5.remaining_supply into r9;
    assert.eq r9 true;
    sub r5.remaining_supply r3 into r10;
    cast r5.seller_hash r5.item_hash r5.total_supply r10 r5.min_price_per_unit r5.token_type r5.deadline into r11 as TokenSaleConfig;
    set r11 into token_sales[r1];
    get.or_use market_balance[0u8] 0u128 into r12;
    add r12 r4 into r13;
    set r13 into market_balance[0u8];
    get.or_use sale_escrow[r1] 0u128 into r14;
    add r14 r4 into r15;
    set r15 into sale_escrow[r1];

function bid_token_sale_usdcx:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u128.private;
    mul r1 r2 into r3;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer obscura_market_v2.aleo r3 into r4;
    cast self.caller r0 0field r3 2u8 into r5 as MarketReceipt.record;
    async bid_token_sale_usdcx r4 r0 r2 r1 r3 into r6;
    output r5 as MarketReceipt.record;
    output r6 as obscura_market_v2.aleo/bid_token_sale_usdcx.future;

finalize bid_token_sale_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    await r0;
    get token_sales[r1] into r5;
    assert.eq r5.token_type 2u8;
    cast block.height into r6 as u64;
    lte r6 r5.deadline into r7;
    assert.eq r7 true;
    gte r2 r5.min_price_per_unit into r8;
    assert.eq r8 true;
    lte r3 r5.remaining_supply into r9;
    assert.eq r9 true;
    sub r5.remaining_supply r3 into r10;
    cast r5.seller_hash r5.item_hash r5.total_supply r10 r5.min_price_per_unit r5.token_type r5.deadline into r11 as TokenSaleConfig;
    set r11 into token_sales[r1];
    get.or_use market_balance[1u8] 0u128 into r12;
    add r12 r4 into r13;
    set r13 into market_balance[1u8];
    get.or_use sale_escrow[r1] 0u128 into r14;
    add r14 r4 into r15;
    set r15 into sale_escrow[r1];

function set_provenance:
    input r0 as field.private;
    input r1 as field.private;
    cast self.caller into r2 as field;
    async set_provenance r0 r1 into r3;
    output r3 as obscura_market_v2.aleo/set_provenance.future;

finalize set_provenance:
    input r0 as field.public;
    input r1 as field.public;
    contains provenance[r0] into r2;
    not r2 into r3;
    assert.eq r3 true;
    set r1 into provenance[r0];

function set_royalty:
    input r0 as field.private;
    input r1 as u128.private;
    lte r1 1000u128 into r2;
    assert.eq r2 true;
    cast self.caller into r3 as field;
    hash.bhp256 r3 into r4 as field;
    async set_royalty r0 r4 r1 into r5;
    output r5 as obscura_market_v2.aleo/set_royalty.future;

finalize set_royalty:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u128.public;
    contains royalty_info[r0] into r3;
    not r3 into r4;
    assert.eq r4 true;
    cast r1 r2 into r5 as RoyaltyInfo;
    set r5 into royalty_info[r0];

function prove_won_auction:
    input r0 as WinnerCertificate.record;
    input r1 as field.public;
    assert.eq r0.auction_id r1;
    cast r0.owner r0.auction_id r0.item_hash r0.winning_amount r0.token_type r0.certificate_id into r2 as WinnerCertificate.record;
    output r2 as WinnerCertificate.record;
    output true as boolean.private;

constructor:
    assert.eq edition 0u16;
