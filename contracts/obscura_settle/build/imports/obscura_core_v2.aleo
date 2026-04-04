program obscura_core_v2.aleo;

record SealedBid:
    owner as address.private;
    auction_id as field.private;
    bid_amount as u128.private;
    bid_nonce as field.private;
    token_type as u8.private;

record BundleBid:
    owner as address.private;
    auction_id as field.private;
    bid_amount as u128.private;
    bid_nonce as field.private;
    token_type as u8.private;

record MultiUnitBid:
    owner as address.private;
    auction_id as field.private;
    quantity as u128.private;
    price_per_unit as u128.private;
    bid_nonce as field.private;
    token_type as u8.private;

record SubsetBid:
    owner as address.private;
    auction_id as field.private;
    item_mask as u8.private;
    bid_amount as u128.private;
    bid_nonce as field.private;
    token_type as u8.private;

struct AuctionData:
    item_hash as field;
    seller_hash as field;
    category as u8;
    token_type as u8;
    auction_mode as u8;
    status as u8;
    deadline as u64;
    reveal_deadline as u64;
    bid_count as u64;
    reserve_price_hash as field;
    created_at as u64;
    dispute_deadline as u64;

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

struct SettlementProof:
    auction_id as field;
    highest_bid as u128;
    second_highest as u128;
    winner_bid_hash as field;
    settled_at as u64;

struct PlatformConfig:
    admin_hash as field;
    fee_bps as u128;
    dispute_bond_bps as u128;
    paused as boolean;

struct DutchConfig:
    start_price as u128;
    end_price as u128;

struct DisputeData:
    disputer_hash as field;
    bond_amount as u128;
    reason_hash as field;
    filed_at as u64;

struct BundleConfig:
    item_count as u8;
    item_hash_1 as field;
    item_hash_2 as field;
    item_hash_3 as field;
    item_hash_4 as field;
    total_reserve as u128;

struct MultiUnitConfig:
    total_units as u128;
    min_price_per_unit as u128;
    filled_units as u128;

struct CandleConfig:
    candle_start as u64;
    candle_end as u64;

mapping auctions:
    key as field.public;
    value as AuctionData.public;

mapping bid_commitments:
    key as field.public;
    value as boolean.public;

mapping revealed_bids:
    key as field.public;
    value as u128.public;

mapping highest_bids:
    key as field.public;
    value as u128.public;

mapping second_highest_bids:
    key as field.public;
    value as u128.public;

mapping auction_winners:
    key as field.public;
    value as field.public;

mapping platform_config:
    key as u8.public;
    value as PlatformConfig.public;

mapping settlement_proofs:
    key as field.public;
    value as field.public;

mapping dutch_params:
    key as field.public;
    value as DutchConfig.public;

mapping disputes:
    key as field.public;
    value as DisputeData.public;

mapping dispute_bonds:
    key as field.public;
    value as u128.public;

mapping merkle_roots:
    key as field.public;
    value as field.public;

mapping reputation_completed:
    key as field.public;
    value as u64.public;

mapping reputation_disputed:
    key as field.public;
    value as u64.public;

mapping bundle_configs:
    key as field.public;
    value as BundleConfig.public;

mapping multi_unit_configs:
    key as field.public;
    value as MultiUnitConfig.public;

mapping multi_unit_highest:
    key as field.public;
    value as u128.public;

mapping multi_unit_second:
    key as field.public;
    value as u128.public;

mapping candle_configs:
    key as field.public;
    value as CandleConfig.public;

mapping escalation_prices:
    key as field.public;
    value as u128.public;

mapping lowest_bids:
    key as field.public;
    value as u128.public;

mapping bundle_allocation:
    key as field.public;
    value as u8.public;

function initialize_platform:
    input r0 as address.private;
    input r1 as u128.private;
    input r2 as u128.private;
    cast r0 into r3 as field;
    hash.bhp256 r3 into r4 as field;
    async initialize_platform r4 r1 r2 into r5;
    output r5 as obscura_core_v2.aleo/initialize_platform.future;

finalize initialize_platform:
    input r0 as field.public;
    input r1 as u128.public;
    input r2 as u128.public;
    contains platform_config[0u8] into r3;
    not r3 into r4;
    assert.eq r4 true;
    cast r0 r1 r2 false into r5 as PlatformConfig;
    set r5 into platform_config[0u8];

function create_auction:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u8.private;
    input r4 as u8.private;
    input r5 as field.private;
    input r6 as u64.public;
    cast self.caller r0 r6 r5 into r7 as AuctionSeed;
    hash.bhp256 r7 into r8 as field;
    cast r2 into r9 as field;
    hash.bhp256 r9 into r10 as field;
    cast self.caller into r11 as field;
    hash.bhp256 r11 into r12 as field;
    is.eq r3 1u8 into r13;
    is.eq r3 2u8 into r14;
    or r13 r14 into r15;
    is.eq r3 4u8 into r16;
    or r15 r16 into r17;
    assert.eq r17 true;
    is.eq r4 1u8 into r18;
    is.eq r4 2u8 into r19;
    or r18 r19 into r20;
    is.eq r4 3u8 into r21;
    or r20 r21 into r22;
    assert.eq r22 true;
    async create_auction r8 r6 r0 r12 r1 r4 r3 r10 into r23;
    output r8 as field.private;
    output r23 as obscura_core_v2.aleo/create_auction.future;

finalize create_auction:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as u8.public;
    input r7 as field.public;
    contains auctions[r0] into r8;
    not r8 into r9;
    assert.eq r9 true;
    cast block.height into r10 as u64;
    add r10 240u64 into r11;
    gt r1 r11 into r12;
    assert.eq r12 true;
    get platform_config[0u8] into r13;
    not r13.paused into r14;
    assert.eq r14 true;
    cast r2 r3 r4 r5 r6 1u8 r1 0u64 0u64 r7 r10 0u64 into r15 as AuctionData;
    set r15 into auctions[r0];

