import credits.aleo;
program obscura2.aleo;


record SealedBid:
    owner as address.private;
    auction_id as field.private;
    bid_amount as u128.private;
    bid_nonce as field.private;
    token_type as u8.private;

record EscrowReceipt:
    owner as address.private;
    auction_id as field.private;
    escrowed_amount as u128.private;
    bid_nonce as field.private;
    token_type as u8.private;

record WinnerCertificate:
    owner as address.private;
    auction_id as field.private;
    item_hash as field.private;
    winning_amount as u128.private;
    token_type as u8.private;
    certificate_id as field.private;

record SellerReceipt:
    owner as address.private;
    auction_id as field.private;
    item_hash as field.private;
    sale_amount as u128.private;
    fee_paid as u128.private;
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

struct SettlementData:
    winner_bid_hash as field;
    final_price as u128;
    fee_collected as u128;
    settled_at as u64;

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


mapping program_balance:
	key as u8.public;
	value as u128.public;


mapping auction_escrow:
	key as field.public;
	value as u128.public;


mapping platform_treasury:
	key as u8.public;
	value as u128.public;


mapping settlements:
	key as field.public;
	value as SettlementData.public;


mapping platform_config:
	key as u8.public;
	value as PlatformConfig.public;


mapping settlement_proofs:
	key as field.public;
	value as field.public;


mapping payment_proofs:
	key as field.public;
	value as field.public;


function initialize_platform:
    input r0 as address.private;
    input r1 as u128.private;
    input r2 as u128.private;
    cast r0 into r3 as field;
    hash.bhp256 r3 into r4 as field;
    async initialize_platform r4 r1 r2 into r5;
    output r5 as obscura2.aleo/initialize_platform.future;

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
    assert.eq r15 true;
    assert.eq r4 1u8;
    async create_auction r8 r0 r12 r1 r4 r3 r6 r10 into r16;
    output r8 as field.private;
    output r16 as obscura2.aleo/create_auction.future;

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




function cancel_auction:
    input r0 as field.private;
    cast self.caller into r1 as field;
    hash.bhp256 r1 into r2 as field;
    async cancel_auction r0 r2 into r3;
    output r3 as obscura2.aleo/cancel_auction.future;

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
    output r1 as obscura2.aleo/close_bidding.future;

finalize close_bidding:
    input r0 as field.public;
    get auctions[r0] into r1;
    assert.eq r1.status 1u8;
    cast block.height into r2 as u64;
    gte r2 r1.deadline into r3;
    assert.eq r3 true;
    is.eq r1.bid_count 0u64 into r4;
    branch.eq r4 false to end_then_0_0;
    cast r1.item_hash r1.seller_hash r1.category r1.token_type r1.auction_mode 8u8 r1.deadline r1.reveal_deadline r1.bid_count r1.reserve_price_hash r1.created_at r1.dispute_deadline into r5 as AuctionData;
    set r5 into auctions[r0];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    add r2 2880u64 into r6;
    cast r1.item_hash r1.seller_hash r1.category r1.token_type r1.auction_mode 3u8 r1.deadline r6 r1.bid_count r1.reserve_price_hash r1.created_at r1.dispute_deadline into r7 as AuctionData;
    set r7 into auctions[r0];
    position end_otherwise_0_1;




function place_bid:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    gte r1 1000u128 into r3;
    assert.eq r3 true;
    cast self.caller r0 r1 r2 1u8 into r4 as SealedBid.record;
    cast self.caller r0 r1 r2 into r5 as BidCommitment;
    hash.bhp256 r5 into r6 as field;
    async place_bid r0 r6 into r7;
    output r4 as SealedBid.record;
    output r7 as obscura2.aleo/place_bid.future;

finalize place_bid:
    input r0 as field.public;
    input r1 as field.public;
    get auctions[r0] into r2;
    assert.eq r2.status 1u8;
    cast block.height into r3 as u64;
    lte r3 r2.deadline into r4;
    assert.eq r4 true;
    contains bid_commitments[r1] into r5;
    not r5 into r6;
    assert.eq r6 true;
    get platform_config[0u8] into r7;
    not r7.paused into r8;
    assert.eq r8 true;
    set true into bid_commitments[r1];
    gt r2.deadline 40u64 into r9;
    sub r2.deadline 40u64 into r10;
    ternary r9 r10 0u64 into r11;
    gt r3 r11 into r12;
    add r2.deadline 40u64 into r13;
    ternary r12 r13 r2.deadline into r14;
    add r2.bid_count 1u64 into r15;
    cast r2.item_hash r2.seller_hash r2.category r2.token_type r2.auction_mode r2.status r14 r2.reveal_deadline r15 r2.reserve_price_hash r2.created_at r2.dispute_deadline into r16 as AuctionData;
    set r16 into auctions[r0];




