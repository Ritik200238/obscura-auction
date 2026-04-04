import obscura_core_v2.aleo;
import credits.aleo;
program obscura_settle_v2.aleo;

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

record DisputeBond:
    owner as address.private;
    auction_id as field.private;
    bond_amount as u128.private;

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

struct DisputeData:
    disputer_hash as field;
    bond_amount as u128;
    reason_hash as field;
    filed_at as u64;

struct DutchConfig:
    start_price as u128;
    end_price as u128;

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

mapping auction_escrow:
    key as field.public;
    value as u128.public;

mapping program_balance:
    key as u8.public;
    value as u128.public;

mapping platform_treasury:
    key as u8.public;
    value as u128.public;

mapping settlements:
    key as field.public;
    value as SettlementData.public;

mapping payment_proofs:
    key as field.public;
    value as field.public;

mapping settlement_proofs:
    key as field.public;
    value as field.public;

mapping dutch_params:
    key as field.public;
    value as DutchConfig.public;

mapping settle_status:
    key as field.public;
    value as u8.public;

mapping disputes:
    key as field.public;
    value as DisputeData.public;

mapping dispute_bonds:
    key as field.public;
    value as u128.public;

function reveal_bid:
    input r0 as obscura_core_v2.aleo/SealedBid.record;
    input r1 as credits.aleo/credits.record;
    assert.eq r0.token_type 1u8;
    cast r0.owner r0.auction_id r0.bid_amount r0.bid_nonce into r2 as BidCommitment;
    hash.bhp256 r2 into r3 as field;
    cast r0.bid_amount into r4 as u64;
    call credits.aleo/transfer_private_to_public r1 obscura_settle_v2.aleo r4 into r5 r6;
    cast r0.owner r0.auction_id r0.bid_amount r0.bid_nonce 1u8 into r7 as EscrowReceipt.record;
    async reveal_bid r6 r3 r0.bid_amount r0.auction_id into r8;
    output r7 as EscrowReceipt.record;
    output r5 as credits.aleo/credits.record;
    output r8 as obscura_settle_v2.aleo/reveal_bid.future;

finalize reveal_bid:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as field.public;
    await r0;
    contains revealed_bids[r1] into r4;
    not r4 into r5;
    assert.eq r5 true;
    set r2 into revealed_bids[r1];
    get.or_use auction_escrow[r3] 0u128 into r6;
    add r6 r2 into r7;
    set r7 into auction_escrow[r3];
    get.or_use program_balance[0u8] 0u128 into r8;
    add r8 r2 into r9;
    set r9 into program_balance[0u8];
    get.or_use highest_bids[r3] 0u128 into r10;
    get.or_use second_highest_bids[r3] 0u128 into r11;
    gt r2 r10 into r12;
    branch.eq r12 false to end_then_0_30;
    set r10 into second_highest_bids[r3];
    set r2 into highest_bids[r3];
    set r1 into auction_winners[r3];
    branch.eq true true to end_otherwise_0_31;
    position end_then_0_30;
    gt r2 r11 into r13;
    branch.eq r13 false to end_then_1_32;
    set r2 into second_highest_bids[r3];
    branch.eq true true to end_otherwise_1_33;
    position end_then_1_32;
    position end_otherwise_1_33;
    position end_otherwise_0_31;

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
    async claim_win r10 r0.auction_id r4 r0.escrowed_amount r6 r13 into r16;
    output r14 as WinnerCertificate.record;
    output r15 as SellerReceipt.record;
    output r9 as credits.aleo/credits.record;
    output r16 as obscura_settle_v2.aleo/claim_win.future;

finalize claim_win:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as field.public;
    await r0;
    get auction_winners[r1] into r6;
    assert.eq r2 r6;
    get revealed_bids[r2] into r7;
    assert.eq r7 r3;
    contains settlements[r1] into r8;
    not r8 into r9;
    assert.eq r9 true;
    cast block.height into r10 as u64;
    cast r2 r3 r4 r10 into r11 as SettlementData;
    set r11 into settlements[r1];
    set r5 into payment_proofs[r1];
    get.or_use platform_treasury[0u8] 0u128 into r12;
    add r12 r4 into r13;
    set r13 into platform_treasury[0u8];
    get program_balance[0u8] into r14;
    sub r14 r3 into r15;
    set r15 into program_balance[0u8];
    get auction_escrow[r1] into r16;
    sub r16 r3 into r17;
    set r17 into auction_escrow[r1];

