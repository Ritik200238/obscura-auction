program obscura_core.aleo;

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

function initialize_platform:
    input r0 as address.private;
    input r1 as u128.private;
    input r2 as u128.private;
    cast r0 into r3 as field;
    hash.bhp256 r3 into r4 as field;
    async initialize_platform r4 r1 r2 into r5;
    output r5 as obscura_core.aleo/initialize_platform.future;

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
    async create_auction r8 r0 r12 r1 r4 r3 r6 r10 into r23;
    output r8 as field.private;
    output r23 as obscura_core.aleo/create_auction.future;

finalize create_auction:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u8.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as u64.public;
    input r7 as field.public;
    contains auctions[r0] into r8;
    not r8 into r9;
    assert.eq r9 true;
    cast block.height into r10 as u64;
    add r10 240u64 into r11;
    gt r6 r11 into r12;
    assert.eq r12 true;
    get platform_config[0u8] into r13;
    not r13.paused into r14;
    assert.eq r14 true;
    cast r1 r2 r3 r4 r5 1u8 r6 0u64 0u64 r7 r10 0u64 into r15 as AuctionData;
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
    async create_dutch_auction r15 r0 r19 r1 r4 r6 r17 r2 r3 into r20;
    output r15 as field.private;
    output r20 as obscura_core.aleo/create_dutch_auction.future;

finalize create_dutch_auction:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u8.public;
    input r4 as u8.public;
    input r5 as u64.public;
    input r6 as field.public;
    input r7 as u128.public;
    input r8 as u128.public;
    contains auctions[r0] into r9;
    not r9 into r10;
    assert.eq r10 true;
    cast block.height into r11 as u64;
    add r11 240u64 into r12;
    gt r5 r12 into r13;
    assert.eq r13 true;
    get platform_config[0u8] into r14;
    not r14.paused into r15;
    assert.eq r15 true;
    cast r1 r2 r3 r4 3u8 1u8 r5 0u64 0u64 r6 r11 0u64 into r16 as AuctionData;
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
    async create_bundle_auction r20 r0 r24 r5 r7 r9 r22 r0 r1 r2 r3 r4 r6 into r25;
    output r20 as field.private;
    output r25 as obscura_core.aleo/create_bundle_auction.future;

finalize create_bundle_auction:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u8.public;
    input r4 as u8.public;
    input r5 as u64.public;
    input r6 as field.public;
    input r7 as field.public;
    input r8 as field.public;
    input r9 as field.public;
    input r10 as field.public;
    input r11 as u8.public;
    input r12 as u128.public;
    contains auctions[r0] into r13;
    not r13 into r14;
    assert.eq r14 true;
    cast block.height into r15 as u64;
    add r15 240u64 into r16;
    gt r5 r16 into r17;
    assert.eq r17 true;
    get platform_config[0u8] into r18;
    not r18.paused into r19;
    assert.eq r19 true;
    cast r1 r2 r3 r4 5u8 1u8 r5 0u64 0u64 r6 r15 0u64 into r20 as AuctionData;
    set r20 into auctions[r0];
    cast r11 r7 r8 r9 r10 r12 into r21 as BundleConfig;
    set r21 into bundle_configs[r0];

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
    async create_multi_unit_auction r15 r0 r19 r1 r4 r6 r17 r2 r3 into r20;
    output r15 as field.private;
    output r20 as obscura_core.aleo/create_multi_unit_auction.future;

finalize create_multi_unit_auction:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u8.public;
    input r4 as u8.public;
    input r5 as u64.public;
    input r6 as field.public;
    input r7 as u128.public;
    input r8 as u128.public;
    contains auctions[r0] into r9;
    not r9 into r10;
    assert.eq r10 true;
    cast block.height into r11 as u64;
    add r11 240u64 into r12;
    gt r5 r12 into r13;
    assert.eq r13 true;
    get platform_config[0u8] into r14;
    not r14.paused into r15;
    assert.eq r15 true;
    cast r1 r2 r3 r4 6u8 1u8 r5 0u64 0u64 r6 r11 0u64 into r16 as AuctionData;
    set r16 into auctions[r0];
    cast r7 r8 0u128 into r17 as MultiUnitConfig;
    set r17 into multi_unit_configs[r0];

function cancel_auction:
    input r0 as field.private;
    cast self.caller into r1 as field;
    hash.bhp256 r1 into r2 as field;
    async cancel_auction r0 r2 into r3;
    output r3 as obscura_core.aleo/cancel_auction.future;

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
    output r1 as obscura_core.aleo/close_bidding.future;

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
    assert.eq r8 true;
    cast block.height into r9 as u64;
    gte r9 r1.deadline into r10;
    assert.eq r10 true;
    is.eq r1.bid_count 0u64 into r11;
    branch.eq r11 false to end_then_0_0;
    cast r1.item_hash r1.seller_hash r1.category r1.token_type r1.auction_mode 8u8 r1.deadline r1.reveal_deadline r1.bid_count r1.reserve_price_hash r1.created_at r1.dispute_deadline into r12 as AuctionData;
    set r12 into auctions[r0];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    add r9 2880u64 into r13;
    cast r1.item_hash r1.seller_hash r1.category r1.token_type r1.auction_mode 3u8 r1.deadline r13 r1.bid_count r1.reserve_price_hash r1.created_at r1.dispute_deadline into r14 as AuctionData;
    set r14 into auctions[r0];
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
    async place_bid r0 r12 r3 into r13;
    output r10 as SealedBid.record;
    output r13 as obscura_core.aleo/place_bid.future;