function create_dutch_auction:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u8.private;
    input r5 as field.private;
    input r6 as u64.public;
    gt r2 r3 into r7;
    assert.eq r7 true;
    gte r3 1000u128 into r8;
    assert.eq r8 true;
    is.eq r4 1u8 into r9;
    is.eq r4 2u8 into r10;
    or r9 r10 into r11;
    is.eq r4 3u8 into r12;
    or r11 r12 into r13;
    assert.eq r13 true;
    cast self.caller r0 r6 r5 into r14 as AuctionSeed;
    hash.bhp256 r14 into r15 as field;
    cast r3 into r16 as field;
    hash.bhp256 r16 into r17 as field;
    cast self.caller into r18 as field;
    hash.bhp256 r18 into r19 as field;
    async create_dutch_auction r15 r6 r0 r19 r1 r4 r17 r2 r3 into r20;
    output r15 as field.private;
    output r20 as obscura_core_v2.aleo/create_dutch_auction.future;

finalize create_dutch_auction:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as field.public;
    input r7 as u128.public;
    input r8 as u128.public;
    contains auctions[r0] into r9;
    not r9 into r10;
    assert.eq r10 true;
    cast block.height into r11 as u64;
    add r11 240u64 into r12;
    gt r1 r12 into r13;
    assert.eq r13 true;
    get platform_config[0u8] into r14;
    not r14.paused into r15;
    assert.eq r15 true;
    cast r2 r3 r4 r5 3u8 1u8 r1 0u64 0u64 r6 r11 0u64 into r16 as AuctionData;
    set r16 into auctions[r0];
    cast r7 r8 into r17 as DutchConfig;
    set r17 into dutch_params[r0];

function create_bundle_auction:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as field.private;
    input r3 as field.private;
    input r4 as u8.private;
    input r5 as u8.private;
    input r6 as u128.private;
    input r7 as u8.private;
    input r8 as field.private;
    input r9 as u64.public;
    gte r4 2u8 into r10;
    lte r4 4u8 into r11;
    and r10 r11 into r12;
    assert.eq r12 true;
    gte r6 1000u128 into r13;
    assert.eq r13 true;
    is.eq r7 1u8 into r14;
    is.eq r7 2u8 into r15;
    or r14 r15 into r16;
    is.eq r7 3u8 into r17;
    or r16 r17 into r18;
    assert.eq r18 true;
    cast self.caller r0 r9 r8 into r19 as AuctionSeed;
    hash.bhp256 r19 into r20 as field;
    cast r6 into r21 as field;
    hash.bhp256 r21 into r22 as field;
    cast self.caller into r23 as field;
    hash.bhp256 r23 into r24 as field;
    async create_bundle_auction r20 r9 r0 r24 r5 r7 r22 r4 r1 r2 r3 r6 into r25;
    output r20 as field.private;
    output r25 as obscura_core_v2.aleo/create_bundle_auction.future;

finalize create_bundle_auction:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as field.public;
    input r7 as u8.public;
    input r8 as field.public;
    input r9 as field.public;
    input r10 as field.public;
    input r11 as u128.public;
    contains auctions[r0] into r12;
    not r12 into r13;
    assert.eq r13 true;
    cast block.height into r14 as u64;
    add r14 240u64 into r15;
    gt r1 r15 into r16;
    assert.eq r16 true;
    get platform_config[0u8] into r17;
    not r17.paused into r18;
    assert.eq r18 true;
    cast r2 r3 r4 r5 5u8 1u8 r1 0u64 0u64 r6 r14 0u64 into r19 as AuctionData;
    set r19 into auctions[r0];
    cast r7 r2 r8 r9 r10 r11 into r20 as BundleConfig;
    set r20 into bundle_configs[r0];

function create_multi_unit_auction:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u8.private;
    input r5 as field.private;
    input r6 as u64.public;
    gt r2 0u128 into r7;
    assert.eq r7 true;
    gte r3 1000u128 into r8;
    assert.eq r8 true;
    is.eq r4 1u8 into r9;
    is.eq r4 2u8 into r10;
    or r9 r10 into r11;
    is.eq r4 3u8 into r12;
    or r11 r12 into r13;
    assert.eq r13 true;
    cast self.caller r0 r6 r5 into r14 as AuctionSeed;
    hash.bhp256 r14 into r15 as field;
    cast r3 into r16 as field;
    hash.bhp256 r16 into r17 as field;
    cast self.caller into r18 as field;
    hash.bhp256 r18 into r19 as field;
    async create_multi_unit_auction r15 r6 r0 r19 r1 r4 r17 r2 r3 into r20;
    output r15 as field.private;
    output r20 as obscura_core_v2.aleo/create_multi_unit_auction.future;

finalize create_multi_unit_auction:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as field.public;
    input r7 as u128.public;
    input r8 as u128.public;
    contains auctions[r0] into r9;
    not r9 into r10;
    assert.eq r10 true;
    cast block.height into r11 as u64;
    add r11 240u64 into r12;
    gt r1 r12 into r13;
    assert.eq r13 true;
    get platform_config[0u8] into r14;
    not r14.paused into r15;
    assert.eq r15 true;
    cast r2 r3 r4 r5 6u8 1u8 r1 0u64 0u64 r6 r11 0u64 into r16 as AuctionData;
    set r16 into auctions[r0];
    cast r7 r8 0u128 into r17 as MultiUnitConfig;
    set r17 into multi_unit_configs[r0];

function cancel_auction:
    input r0 as field.private;
    cast self.caller into r1 as field;
    hash.bhp256 r1 into r2 as field;
    async cancel_auction r0 r2 into r3;
    output r3 as obscura_core_v2.aleo/cancel_auction.future;

finalize cancel_auction:
    input r0 as field.public;
    input r1 as field.public;
    get auctions[r0] into r2;
    assert.eq r2.seller_hash r1;
    assert.eq r2.status 1u8;
    assert.eq r2.bid_count 0u64;
    cast r2.item_hash r2.seller_hash r2.category r2.token_type r2.auction_mode 5u8 r2.deadline r2.reveal_deadline r2.bid_count r2.reserve_price_hash r2.created_at r2.dispute_deadline into r3 as AuctionData;
    set r3 into auctions[r0];