function claim_win_vickrey:
    input r0 as EscrowReceipt.record;
    input r1 as address.private;
    input r2 as field.private;
    input r3 as u128.private;
    assert.eq r0.token_type 1u8;
    gt r0.escrowed_amount r3 into r4;
    assert.eq r4 true;
    gt r3 0u128 into r5;
    assert.eq r5 true;
    cast r0.owner r0.auction_id r0.escrowed_amount r0.bid_nonce into r6 as BidCommitment;
    hash.bhp256 r6 into r7 as field;
    mul r3 100u128 into r8;
    div r8 10000u128 into r9;
    sub r3 r9 into r10;
    sub r0.escrowed_amount r3 into r11;
    cast r10 into r12 as u64;
    cast r11 into r13 as u64;
    call credits.aleo/transfer_public_to_private r1 r12 into r14 r15;
    call credits.aleo/transfer_public_to_private r0.owner r13 into r16 r17;
    hash.bhp256 r0.bid_nonce into r18 as scalar;
    cast r3 into r19 as field;
    commit.bhp256 r19 r18 into r20 as field;
    cast self.caller r0.auction_id r2 r3 1u8 r7 into r21 as WinnerCertificate.record;
    cast r1 r0.auction_id r2 r10 r9 1u8 into r22 as SellerReceipt.record;
    async claim_win_vickrey r15 r17 r0.auction_id r3 r7 r0.escrowed_amount r9 r20 into r23;
    output r21 as WinnerCertificate.record;
    output r22 as SellerReceipt.record;
    output r14 as credits.aleo/credits.record;
    output r16 as credits.aleo/credits.record;
    output r23 as obscura_settle_v2.aleo/claim_win_vickrey.future;

finalize claim_win_vickrey:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as credits.aleo/transfer_public_to_private.future;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as field.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as field.public;
    await r0;
    await r1;
    get second_highest_bids[r2] into r8;
    assert.eq r3 r8;
    get auction_winners[r2] into r9;
    assert.eq r4 r9;
    get revealed_bids[r4] into r10;
    assert.eq r10 r5;
    contains settlements[r2] into r11;
    not r11 into r12;
    assert.eq r12 true;
    cast block.height into r13 as u64;
    cast r4 r3 r6 r13 into r14 as SettlementData;
    set r14 into settlements[r2];
    set r7 into payment_proofs[r2];
    get.or_use platform_treasury[0u8] 0u128 into r15;
    add r15 r6 into r16;
    set r16 into platform_treasury[0u8];
    get program_balance[0u8] into r17;
    sub r17 r5 into r18;
    set r18 into program_balance[0u8];
    get auction_escrow[r2] into r19;
    sub r19 r5 into r20;
    set r20 into auction_escrow[r2];

function claim_refund:
    input r0 as EscrowReceipt.record;
    assert.eq r0.token_type 1u8;
    cast r0.escrowed_amount into r1 as u64;
    call credits.aleo/transfer_public_to_private self.caller r1 into r2 r3;
    cast self.caller r0.auction_id r0.escrowed_amount r0.bid_nonce into r4 as BidCommitment;
    hash.bhp256 r4 into r5 as field;
    async claim_refund r3 r0.auction_id r5 r0.escrowed_amount into r6;
    output r2 as credits.aleo/credits.record;
    output r6 as obscura_settle_v2.aleo/claim_refund.future;

finalize claim_refund:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    await r0;
    get.or_use auction_winners[r1] 0field into r4;
    assert.neq r2 r4;
    get.or_use auction_escrow[r1] 0u128 into r5;
    gt r5 r3 into r6;
    sub r5 r3 into r7;
    ternary r6 r7 0u128 into r8;
    set r8 into auction_escrow[r1];
    get.or_use program_balance[0u8] 0u128 into r9;
    gt r9 r3 into r10;
    sub r9 r3 into r11;
    ternary r10 r11 0u128 into r12;
    set r12 into program_balance[0u8];