finalize place_bid:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u8.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.token_type r2;
    is.eq r3.auction_mode 1u8 into r4;
    is.eq r3.auction_mode 2u8 into r5;
    or r4 r5 into r6;
    assert.eq r6 true;
    cast block.height into r7 as u64;
    lte r7 r3.deadline into r8;
    assert.eq r8 true;
    contains bid_commitments[r1] into r9;
    not r9 into r10;
    assert.eq r10 true;
    get platform_config[0u8] into r11;
    not r11.paused into r12;
    assert.eq r12 true;
    set true into bid_commitments[r1];
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
    async place_bundle_bid r0 r7 r3 into r8;
    output r5 as BundleBid.record;
    output r8 as obscura_core.aleo/place_bundle_bid.future;

finalize place_bundle_bid:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u8.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.auction_mode 5u8;
    assert.eq r3.token_type r2;
    cast block.height into r4 as u64;
    lte r4 r3.deadline into r5;
    assert.eq r5 true;
    contains bid_commitments[r1] into r6;
    not r6 into r7;
    assert.eq r7 true;
    get platform_config[0u8] into r8;
    not r8.paused into r9;
    assert.eq r9 true;
    set true into bid_commitments[r1];
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
    async place_multi_unit_bid r0 r10 r4 into r11;
    output r7 as MultiUnitBid.record;
    output r11 as obscura_core.aleo/place_multi_unit_bid.future;

finalize place_multi_unit_bid:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as u8.public;
    get auctions[r0] into r3;
    assert.eq r3.status 1u8;
    assert.eq r3.auction_mode 6u8;
    assert.eq r3.token_type r2;
    cast block.height into r4 as u64;
    lte r4 r3.deadline into r5;
    assert.eq r5 true;
    contains bid_commitments[r1] into r6;
    not r6 into r7;
    assert.eq r7 true;
    get platform_config[0u8] into r8;
    not r8.paused into r9;
    assert.eq r9 true;
    set true into bid_commitments[r1];
    add r3.bid_count 1u64 into r10;
    cast r3.item_hash r3.seller_hash r3.category r3.token_type r3.auction_mode r3.status r3.deadline r3.reveal_deadline r10 r3.reserve_price_hash r3.created_at r3.dispute_deadline into r11 as AuctionData;
    set r11 into auctions[r0];

function set_merkle_root:
    input r0 as field.private;
    input r1 as field.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    async set_merkle_root r0 r3 r1 into r4;
    output r4 as obscura_core.aleo/set_merkle_root.future;

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
    output r6 as obscura_core.aleo/finalize_auction.future;

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
    gte r7 r3 into r20;
    gt r7 0u128 into r21;
    and r20 r21 into r22;
    branch.eq r22 false to end_then_1_8;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r23 as AuctionData;
    set r23 into auctions[r0];
    cast r0 r7 r9 r8 r5 into r24 as SettlementProof;
    hash.bhp256 r24 into r25 as field;
    set r25 into settlement_proofs[r0];
    get.or_use reputation_completed[r4.seller_hash] 0u64 into r26;
    add r26 1u64 into r27;
    set r27 into reputation_completed[r4.seller_hash];
    branch.eq true true to end_otherwise_1_9;
    position end_then_1_8;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at r4.dispute_deadline into r28 as AuctionData;
    set r28 into auctions[r0];
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
    output r6 as obscura_core.aleo/settle_english.future;

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
    branch.eq r11 false to end_then_0_10;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline 0u64 r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r12 as AuctionData;
    set r12 into auctions[r0];
    get.or_use second_highest_bids[r0] 0u128 into r13;
    cast r0 r7 r13 r8 r5 into r14 as SettlementProof;
    hash.bhp256 r14 into r15 as field;
    set r15 into settlement_proofs[r0];
    get.or_use reputation_completed[r4.seller_hash] 0u64 into r16;
    add r16 1u64 into r17;
    set r17 into reputation_completed[r4.seller_hash];
    branch.eq true true to end_otherwise_0_11;
    position end_then_0_10;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline 0u64 r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r18 as AuctionData;
    set r18 into auctions[r0];
    position end_otherwise_0_11;

function admin_emergency:
    input r0 as u8.private;
    input r1 as field.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    async admin_emergency r0 r1 r3 into r4;
    output r4 as obscura_core.aleo/admin_emergency.future;

finalize admin_emergency:
    input r0 as u8.public;
    input r1 as field.public;
    input r2 as field.public;
    is.eq r0 1u8 into r3;
    branch.eq r3 false to end_then_0_12;
    get auctions[r1] into r4;
    assert.eq r4.status 3u8;
    cast block.height into r5 as u64;
    add r4.reveal_deadline 100u64 into r6;
    gt r5 r6 into r7;
    assert.eq r7 true;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r8 as AuctionData;
    set r8 into auctions[r1];
    branch.eq true true to end_otherwise_0_13;
    position end_then_0_12;
    get platform_config[0u8] into r9;
    assert.eq r2 r9.admin_hash;
    not r9.paused into r10;
    cast r9.admin_hash r9.fee_bps r9.dispute_bond_bps r10 into r11 as PlatformConfig;
    set r11 into platform_config[0u8];
    position end_otherwise_0_13;

constructor:
    assert.eq edition 0u16;