function close_bidding:
    input r0 as field.private;
    async close_bidding r0 into r1;
    output r1 as obscura_core_v2.aleo/close_bidding.future;

finalize close_bidding:
    input r0 as field.public;
    get auctions[r0] into r1;
    assert.eq r1.status 1u8;
    is.eq r1.auction_mode 1u8 into r2;
    is.eq r1.auction_mode 2u8 into r3;
    or r2 r3 into r4;
    is.eq r1.auction_mode 5u8 into r5;
    or r4 r5 into r6;
    is.eq r1.auction_mode 6u8 into r7;
    or r6 r7 into r8;
    is.eq r1.auction_mode 7u8 into r9;
    or r8 r9 into r10;
    is.eq r1.auction_mode 8u8 into r11;
    or r10 r11 into r12;
    is.eq r1.auction_mode 9u8 into r13;
    or r12 r13 into r14;
    assert.eq r14 true;
    cast block.height into r15 as u64;
    gte r15 r1.deadline into r16;
    assert.eq r16 true;
    is.eq r1.bid_count 0u64 into r17;
    branch.eq r17 false to end_then_0_0;
    cast r1.item_hash r1.seller_hash r1.category r1.token_type r1.auction_mode 8u8 r1.deadline r1.reveal_deadline r1.bid_count r1.reserve_price_hash r1.created_at r1.dispute_deadline into r18 as AuctionData;
    set r18 into auctions[r0];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    add r15 2880u64 into r19;
    cast r1.item_hash r1.seller_hash r1.category r1.token_type r1.auction_mode 3u8 r1.deadline r19 r1.bid_count r1.reserve_price_hash r1.created_at r1.dispute_deadline into r20 as AuctionData;
    set r20 into auctions[r0];
    position end_otherwise_0_1;

function place_bid:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u8.private;
    gte r1 1000u128 into r4;
    assert.eq r4 true;
    is.eq r3 1u8 into r5;
    is.eq r3 2u8 into r6;
    or r5 r6 into r7;
    is.eq r3 3u8 into r8;
    or r7 r8 into r9;
    assert.eq r9 true;
    cast self.caller r0 r1 r2 r3 into r10 as SealedBid.record;
    cast self.caller r0 r1 r2 into r11 as BidCommitment;
    hash.bhp256 r11 into r12 as field;
    async place_bid r0 r3 r12 into r13;
    output r10 as SealedBid.record;
    output r13 as obscura_core_v2.aleo/place_bid.future;

finalize place_bid:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as field.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.token_type r1;
    is.eq r3.auction_mode 1u8 into r4;
    is.eq r3.auction_mode 2u8 into r5;
    or r4 r5 into r6;
    assert.eq r6 true;
    cast block.height into r7 as u64;
    lte r7 r3.deadline into r8;
    assert.eq r8 true;
    contains bid_commitments[r2] into r9;
    not r9 into r10;
    assert.eq r10 true;
    get platform_config[0u8] into r11;
    not r11.paused into r12;
    assert.eq r12 true;
    set true into bid_commitments[r2];
    add r3.bid_count 1u64 into r13;
    cast r3.item_hash r3.seller_hash r3.category r3.token_type r3.auction_mode r3.status r3.deadline r3.reveal_deadline r13 r3.reserve_price_hash r3.created_at r3.dispute_deadline into r14 as AuctionData;
    set r14 into auctions[r0];

function place_bundle_bid:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u8.private;
    gte r1 1000u128 into r4;
    assert.eq r4 true;
    cast self.caller r0 r1 r2 r3 into r5 as BundleBid.record;
    cast self.caller r0 r1 r2 into r6 as BidCommitment;
    hash.bhp256 r6 into r7 as field;
    async place_bundle_bid r0 r3 r7 into r8;
    output r5 as BundleBid.record;
    output r8 as obscura_core_v2.aleo/place_bundle_bid.future;

finalize place_bundle_bid:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as field.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.auction_mode 5u8;
    assert.eq r3.token_type r1;
    cast block.height into r4 as u64;
    lte r4 r3.deadline into r5;
    assert.eq r5 true;
    contains bid_commitments[r2] into r6;
    not r6 into r7;
    assert.eq r7 true;
    get platform_config[0u8] into r8;
    not r8.paused into r9;
    assert.eq r9 true;
    set true into bid_commitments[r2];
    add r3.bid_count 1u64 into r10;
    cast r3.item_hash r3.seller_hash r3.category r3.token_type r3.auction_mode r3.status r3.deadline r3.reveal_deadline r10 r3.reserve_price_hash r3.created_at r3.dispute_deadline into r11 as AuctionData;
    set r11 into auctions[r0];

function place_subset_bid:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as field.private;
    input r4 as u8.private;
    gte r2 1000u128 into r5;
    assert.eq r5 true;
    gt r1 0u8 into r6;
    assert.eq r6 true;
    lte r1 15u8 into r7;
    assert.eq r7 true;
    cast self.caller r0 r1 r2 r3 r4 into r8 as SubsetBid.record;
    cast self.caller r0 r2 r3 into r9 as BidCommitment;
    hash.bhp256 r9 into r10 as field;
    async place_subset_bid r0 r4 r10 into r11;
    output r8 as SubsetBid.record;
    output r11 as obscura_core_v2.aleo/place_subset_bid.future;

finalize place_subset_bid:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as field.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.auction_mode 5u8;
    assert.eq r3.token_type r1;
    cast block.height into r4 as u64;
    lte r4 r3.deadline into r5;
    assert.eq r5 true;
    contains bid_commitments[r2] into r6;
    not r6 into r7;
    assert.eq r7 true;
    get platform_config[0u8] into r8;
    not r8.paused into r9;
    assert.eq r9 true;
    set true into bid_commitments[r2];
    add r3.bid_count 1u64 into r10;
    cast r3.item_hash r3.seller_hash r3.category r3.token_type r3.auction_mode r3.status r3.deadline r3.reveal_deadline r10 r3.reserve_price_hash r3.created_at r3.dispute_deadline into r11 as AuctionData;
    set r11 into auctions[r0];