function reveal_bid:
    input r0 as SealedBid.record;
    input r1 as credits.aleo/credits.record;
    cast r0.owner r0.auction_id r0.bid_amount r0.bid_nonce into r2 as BidCommitment;
    hash.bhp256 r2 into r3 as field;
    cast r0.bid_amount into r4 as u64;
    call credits.aleo/transfer_private_to_public r1 obscura2.aleo r4 into r5 r6;
    cast r0.owner r0.auction_id r0.bid_amount r0.bid_nonce 1u8 into r7 as EscrowReceipt.record;
    async reveal_bid r6 r0.auction_id r3 r0.bid_amount into r8;
    output r7 as EscrowReceipt.record;
    output r5 as credits.aleo/credits.record;
    output r8 as obscura2.aleo/reveal_bid.future;

finalize reveal_bid:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    await r0;
    get auctions[r1] into r4;
    assert.eq r4.status 3u8;
    cast block.height into r5 as u64;
    lte r5 r4.reveal_deadline into r6;
    assert.eq r6 true;
    get bid_commitments[r2] into r7;
    assert.eq r7 true;
    contains revealed_bids[r2] into r8;
    not r8 into r9;
    assert.eq r9 true;
    set r3 into revealed_bids[r2];
    get.or_use auction_escrow[r1] 0u128 into r10;
    add r10 r3 into r11;
    set r11 into auction_escrow[r1];
    get.or_use program_balance[0u8] 0u128 into r12;
    add r12 r3 into r13;
    set r13 into program_balance[0u8];
    get.or_use highest_bids[r1] 0u128 into r14;
    get.or_use second_highest_bids[r1] 0u128 into r15;
    gt r3 r14 into r16;
    branch.eq r16 false to end_then_0_2;
    set r14 into second_highest_bids[r1];
    set r3 into highest_bids[r1];
    set r2 into auction_winners[r1];
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    gt r3 r15 into r17;
    branch.eq r17 false to end_then_1_4;
    set r3 into second_highest_bids[r1];
    branch.eq true true to end_otherwise_1_5;
    position end_then_1_4;
    position end_otherwise_1_5;
    position end_otherwise_0_3;




function finalize_auction:
    input r0 as field.private;
    input r1 as u128.private;
    cast self.caller into r2 as field;
    hash.bhp256 r2 into r3 as field;
    cast r1 into r4 as field;
    hash.bhp256 r4 into r5 as field;
    async finalize_auction r0 r3 r5 r1 into r6;
    output r6 as obscura2.aleo/finalize_auction.future;

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
    branch.eq r10 false to end_then_0_6;
    is.eq r9 0u128 into r11;
    branch.eq r11 false to end_then_1_8;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at r4.dispute_deadline into r12 as AuctionData;
    set r12 into auctions[r0];
    branch.eq true true to end_otherwise_1_9;
    position end_then_1_8;
    gte r7 r3 into r13;
    branch.eq r13 false to end_then_2_10;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r14 as AuctionData;
    set r14 into auctions[r0];
    cast r0 r7 r9 r8 r5 into r15 as SettlementProof;
    hash.bhp256 r15 into r16 as field;
    set r16 into settlement_proofs[r0];
    branch.eq true true to end_otherwise_2_11;
    position end_then_2_10;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r17 as AuctionData;
    set r17 into auctions[r0];
    position end_otherwise_2_11;
    position end_otherwise_1_9;
    branch.eq true true to end_otherwise_0_7;
    position end_then_0_6;
    gte r7 r3 into r18;
    gt r7 0u128 into r19;
    and r18 r19 into r20;
    branch.eq r20 false to end_then_1_12;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 4u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at 0u64 into r21 as AuctionData;
    set r21 into auctions[r0];
    cast r0 r7 r9 r8 r5 into r22 as SettlementProof;
    hash.bhp256 r22 into r23 as field;
    set r23 into settlement_proofs[r0];
    branch.eq true true to end_otherwise_1_13;
    position end_then_1_12;
    cast r4.item_hash r4.seller_hash r4.category r4.token_type r4.auction_mode 6u8 r4.deadline r4.reveal_deadline r4.bid_count r4.reserve_price_hash r4.created_at r4.dispute_deadline into r24 as AuctionData;
    set r24 into auctions[r0];
    position end_otherwise_1_13;
    position end_otherwise_0_7;