function bid_dutch:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as credits.aleo/credits.record;
    input r4 as u128.private;
    input r5 as u128.private;
    input r6 as u64.private;
    input r7 as u64.private;
    gte r1 1000u128 into r8;
    assert.eq r8 true;
    gt r4 r5 into r9;
    assert.eq r9 true;
    cast self.caller r0 r1 r2 into r10 as BidCommitment;
    hash.bhp256 r10 into r11 as field;
    cast r1 into r12 as u64;
    call credits.aleo/transfer_private_to_public r3 obscura_settle_v2.aleo r12 into r13 r14;
    cast self.caller r0 r1 r2 1u8 into r15 as EscrowReceipt.record;
    async bid_dutch r14 r6 r7 r0 r4 r5 r1 r11 into r16;
    output r15 as EscrowReceipt.record;
    output r13 as credits.aleo/credits.record;
    output r16 as obscura_settle_v2.aleo/bid_dutch.future;

finalize bid_dutch:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as u64.public;
    input r2 as u64.public;
    input r3 as field.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as field.public;
    await r0;
    cast block.height into r8 as u64;
    gte r8 r1 into r9;
    assert.eq r9 true;
    lte r8 r2 into r10;
    assert.eq r10 true;
    get.or_use settle_status[r3] 0u8 into r11;
    assert.eq r11 0u8;
    sub r8 r1 into r12;
    cast r12 into r13 as u128;
    sub r2 r1 into r14;
    cast r14 into r15 as u128;
    sub r4 r5 into r16;
    mul r16 r13 into r17;
    div r17 r15 into r18;
    sub r4 r18 into r19;
    gte r6 r19 into r20;
    assert.eq r20 true;
    set r6 into revealed_bids[r7];
    set r6 into highest_bids[r3];
    set r19 into second_highest_bids[r3];
    set r7 into auction_winners[r3];
    get.or_use auction_escrow[r3] 0u128 into r21;
    add r21 r6 into r22;
    set r22 into auction_escrow[r3];
    get.or_use program_balance[0u8] 0u128 into r23;
    add r23 r6 into r24;
    set r24 into program_balance[0u8];
    cast r4 r5 into r25 as DutchConfig;
    set r25 into dutch_params[r3];
    set 1u8 into settle_status[r3];
    cast r3 r6 r19 r7 r8 into r26 as SettlementProof;
    hash.bhp256 r26 into r27 as field;
    set r27 into settlement_proofs[r3];

function bid_english:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as credits.aleo/credits.record;
    input r4 as u64.private;
    gte r1 1000u128 into r5;
    assert.eq r5 true;
    cast self.caller r0 r1 r2 into r6 as BidCommitment;
    hash.bhp256 r6 into r7 as field;
    cast r1 into r8 as u64;
    call credits.aleo/transfer_private_to_public r3 obscura_settle_v2.aleo r8 into r9 r10;
    cast self.caller r0 r1 r2 1u8 into r11 as EscrowReceipt.record;
    async bid_english r10 r4 r7 r0 r1 into r12;
    output r11 as EscrowReceipt.record;
    output r9 as credits.aleo/credits.record;
    output r12 as obscura_settle_v2.aleo/bid_english.future;

finalize bid_english:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as u64.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u128.public;
    await r0;
    cast block.height into r5 as u64;
    lte r5 r1 into r6;
    assert.eq r6 true;
    contains revealed_bids[r2] into r7;
    not r7 into r8;
    assert.eq r8 true;
    get.or_use highest_bids[r3] 0u128 into r9;
    gt r9 0u128 into r10;
    branch.eq r10 false to end_then_0_34;
    mul r9 500u128 into r11;
    div r11 10000u128 into r12;
    add r9 r12 into r13;
    gte r4 r13 into r14;
    assert.eq r14 true;
    branch.eq true true to end_otherwise_0_35;
    position end_then_0_34;
    position end_otherwise_0_35;
    set r4 into revealed_bids[r2];
    gt r4 r9 into r15;
    branch.eq r15 false to end_then_0_36;
    set r9 into second_highest_bids[r3];
    set r4 into highest_bids[r3];
    set r2 into auction_winners[r3];
    branch.eq true true to end_otherwise_0_37;
    position end_then_0_36;
    position end_otherwise_0_37;
    get.or_use auction_escrow[r3] 0u128 into r16;
    add r16 r4 into r17;
    set r17 into auction_escrow[r3];
    get.or_use program_balance[0u8] 0u128 into r18;
    add r18 r4 into r19;
    set r19 into program_balance[0u8];