function place_multi_unit_bid:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as field.private;
    input r4 as u8.private;
    gt r1 0u128 into r5;
    assert.eq r5 true;
    gte r2 1000u128 into r6;
    assert.eq r6 true;
    cast self.caller r0 r1 r2 r3 r4 into r7 as MultiUnitBid.record;
    mul r1 r2 into r8;
    cast self.caller r0 r8 r3 into r9 as BidCommitment;
    hash.bhp256 r9 into r10 as field;
    async place_multi_unit_bid r0 r4 r10 into r11;
    output r7 as MultiUnitBid.record;
    output r11 as obscura_core_v2.aleo/place_multi_unit_bid.future;

finalize place_multi_unit_bid:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as field.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.auction_mode 6u8;
    assert.eq r3.token_type r1;
    cast block.height into r4 as u64;
    lte r4 r3.deadline into r5;
    assert.eq r5 true;
    contains bid_commitments[r2] into r6;
    not r6 into r7;
    assert.eq r7 true;
    get platform_config[0u8] into r8;
    not r8.paused into r9;
    assert.eq r9 true;
    set true into bid_commitments[r2];
    add r3.bid_count 1u64 into r10;
    cast r3.item_hash r3.seller_hash r3.category r3.token_type r3.auction_mode r3.status r3.deadline r3.reveal_deadline r10 r3.reserve_price_hash r3.created_at r3.dispute_deadline into r11 as AuctionData;
    set r11 into auctions[r0];

function set_merkle_root:
    input r0 as field.private;
    input r1 as field.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    async set_merkle_root r0 r3 r1 into r4;
    output r4 as obscura_core_v2.aleo/set_merkle_root.future;

finalize set_merkle_root:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    get auctions[r0] into r3;
    assert.eq r3.seller_hash r1;
    assert.eq r3.status 1u8;
    assert.eq r3.bid_count 0u64;
    set r2 into merkle_roots[r0];

function finalize_auction:
    input r0 as field.private;
    input r1 as u128.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    cast r1 into r4 as field;
    hash.bhp256 r4 into r5 as field;
    async finalize_auction r0 r3 r5 r1 into r6;
    output r6 as obscura_core_v2.aleo/finalize_auction.future;

finalize finalize_auction:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    get auctions[r0] into r4;
    assert.eq r4.seller_hash r1;
    assert.eq r4.status 3u8;
    cast block.height into r5 as u64;
    gt r5 r4.reveal_deadline into r6;
    assert.eq r6 true;
    assert.eq r2 r4.reserve_price_hash;
    get.or_use highest_bids[r0] 0u128 into r7;
    get.or_use auction_winners[r0] 0field into r8;
    get.or_use second_highest_bids[r0] 0u128 into r9;
    is.eq r4.auction_mode 2u8 into r10;
    branch.eq r10 false to end_then_0_2;
    is.eq r9 0u128 into r11;
    branch.eq r11 false to end_then_1_4;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at r4.dispute_deadline into r12 as AuctionData;
    set r12 into auctions[r0];
    branch.eq true true to end_otherwise_1_5;
    position end_then_1_4;
    gte r7 r3 into r13;
    branch.eq r13 false to end_then_2_6;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r14 as AuctionData;
    set r14 into auctions[r0];
    cast r0 r7 r9 r8 r5 into r15 as SettlementProof;
    hash.bhp256 r15 into r16 as field;
    set r16 into settlement_proofs[r0];
    get.or_use reputation_completed[r4.seller_hash] 0u64 into r17;
    add r17 1u64 into r18;
    set r18 into reputation_completed[r4.seller_hash];
    branch.eq true true to end_otherwise_2_7;
    position end_then_2_6;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r19 as AuctionData;
    set r19 into auctions[r0];
    position end_otherwise_2_7;
    position end_otherwise_1_5;
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    is.eq r4.auction_mode 8u8 into r20;
    branch.eq r20 false to end_then_1_8;
    get.or_use lowest_bids[r0] 0u128 into r21;
    get.or_use auction_winners[r0] 0field into r22;
    gt r21 0u128 into r23;
    lte r21 r3 into r24;
    and r23 r24 into r25;
    branch.eq r25 false to end_then_2_10;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r26 as AuctionData;
    set r26 into auctions[r0];
    cast r0 r21 0u128 r22 r5 into r27 as SettlementProof;
    hash.bhp256 r27 into r28 as field;
    set r28 into settlement_proofs[r0];
    get.or_use reputation_completed[r4.seller_hash] 0u64 into r29;
    add r29 1u64 into r30;
    set r30 into reputation_completed[r4.seller_hash];
    branch.eq true true to end_otherwise_2_11;
    position end_then_2_10;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r31 as AuctionData;
    set r31 into auctions[r0];
    position end_otherwise_2_11;
    branch.eq true true to end_otherwise_1_9;
    position end_then_1_8;
    gte r7 r3 into r32;
    gt r7 0u128 into r33;
    and r32 r33 into r34;
    branch.eq r34 false to end_then_2_12;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r35 as AuctionData;
    set r35 into auctions[r0];
    cast r0 r7 r9 r8 r5 into r36 as SettlementProof;
    hash.bhp256 r36 into r37 as field;
    set r37 into settlement_proofs[r0];
    get.or_use reputation_completed[r4.seller_hash] 0u64 into r38;
    add r38 1u64 into r39;
    set r39 into reputation_completed[r4.seller_hash];
    branch.eq true true to end_otherwise_2_13;
    position end_then_2_12;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at r4.dispute_deadline into r40 as AuctionData;
    set r40 into auctions[r0];
    position end_otherwise_2_13;
    position end_otherwise_1_9;
    position end_otherwise_0_3;