function claim_win:
    input r0 as EscrowReceipt.record;
    input r1 as address.private;
    input r2 as field.private;
    assert.eq r0.token_type 1u8;
    cast r0.owner r0.auction_id r0.escrowed_amount r0.bid_nonce into r3 as BidCommitment;
    hash.bhp256 r3 into r4 as field;
    mul r0.escrowed_amount 100u128 into r5;
    div r5 10000u128 into r6;
    sub r0.escrowed_amount r6 into r7;
    cast r7 into r8 as u64;
    call credits.aleo/transfer_public_to_private r1 r8 into r9 r10;
    hash.bhp256 r0.bid_nonce into r11 as scalar;
    cast r0.escrowed_amount into r12 as field;
    commit.bhp256 r12 r11 into r13 as field;
    cast self.caller r0.auction_id r2 r0.escrowed_amount 1u8 r4 into r14 as WinnerCertificate.record;
    cast r1 r0.auction_id r2 r7 r6 1u8 into r15 as SellerReceipt.record;
    async claim_win r10 r0.auction_id r4 r0.escrowed_amount r6 r2 r13 into r16;
    output r14 as WinnerCertificate.record;
    output r15 as SellerReceipt.record;
    output r9 as credits.aleo/credits.record;
    output r16 as obscura2.aleo/claim_win.future;

finalize claim_win:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as field.public;
    input r6 as field.public;
    await r0;
    get auctions[r1] into r7;
    assert.eq r7.status 4u8;
    get auction_winners[r1] into r8;
    assert.eq r2 r8;
    get revealed_bids[r2] into r9;
    assert.eq r9 r3;
    assert.eq r5 r7.item_hash;
    contains settlements[r1] into r10;
    not r10 into r11;
    assert.eq r11 true;
    cast block.height into r12 as u64;
    cast r2 r3 r4 r12 into r13 as SettlementData;
    set r13 into settlements[r1];
    set r6 into payment_proofs[r1];
    get.or_use platform_treasury[0u8] 0u128 into r14;
    add r14 r4 into r15;
    set r15 into platform_treasury[0u8];
    get program_balance[0u8] into r16;
    sub r16 r3 into r17;
    set r17 into program_balance[0u8];
    get auction_escrow[r1] into r18;
    sub r18 r3 into r19;
    set r19 into auction_escrow[r1];




function claim_refund:
    input r0 as EscrowReceipt.record;
    assert.eq r0.token_type 1u8;
    cast r0.escrowed_amount into r1 as u64;
    call credits.aleo/transfer_public_to_private self.caller r1 into r2 r3;
    cast self.caller r0.auction_id r0.escrowed_amount r0.bid_nonce into r4 as BidCommitment;
    hash.bhp256 r4 into r5 as field;
    async claim_refund r3 r0.auction_id r5 r0.escrowed_amount 1u8 into r6;
    output r2 as credits.aleo/credits.record;
    output r6 as obscura2.aleo/claim_refund.future;

finalize claim_refund:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u8.public;
    await r0;
    get auctions[r1] into r5;
    is.eq r5.status 4u8 into r6;
    is.eq r5.status 6u8 into r7;
    or r6 r7 into r8;
    is.eq r5.status 5u8 into r9;
    or r8 r9 into r10;
    is.eq r5.status 8u8 into r11;
    or r10 r11 into r12;
    assert.eq r12 true;
    get.or_use auction_winners[r1] 0field into r13;
    assert.neq r2 r13;
    get auction_escrow[r1] into r14;
    sub r14 r3 into r15;
    set r15 into auction_escrow[r1];
    is.eq r4 1u8 into r16;
    ternary r16 0u8 1u8 into r17;
    get program_balance[r17] into r18;
    sub r18 r3 into r19;
    set r19 into program_balance[r17];



function prove_won_auction:
    input r0 as WinnerCertificate.record;
    input r1 as field.public;
    assert.eq r0.auction_id r1;
    output r0 as WinnerCertificate.record;
    output true as boolean.private;