function dispute_auction:
    input r0 as field.private;
    input r1 as credits.aleo/credits.record;
    input r2 as u128.private;
    input r3 as field.private;
    gte r2 1000u128 into r4;
    assert.eq r4 true;
    cast self.caller into r5 as field;
    hash.bhp256 r5 into r6 as field;
    cast r2 into r7 as u64;
    call credits.aleo/transfer_private_to_public r1 obscura_settle_v2.aleo r7 into r8 r9;
    cast self.caller r0 r2 into r10 as DisputeBond.record;
    async dispute_auction r9 r0 r2 r6 r3 into r11;
    output r10 as DisputeBond.record;
    output r8 as credits.aleo/credits.record;
    output r11 as obscura_settle_v2.aleo/dispute_auction.future;

finalize dispute_auction:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as field.public;
    input r4 as field.public;
    await r0;
    get settlements[r1] into r5;
    cast block.height into r6 as u64;
    add r5.settled_at 100u64 into r7;
    lte r6 r7 into r8;
    assert.eq r8 true;
    contains disputes[r1] into r9;
    not r9 into r10;
    assert.eq r10 true;
    get highest_bids[r1] into r11;
    mul r11 1000u128 into r12;
    div r12 10000u128 into r13;
    gte r2 r13 into r14;
    assert.eq r14 true;
    cast r3 r2 r4 r6 into r15 as DisputeData;
    set r15 into disputes[r1];
    set r2 into dispute_bonds[r1];
    get.or_use program_balance[0u8] 0u128 into r16;
    add r16 r2 into r17;
    set r17 into program_balance[0u8];

function resolve_dispute:
    input r0 as field.private;
    input r1 as boolean.private;
    input r2 as address.private;
    input r3 as u128.private;
    input r4 as address.private;
    cast self.caller into r5 as field;
    cast r2 into r6 as field;
    hash.bhp256 r6 into r7 as field;
    cast r3 into r8 as u64;
    ternary r1 r2 self.caller into r9;
    ternary r1 r8 1u64 into r10;
    call credits.aleo/transfer_public_to_private r9 r10 into r11 r12;
    async resolve_dispute r12 r0 r7 r3 r1 into r13;
    output r11 as credits.aleo/credits.record;
    output r13 as obscura_settle_v2.aleo/resolve_dispute.future;

finalize resolve_dispute:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as boolean.public;
    await r0;
    get disputes[r1] into r5;
    assert.eq r2 r5.disputer_hash;
    get dispute_bonds[r1] into r6;
    assert.eq r3 r6;
    branch.eq r4 false to end_then_0_38;
    get program_balance[0u8] into r7;
    sub r7 r6 into r8;
    set r8 into program_balance[0u8];
    branch.eq true true to end_otherwise_0_39;
    position end_then_0_38;
    get.or_use platform_treasury[0u8] 0u128 into r9;
    add r9 r6 into r10;
    set r10 into platform_treasury[0u8];
    get program_balance[0u8] into r11;
    sub r11 r6 into r12;
    set r12 into program_balance[0u8];
    position end_otherwise_0_39;
    set 0u128 into dispute_bonds[r1];

function withdraw_fees:
    input r0 as u64.private;
    cast self.caller into r1 as field;
    call credits.aleo/transfer_public_to_private self.caller r0 into r2 r3;
    cast r0 into r4 as u128;
    async withdraw_fees r3 r4 into r5;
    output r2 as credits.aleo/credits.record;
    output r5 as obscura_settle_v2.aleo/withdraw_fees.future;

finalize withdraw_fees:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as u128.public;
    await r0;
    get platform_treasury[0u8] into r2;
    lte r1 r2 into r3;
    assert.eq r3 true;
    sub r2 r1 into r4;
    set r4 into platform_treasury[0u8];

function prove_won_auction:
    input r0 as WinnerCertificate.record;
    input r1 as field.public;
    assert.eq r0.auction_id r1;
    cast r0.owner r0.auction_id r0.item_hash r0.winning_amount r0.token_type r0.certificate_id into r2 as WinnerCertificate.record;
    output r2 as WinnerCertificate.record;
    output true as boolean.private;

constructor:
    assert.eq edition 0u16;