function settle_english:
    input r0 as field.private;
    input r1 as u128.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    cast r1 into r4 as field;
    hash.bhp256 r4 into r5 as field;
    async settle_english r0 r3 r5 r1 into r6;
    output r6 as obscura_core_v2.aleo/settle_english.future;

finalize settle_english:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    get auctions[r0] into r4;
    assert.eq r4.seller_hash r1;
    assert.eq r4.status 1u8;
    assert.eq r4.auction_mode 4u8;
    cast block.height into r5 as u64;
    gt r5 r4.deadline into r6;
    assert.eq r6 true;
    assert.eq r2 r4.reserve_price_hash;
    get.or_use highest_bids[r0] 0u128 into r7;
    get.or_use auction_winners[r0] 0field into r8;
    gte r7 r3 into r9;
    gt r7 0u128 into r10;
    and r9 r10 into r11;
    branch.eq r11 false to end_then_0_14;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline 0u64 r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r12 as AuctionData;
    set r12 into auctions[r0];
    get.or_use second_highest_bids[r0] 0u128 into r13;
    cast r0 r7 r13 r8 r5 into r14 as SettlementProof;
    hash.bhp256 r14 into r15 as field;
    set r15 into settlement_proofs[r0];
    get.or_use reputation_completed[r4.seller_hash] 0u64 into r16;
    add r16 1u64 into r17;
    set r17 into reputation_completed[r4.seller_hash];
    branch.eq true true to end_otherwise_0_15;
    position end_then_0_14;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline 0u64 r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r18 as AuctionData;
    set r18 into auctions[r0];
    position end_otherwise_0_15;

function admin_emergency:
    input r0 as u8.private;
    input r1 as field.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    async admin_emergency r0 r1 r3 into r4;
    output r4 as obscura_core_v2.aleo/admin_emergency.future;

finalize admin_emergency:
    input r0 as u8.public;
    input r1 as field.public;
    input r2 as field.public;
    is.eq r0 1u8 into r3;
    branch.eq r3 false to end_then_0_16;
    get auctions[r1] into r4;
    assert.eq r4.status 3u8;
    cast block.height into r5 as u64;
    add r4.reveal_deadline 100u64 into r6;
    gt r5 r6 into r7;
    assert.eq r7 true;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r8 as AuctionData;
    set r8 into auctions[r1];
    branch.eq true true to end_otherwise_0_17;
    position end_then_0_16;
    get platform_config[0u8] into r9;
    assert.eq r2 r9.admin_hash;
    not r9.paused into r10;
    cast r9.admin_hash r9.fee_bps r9.dispute_bond_bps r10 into r11 as PlatformConfig;
    set r11 into platform_config[0u8];
    position end_otherwise_0_17;

function create_candle_auction:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u8.private;
    input r4 as field.private;
    input r5 as u64.public;
    input r6 as u64.private;
    gt r6 0u64 into r7;
    assert.eq r7 true;
    gte r2 1000u128 into r8;
    assert.eq r8 true;
    is.eq r3 1u8 into r9;
    is.eq r3 2u8 into r10;
    or r9 r10 into r11;
    is.eq r3 3u8 into r12;
    or r11 r12 into r13;
    assert.eq r13 true;
    cast self.caller r0 r5 r4 into r14 as AuctionSeed;
    hash.bhp256 r14 into r15 as field;
    cast r2 into r16 as field;
    hash.bhp256 r16 into r17 as field;
    cast self.caller into r18 as field;
    hash.bhp256 r18 into r19 as field;
    sub r5 r6 into r20;
    async create_candle_auction r15 r20 r0 r19 r1 r3 r5 r17 into r21;
    output r15 as field.private;
    output r21 as obscura_core_v2.aleo/create_candle_auction.future;

finalize create_candle_auction:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as u64.public;
    input r7 as field.public;
    contains auctions[r0] into r8;
    not r8 into r9;
    assert.eq r9 true;
    cast block.height into r10 as u64;
    add r10 240u64 into r11;
    gt r1 r11 into r12;
    assert.eq r12 true;
    get platform_config[0u8] into r13;
    not r13.paused into r14;
    assert.eq r14 true;
    cast r2 r3 r4 r5 7u8 1u8 r6 0u64 0u64 r7 r10 0u64 into r15 as AuctionData;
    set r15 into auctions[r0];
    cast r1 r6 into r16 as CandleConfig;
    set r16 into candle_configs[r0];

function place_candle_bid:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u8.private;
    gte r1 1000u128 into r4;
    assert.eq r4 true;
    is.eq r3 1u8 into r5;
    is.eq r3 2u8 into r6;
    or r5 r6 into r7;
    is.eq r3 3u8 into r8;
    or r7 r8 into r9;
    assert.eq r9 true;
    cast self.caller r0 r1 r2 r3 into r10 as SealedBid.record;
    cast self.caller r0 r1 r2 into r11 as BidCommitment;
    hash.bhp256 r11 into r12 as field;
    async place_candle_bid r0 r3 r12 into r13;
    output r10 as SealedBid.record;
    output r13 as obscura_core_v2.aleo/place_candle_bid.future;

finalize place_candle_bid:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as field.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.auction_mode 7u8;
    assert.eq r3.token_type r1;
    cast block.height into r4 as u64;
    lte r4 r3.deadline into r5;
    assert.eq r5 true;
    contains bid_commitments[r2] into r6;
    not r6 into r7;
    assert.eq r7 true;
    get platform_config[0u8] into r8;
    not r8.paused into r9;
    assert.eq r9 true;
    set true into bid_commitments[r2];
    add r3.bid_count 1u64 into r10;
    cast r3.item_hash r3.seller_hash r3.category r3.token_type r3.auction_mode r3.status r3.deadline r3.reveal_deadline r10 r3.reserve_price_hash r3.created_at r3.dispute_deadline into r11 as AuctionData;
    set r11 into auctions[r0];

function settle_candle:
    input r0 as field.private;
    input r1 as u128.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    cast r1 into r4 as field;
    hash.bhp256 r4 into r5 as field;
    async settle_candle r0 r3 r5 r1 into r6;
    output r6 as obscura_core_v2.aleo/settle_candle.future;

finalize settle_candle:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    get auctions[r0] into r4;
    assert.eq r4.seller_hash r1;
    assert.eq r4.auction_mode 7u8;
    assert.eq r4.status 3u8;
    cast block.height into r5 as u64;
    gt r5 r4.reveal_deadline into r6;
    assert.eq r6 true;
    assert.eq r2 r4.reserve_price_hash;
    get candle_configs[r0] into r7;
    gt r5 r7.candle_end into r8;
    assert.eq r8 true;
    get.or_use highest_bids[r0] 0u128 into r9;
    get.or_use auction_winners[r0] 0field into r10;
    get.or_use second_highest_bids[r0] 0u128 into r11;
    gte r9 r3 into r12;
    gt r9 0u128 into r13;
    and r12 r13 into r14;
    branch.eq r14 false to end_then_0_18;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r15 as AuctionData;
    set r15 into auctions[r0];
    cast r0 r9 r11 r10 r5 into r16 as SettlementProof;
    hash.bhp256 r16 into r17 as field;
    set r17 into settlement_proofs[r0];
    get.or_use reputation_completed[r4.seller_hash] 0u64 into r18;
    add r18 1u64 into r19;
    set r19 into reputation_completed[r4.seller_hash];
    branch.eq true true to end_otherwise_0_19;
    position end_then_0_18;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r20 as AuctionData;
    set r20 into auctions[r0];
    position end_otherwise_0_19;

function create_reverse_auction:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u8.private;
    input r4 as field.private;
    input r5 as u64.public;
    gte r2 1000u128 into r6;
    assert.eq r6 true;
    is.eq r3 1u8 into r7;
    is.eq r3 2u8 into r8;
    or r7 r8 into r9;
    is.eq r3 3u8 into r10;
    or r9 r10 into r11;
    assert.eq r11 true;
    cast self.caller r0 r5 r4 into r12 as AuctionSeed;
    hash.bhp256 r12 into r13 as field;
    cast r2 into r14 as field;
    hash.bhp256 r14 into r15 as field;
    cast self.caller into r16 as field;
    hash.bhp256 r16 into r17 as field;
    async create_reverse_auction r13 r5 r0 r17 r1 r3 r15 into r18;
    output r13 as field.private;
    output r18 as obscura_core_v2.aleo/create_reverse_auction.future;

finalize create_reverse_auction:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as field.public;
    contains auctions[r0] into r7;
    not r7 into r8;
    assert.eq r8 true;
    cast block.height into r9 as u64;
    add r9 240u64 into r10;
    gt r1 r10 into r11;
    assert.eq r11 true;
    get platform_config[0u8] into r12;
    not r12.paused into r13;
    assert.eq r13 true;
    cast r2 r3 r4 r5 8u8 1u8 r1 0u64 0u64 r6 r9 0u64 into r14 as AuctionData;
    set r14 into auctions[r0];

function place_reverse_bid:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u8.private;
    gte r1 1000u128 into r4;
    assert.eq r4 true;
    is.eq r3 1u8 into r5;
    is.eq r3 2u8 into r6;
    or r5 r6 into r7;
    is.eq r3 3u8 into r8;
    or r7 r8 into r9;
    assert.eq r9 true;
    cast self.caller r0 r1 r2 r3 into r10 as SealedBid.record;
    cast self.caller r0 r1 r2 into r11 as BidCommitment;
    hash.bhp256 r11 into r12 as field;
    async place_reverse_bid r0 r3 r12 into r13;
    output r10 as SealedBid.record;
    output r13 as obscura_core_v2.aleo/place_reverse_bid.future;

finalize place_reverse_bid:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as field.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.auction_mode 8u8;
    assert.eq r3.token_type r1;
    cast block.height into r4 as u64;
    lte r4 r3.deadline into r5;
    assert.eq r5 true;
    contains bid_commitments[r2] into r6;
    not r6 into r7;
    assert.eq r7 true;
    get platform_config[0u8] into r8;
    not r8.paused into r9;
    assert.eq r9 true;
    set true into bid_commitments[r2];
    add r3.bid_count 1u64 into r10;
    cast r3.item_hash r3.seller_hash r3.category r3.token_type r3.auction_mode r3.status r3.deadline r3.reveal_deadline r10 r3.reserve_price_hash r3.created_at r3.dispute_deadline into r11 as AuctionData;
    set r11 into auctions[r0];

function settle_reverse:
    input r0 as field.private;
    input r1 as u128.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    cast r1 into r4 as field;
    hash.bhp256 r4 into r5 as field;
    async settle_reverse r0 r3 r5 r1 into r6;
    output r6 as obscura_core_v2.aleo/settle_reverse.future;

finalize settle_reverse:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    get auctions[r0] into r4;
    assert.eq r4.seller_hash r1;
    assert.eq r4.auction_mode 8u8;
    assert.eq r4.status 3u8;
    cast block.height into r5 as u64;
    gt r5 r4.reveal_deadline into r6;
    assert.eq r6 true;
    assert.eq r2 r4.reserve_price_hash;
    get.or_use lowest_bids[r0] 0u128 into r7;
    get.or_use auction_winners[r0] 0field into r8;
    gt r7 0u128 into r9;
    lte r7 r3 into r10;
    and r9 r10 into r11;
    branch.eq r11 false to end_then_0_20;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r12 as AuctionData;
    set r12 into auctions[r0];
    cast r0 r7 0u128 r8 r5 into r13 as SettlementProof;
    hash.bhp256 r13 into r14 as field;
    set r14 into settlement_proofs[r0];
    get.or_use reputation_completed[r4.seller_hash] 0u64 into r15;
    add r15 1u64 into r16;
    set r16 into reputation_completed[r4.seller_hash];
    branch.eq true true to end_otherwise_0_21;
    position end_then_0_20;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r17 as AuctionData;
    set r17 into auctions[r0];
    position end_otherwise_0_21;

function create_blind_dutch:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u8.private;
    input r5 as field.private;
    input r6 as u64.public;
    gt r2 r3 into r7;
    assert.eq r7 true;
    gte r3 1000u128 into r8;
    assert.eq r8 true;
    is.eq r4 1u8 into r9;
    is.eq r4 2u8 into r10;
    or r9 r10 into r11;
    is.eq r4 3u8 into r12;
    or r11 r12 into r13;
    assert.eq r13 true;
    cast self.caller r0 r6 r5 into r14 as AuctionSeed;
    hash.bhp256 r14 into r15 as field;
    cast r3 into r16 as field;
    hash.bhp256 r16 into r17 as field;
    cast self.caller into r18 as field;
    hash.bhp256 r18 into r19 as field;
    async create_blind_dutch r15 r6 r0 r19 r1 r4 r17 r2 r3 into r20;
    output r15 as field.private;
    output r20 as obscura_core_v2.aleo/create_blind_dutch.future;

finalize create_blind_dutch:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as field.public;
    input r7 as u128.public;
    input r8 as u128.public;
    contains auctions[r0] into r9;
    not r9 into r10;
    assert.eq r10 true;
    cast block.height into r11 as u64;
    add r11 240u64 into r12;
    gt r1 r12 into r13;
    assert.eq r13 true;
    get platform_config[0u8] into r14;
    not r14.paused into r15;
    assert.eq r15 true;
    cast r2 r3 r4 r5 9u8 1u8 r1 0u64 0u64 r6 r11 0u64 into r16 as AuctionData;
    set r16 into auctions[r0];
    cast r7 r8 into r17 as DutchConfig;
    set r17 into dutch_params[r0];

function place_blind_dutch_bid:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u8.private;
    gte r1 1000u128 into r4;
    assert.eq r4 true;
    is.eq r3 1u8 into r5;
    is.eq r3 2u8 into r6;
    or r5 r6 into r7;
    is.eq r3 3u8 into r8;
    or r7 r8 into r9;
    assert.eq r9 true;
    cast self.caller r0 r1 r2 r3 into r10 as SealedBid.record;
    cast self.caller r0 r1 r2 into r11 as BidCommitment;
    hash.bhp256 r11 into r12 as field;
    async place_blind_dutch_bid r0 r3 r12 into r13;
    output r10 as SealedBid.record;
    output r13 as obscura_core_v2.aleo/place_blind_dutch_bid.future;

finalize place_blind_dutch_bid:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as field.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.auction_mode 9u8;
    assert.eq r3.token_type r1;
    cast block.height into r4 as u64;
    lte r4 r3.deadline into r5;
    assert.eq r5 true;
    contains bid_commitments[r2] into r6;
    not r6 into r7;
    assert.eq r7 true;
    get platform_config[0u8] into r8;
    not r8.paused into r9;
    assert.eq r9 true;
    set true into bid_commitments[r2];
    add r3.bid_count 1u64 into r10;
    cast r3.item_hash r3.seller_hash r3.category r3.token_type r3.auction_mode r3.status r3.deadline r3.reveal_deadline r10 r3.reserve_price_hash r3.created_at r3.dispute_deadline into r11 as AuctionData;
    set r11 into auctions[r0];

function create_timed_escalation:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u8.private;
    input r4 as field.private;
    input r5 as u64.public;
    gte r2 1000u128 into r6;
    assert.eq r6 true;
    is.eq r3 1u8 into r7;
    is.eq r3 2u8 into r8;
    or r7 r8 into r9;
    is.eq r3 3u8 into r10;
    or r9 r10 into r11;
    assert.eq r11 true;
    cast self.caller r0 r5 r4 into r12 as AuctionSeed;
    hash.bhp256 r12 into r13 as field;
    cast r2 into r14 as field;
    hash.bhp256 r14 into r15 as field;
    cast self.caller into r16 as field;
    hash.bhp256 r16 into r17 as field;
    async create_timed_escalation r13 r5 r0 r17 r1 r3 r15 r2 into r18;
    output r13 as field.private;
    output r18 as obscura_core_v2.aleo/create_timed_escalation.future;

finalize create_timed_escalation:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as field.public;
    input r7 as u128.public;
    contains auctions[r0] into r8;
    not r8 into r9;
    assert.eq r9 true;
    cast block.height into r10 as u64;
    add r10 240u64 into r11;
    gt r1 r11 into r12;
    assert.eq r12 true;
    get platform_config[0u8] into r13;
    not r13.paused into r14;
    assert.eq r14 true;
    cast r2 r3 r4 r5 10u8 1u8 r1 0u64 0u64 r6 r10 0u64 into r15 as AuctionData;
    set r15 into auctions[r0];
    set r7 into escalation_prices[r0];

function bid_timed_escalation:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u8.private;
    gte r1 1000u128 into r4;
    assert.eq r4 true;
    is.eq r3 1u8 into r5;
    is.eq r3 2u8 into r6;
    or r5 r6 into r7;
    is.eq r3 3u8 into r8;
    or r7 r8 into r9;
    assert.eq r9 true;
    cast self.caller r0 r1 r2 r3 into r10 as SealedBid.record;
    cast self.caller r0 r1 r2 into r11 as BidCommitment;
    hash.bhp256 r11 into r12 as field;
    async bid_timed_escalation r0 r3 r1 r12 into r13;
    output r10 as SealedBid.record;
    output r13 as obscura_core_v2.aleo/bid_timed_escalation.future;

finalize bid_timed_escalation:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as u128.public;
    input r3 as field.public;
    get auctions[r0] into r4;
    assert.eq r4.status 1u8;
    assert.eq r4.auction_mode 10u8;
    assert.eq r4.token_type r1;
    cast block.height into r5 as u64;
    lte r5 r4.deadline into r6;
    assert.eq r6 true;
    get platform_config[0u8] into r7;
    not r7.paused into r8;
    assert.eq r8 true;
    get escalation_prices[r0] into r9;
    sub r5 r4.created_at into r10;
    div r10 40u64 into r11;
    cast r11 into r12 as u128;
    mul r9 200u128 into r13;
    mul r13 r12 into r14;
    div r14 10000u128 into r15;
    add r9 r15 into r16;
    gte r2 r16 into r17;
    assert.eq r17 true;
    get.or_use highest_bids[r0] 0u128 into r18;
    gt r2 r18 into r19;
    branch.eq r19 false to end_then_0_22;
    gt r18 0u128 into r20;
    branch.eq r20 false to end_then_1_24;
    set r18 into second_highest_bids[r0];
    branch.eq true true to end_otherwise_1_25;
    position end_then_1_24;
    position end_otherwise_1_25;
    set r2 into highest_bids[r0];
    set r3 into auction_winners[r0];
    branch.eq true true to end_otherwise_0_23;
    position end_then_0_22;
    get.or_use second_highest_bids[r0] 0u128 into r21;
    gt r2 r21 into r22;
    branch.eq r22 false to end_then_1_26;
    set r2 into second_highest_bids[r0];
    branch.eq true true to end_otherwise_1_27;
    position end_then_1_26;
    position end_otherwise_1_27;
    position end_otherwise_0_23;
    set r16 into escalation_prices[r0];
    sub r4.deadline r5 into r23;
    lte r23 40u64 into r24;
    branch.eq r24 false to end_then_0_28;
    add r4.deadline 40u64 into r25;
    add r4.bid_count 1u64 into r26;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode r4.status r25 r4.reveal_deadline r26 r4.reserve_price_hash r4.created_at r4.dispute_deadline into r27 as AuctionData;
    set r27 into auctions[r0];
    branch.eq true true to end_otherwise_0_29;
    position end_then_0_28;
    add r4.bid_count 1u64 into r28;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode r4.status r4.deadline r4.reveal_deadline r28 r4.reserve_price_hash r4.created_at r4.dispute_deadline into r29 as AuctionData;
    set r29 into auctions[r0];
    position end_otherwise_0_29;

function settle_bundle_allocation:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as u8.private;
    input r3 as u128.private;
    input r4 as field.private;
    input r5 as u8.private;
    input r6 as u128.private;
    input r7 as field.private;
    input r8 as u8.private;
    input r9 as u128.private;
    input r10 as u128.private;
    cast self.caller into r11 as field;
    hash.bhp256 r11 into r12 as field;
    cast r10 into r13 as field;
    hash.bhp256 r13 into r14 as field;
    async settle_bundle_allocation r0 r12 r14 r2 r5 r8 r1 r4 r6 r7 r9 r3 r10 into r15;
    output r15 as obscura_core_v2.aleo/settle_bundle_allocation.future;

finalize settle_bundle_allocation:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u8.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as field.public;
    input r7 as field.public;
    input r8 as u128.public;
    input r9 as field.public;
    input r10 as u128.public;
    input r11 as u128.public;
    input r12 as u128.public;
    get auctions[r0] into r13;
    assert.eq r13.seller_hash r1;
    assert.eq r13.auction_mode 5u8;
    assert.eq r13.status 3u8;
    cast block.height into r14 as u64;
    gt r14 r13.reveal_deadline into r15;
    assert.eq r15 true;
    assert.eq r2 r13.reserve_price_hash;
    and r3 r4 into r16;
    assert.eq r16 0u8;
    and r3 r5 into r17;
    assert.eq r17 0u8;
    and r4 r5 into r18;
    assert.eq r18 0u8;
    is.neq r6 0field into r19;
    assert.eq r19 true;
    contains bid_commitments[r6] into r20;
    assert.eq r20 true;
    contains revealed_bids[r6] into r21;
    assert.eq r21 true;
    gt r3 0u8 into r22;
    assert.eq r22 true;
    is.neq r7 0field into r23;
    contains bid_commitments[r7] into r24;
    ternary r23 r24 true into r25;
    assert.eq r25 true;
    contains revealed_bids[r7] into r26;
    ternary r23 r26 true into r27;
    assert.eq r27 true;
    is.eq r4 0u8 into r28;
    or r23 r28 into r29;
    assert.eq r29 true;
    is.eq r8 0u128 into r30;
    or r23 r30 into r31;
    assert.eq r31 true;
    is.neq r9 0field into r32;
    contains bid_commitments[r9] into r33;
    ternary r32 r33 true into r34;
    assert.eq r34 true;
    contains revealed_bids[r9] into r35;
    ternary r32 r35 true into r36;
    assert.eq r36 true;
    is.eq r5 0u8 into r37;
    or r32 r37 into r38;
    assert.eq r38 true;
    is.eq r10 0u128 into r39;
    or r32 r39 into r40;
    assert.eq r40 true;
    ternary r23 r8 0u128 into r41;
    ternary r32 r10 0u128 into r42;
    add r11 r41 into r43;
    add r43 r42 into r44;
    gte r44 r12 into r45;
    branch.eq r45 false to end_then_0_30;
    cast r13.item_hash r13.seller_hash r13.category r13.token_type r13.auction_mode 4u8 r13.deadline r13.reveal_deadline r13.bid_count r13.reserve_price_hash r13.created_at 0u64 into r46 as AuctionData;
    set r46 into auctions[r0];
    cast r0 r44 0u128 r6 r14 into r47 as SettlementProof;
    hash.bhp256 r47 into r48 as field;
    set r48 into settlement_proofs[r0];
    or r3 r4 into r49;
    or r49 r5 into r50;
    set r50 into bundle_allocation[r0];
    get.or_use reputation_completed[r13.seller_hash] 0u64 into r51;
    add r51 1u64 into r52;
    set r52 into reputation_completed[r13.seller_hash];
    branch.eq true true to end_otherwise_0_31;
    position end_then_0_30;
    cast r13.item_hash r13.seller_hash r13.category r13.token_type r13.auction_mode 6u8 r13.deadline r13.reveal_deadline r13.bid_count r13.reserve_price_hash r13.created_at 0u64 into r53 as AuctionData;
    set r53 into auctions[r0];
    position end_otherwise_0_31;

constructor:
    assert.eq edition 0u16;
