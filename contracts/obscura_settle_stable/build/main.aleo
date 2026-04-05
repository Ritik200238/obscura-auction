import obscura_core_v3.aleo;
import merkle_tree.aleo;
import test_usdcx_multisig_core.aleo;
import test_usdcx_freezelist.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_multisig_core.aleo;
import test_usad_freezelist.aleo;
import test_usad_stablecoin.aleo;
program obscura_settle_stable_v3.aleo;

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

function reveal_bid_usdcx:
    input r0 as obscura_core_v3.aleo/SealedBid.record;
    assert.eq r0.token_type 2u8;
    cast r0.owner r0.auction_id r0.bid_amount r0.bid_nonce into r1 as BidCommitment;
    hash.bhp256 r1 into r2 as field;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer obscura_settle_stable_v3.aleo r0.bid_amount into r3;
    cast r0.owner r0.auction_id r0.bid_amount r0.bid_nonce 2u8 into r4 as EscrowReceipt.record;
    async reveal_bid_usdcx r3 r2 r0.bid_amount r0.auction_id into r5;
    output r4 as EscrowReceipt.record;
    output r5 as obscura_settle_stable_v3.aleo/reveal_bid_usdcx.future;

finalize reveal_bid_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
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
    get.or_use program_balance[1u8] 0u128 into r8;
    add r8 r2 into r9;
    set r9 into program_balance[1u8];
    get.or_use highest_bids[r3] 0u128 into r10;
    get.or_use second_highest_bids[r3] 0u128 into r11;
    gt r2 r10 into r12;
    branch.eq r12 false to end_then_0_32;
    set r10 into second_highest_bids[r3];
    set r2 into highest_bids[r3];
    set r1 into auction_winners[r3];
    branch.eq true true to end_otherwise_0_33;
    position end_then_0_32;
    gt r2 r11 into r13;
    branch.eq r13 false to end_then_1_34;
    set r2 into second_highest_bids[r3];
    branch.eq true true to end_otherwise_1_35;
    position end_then_1_34;
    position end_otherwise_1_35;
    position end_otherwise_0_33;

function reveal_bid_usad:
    input r0 as obscura_core_v3.aleo/SealedBid.record;
    assert.eq r0.token_type 3u8;
    cast r0.owner r0.auction_id r0.bid_amount r0.bid_nonce into r1 as BidCommitment;
    hash.bhp256 r1 into r2 as field;
    call test_usad_stablecoin.aleo/transfer_public_as_signer obscura_settle_stable_v3.aleo r0.bid_amount into r3;
    cast r0.owner r0.auction_id r0.bid_amount r0.bid_nonce 3u8 into r4 as EscrowReceipt.record;
    async reveal_bid_usad r3 r2 r0.bid_amount r0.auction_id into r5;
    output r4 as EscrowReceipt.record;
    output r5 as obscura_settle_stable_v3.aleo/reveal_bid_usad.future;

finalize reveal_bid_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_as_signer.future;
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
    get.or_use program_balance[2u8] 0u128 into r8;
    add r8 r2 into r9;
    set r9 into program_balance[2u8];
    get.or_use highest_bids[r3] 0u128 into r10;
    get.or_use second_highest_bids[r3] 0u128 into r11;
    gt r2 r10 into r12;
    branch.eq r12 false to end_then_0_36;
    set r10 into second_highest_bids[r3];
    set r2 into highest_bids[r3];
    set r1 into auction_winners[r3];
    branch.eq true true to end_otherwise_0_37;
    position end_then_0_36;
    gt r2 r11 into r13;
    branch.eq r13 false to end_then_1_38;
    set r2 into second_highest_bids[r3];
    branch.eq true true to end_otherwise_1_39;
    position end_then_1_38;
    position end_otherwise_1_39;
    position end_otherwise_0_37;

function claim_win_usdcx:
    input r0 as EscrowReceipt.record;
    input r1 as address.private;
    input r2 as field.private;
    assert.eq r0.token_type 2u8;
    cast r0.owner r0.auction_id r0.escrowed_amount r0.bid_nonce into r3 as BidCommitment;
    hash.bhp256 r3 into r4 as field;
    mul r0.escrowed_amount 100u128 into r5;
    div r5 10000u128 into r6;
    sub r0.escrowed_amount r6 into r7;
    call test_usdcx_stablecoin.aleo/transfer_public r1 r7 into r8;
    hash.bhp256 r0.bid_nonce into r9 as scalar;
    cast r0.escrowed_amount into r10 as field;
    commit.bhp256 r10 r9 into r11 as field;
    cast self.caller r0.auction_id r2 r0.escrowed_amount 2u8 r4 into r12 as WinnerCertificate.record;
    cast r1 r0.auction_id r2 r7 r6 2u8 into r13 as SellerReceipt.record;
    async claim_win_usdcx r8 r0.auction_id r4 r0.escrowed_amount r6 r11 into r14;
    output r12 as WinnerCertificate.record;
    output r13 as SellerReceipt.record;
    output r14 as obscura_settle_stable_v3.aleo/claim_win_usdcx.future;

finalize claim_win_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public.future;
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
    get.or_use platform_treasury[1u8] 0u128 into r12;
    add r12 r4 into r13;
    set r13 into platform_treasury[1u8];
    get program_balance[1u8] into r14;
    sub r14 r3 into r15;
    set r15 into program_balance[1u8];
    get auction_escrow[r1] into r16;
    sub r16 r3 into r17;
    set r17 into auction_escrow[r1];

function claim_win_usad:
    input r0 as EscrowReceipt.record;
    input r1 as address.private;
    input r2 as field.private;
    assert.eq r0.token_type 3u8;
    cast r0.owner r0.auction_id r0.escrowed_amount r0.bid_nonce into r3 as BidCommitment;
    hash.bhp256 r3 into r4 as field;
    mul r0.escrowed_amount 100u128 into r5;
    div r5 10000u128 into r6;
    sub r0.escrowed_amount r6 into r7;
    call test_usad_stablecoin.aleo/transfer_public r1 r7 into r8;
    hash.bhp256 r0.bid_nonce into r9 as scalar;
    cast r0.escrowed_amount into r10 as field;
    commit.bhp256 r10 r9 into r11 as field;
    cast self.caller r0.auction_id r2 r0.escrowed_amount 3u8 r4 into r12 as WinnerCertificate.record;
    cast r1 r0.auction_id r2 r7 r6 3u8 into r13 as SellerReceipt.record;
    async claim_win_usad r8 r0.auction_id r4 r0.escrowed_amount r6 r11 into r14;
    output r12 as WinnerCertificate.record;
    output r13 as SellerReceipt.record;
    output r14 as obscura_settle_stable_v3.aleo/claim_win_usad.future;

finalize claim_win_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public.future;
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
    get.or_use platform_treasury[2u8] 0u128 into r12;
    add r12 r4 into r13;
    set r13 into platform_treasury[2u8];
    get program_balance[2u8] into r14;
    sub r14 r3 into r15;
    set r15 into program_balance[2u8];
    get auction_escrow[r1] into r16;
    sub r16 r3 into r17;
    set r17 into auction_escrow[r1];

function claim_win_vickrey_usdcx:
    input r0 as EscrowReceipt.record;
    input r1 as address.private;
    input r2 as field.private;
    input r3 as u128.private;
    assert.eq r0.token_type 2u8;
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
    call test_usdcx_stablecoin.aleo/transfer_public r1 r10 into r12;
    call test_usdcx_stablecoin.aleo/transfer_public r0.owner r11 into r13;
    hash.bhp256 r0.bid_nonce into r14 as scalar;
    cast r3 into r15 as field;
    commit.bhp256 r15 r14 into r16 as field;
    cast self.caller r0.auction_id r2 r3 2u8 r7 into r17 as WinnerCertificate.record;
    cast r1 r0.auction_id r2 r10 r9 2u8 into r18 as SellerReceipt.record;
    async claim_win_vickrey_usdcx r12 r13 r0.auction_id r3 r7 r0.escrowed_amount r9 r16 into r19;
    output r17 as WinnerCertificate.record;
    output r18 as SellerReceipt.record;
    output r19 as obscura_settle_stable_v3.aleo/claim_win_vickrey_usdcx.future;

finalize claim_win_vickrey_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public.future;
    input r1 as test_usdcx_stablecoin.aleo/transfer_public.future;
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
    get.or_use platform_treasury[1u8] 0u128 into r15;
    add r15 r6 into r16;
    set r16 into platform_treasury[1u8];
    get program_balance[1u8] into r17;
    sub r17 r5 into r18;
    set r18 into program_balance[1u8];
    get auction_escrow[r2] into r19;
    sub r19 r5 into r20;
    set r20 into auction_escrow[r2];

function claim_win_vickrey_usad:
    input r0 as EscrowReceipt.record;
    input r1 as address.private;
    input r2 as field.private;
    input r3 as u128.private;
    assert.eq r0.token_type 3u8;
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
    call test_usad_stablecoin.aleo/transfer_public r1 r10 into r12;
    call test_usad_stablecoin.aleo/transfer_public r0.owner r11 into r13;
    hash.bhp256 r0.bid_nonce into r14 as scalar;
    cast r3 into r15 as field;
    commit.bhp256 r15 r14 into r16 as field;
    cast self.caller r0.auction_id r2 r3 3u8 r7 into r17 as WinnerCertificate.record;
    cast r1 r0.auction_id r2 r10 r9 3u8 into r18 as SellerReceipt.record;
    async claim_win_vickrey_usad r12 r13 r0.auction_id r3 r7 r0.escrowed_amount r9 r16 into r19;
    output r17 as WinnerCertificate.record;
    output r18 as SellerReceipt.record;
    output r19 as obscura_settle_stable_v3.aleo/claim_win_vickrey_usad.future;

finalize claim_win_vickrey_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public.future;
    input r1 as test_usad_stablecoin.aleo/transfer_public.future;
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
    get.or_use platform_treasury[2u8] 0u128 into r15;
    add r15 r6 into r16;
    set r16 into platform_treasury[2u8];
    get program_balance[2u8] into r17;
    sub r17 r5 into r18;
    set r18 into program_balance[2u8];
    get auction_escrow[r2] into r19;
    sub r19 r5 into r20;
    set r20 into auction_escrow[r2];

function claim_refund_usdcx:
    input r0 as EscrowReceipt.record;
    assert.eq r0.token_type 2u8;
    cast self.caller r0.auction_id r0.escrowed_amount r0.bid_nonce into r1 as BidCommitment;
    hash.bhp256 r1 into r2 as field;
    call test_usdcx_stablecoin.aleo/transfer_public self.caller r0.escrowed_amount into r3;
    async claim_refund_usdcx r3 r0.auction_id r2 r0.escrowed_amount into r4;
    output r4 as obscura_settle_stable_v3.aleo/claim_refund_usdcx.future;

finalize claim_refund_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public.future;
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
    get.or_use program_balance[1u8] 0u128 into r9;
    gt r9 r3 into r10;
    sub r9 r3 into r11;
    ternary r10 r11 0u128 into r12;
    set r12 into program_balance[1u8];

function claim_refund_usad:
    input r0 as EscrowReceipt.record;
    assert.eq r0.token_type 3u8;
    cast self.caller r0.auction_id r0.escrowed_amount r0.bid_nonce into r1 as BidCommitment;
    hash.bhp256 r1 into r2 as field;
    call test_usad_stablecoin.aleo/transfer_public self.caller r0.escrowed_amount into r3;
    async claim_refund_usad r3 r0.auction_id r2 r0.escrowed_amount into r4;
    output r4 as obscura_settle_stable_v3.aleo/claim_refund_usad.future;

finalize claim_refund_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public.future;
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
    get.or_use program_balance[2u8] 0u128 into r9;
    gt r9 r3 into r10;
    sub r9 r3 into r11;
    ternary r10 r11 0u128 into r12;
    set r12 into program_balance[2u8];

function bid_dutch_usdcx:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u64.private;
    input r6 as u64.private;
    gte r1 1000u128 into r7;
    assert.eq r7 true;
    gt r3 r4 into r8;
    assert.eq r8 true;
    cast self.caller r0 r1 r2 into r9 as BidCommitment;
    hash.bhp256 r9 into r10 as field;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer obscura_settle_stable_v3.aleo r1 into r11;
    cast self.caller r0 r1 r2 2u8 into r12 as EscrowReceipt.record;
    async bid_dutch_usdcx r11 r5 r6 r0 r3 r4 r1 r10 into r13;
    output r12 as EscrowReceipt.record;
    output r13 as obscura_settle_stable_v3.aleo/bid_dutch_usdcx.future;

finalize bid_dutch_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
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
    get.or_use program_balance[1u8] 0u128 into r23;
    add r23 r6 into r24;
    set r24 into program_balance[1u8];
    cast r4 r5 into r25 as DutchConfig;
    set r25 into dutch_params[r3];
    set 1u8 into settle_status[r3];
    cast r3 r6 r19 r7 r8 into r26 as SettlementProof;
    hash.bhp256 r26 into r27 as field;
    set r27 into settlement_proofs[r3];

function bid_dutch_usad:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u64.private;
    input r6 as u64.private;
    gte r1 1000u128 into r7;
    assert.eq r7 true;
    gt r3 r4 into r8;
    assert.eq r8 true;
    cast self.caller r0 r1 r2 into r9 as BidCommitment;
    hash.bhp256 r9 into r10 as field;
    call test_usad_stablecoin.aleo/transfer_public_as_signer obscura_settle_stable_v3.aleo r1 into r11;
    cast self.caller r0 r1 r2 3u8 into r12 as EscrowReceipt.record;
    async bid_dutch_usad r11 r5 r6 r0 r3 r4 r1 r10 into r13;
    output r12 as EscrowReceipt.record;
    output r13 as obscura_settle_stable_v3.aleo/bid_dutch_usad.future;

finalize bid_dutch_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_as_signer.future;
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
    get.or_use program_balance[2u8] 0u128 into r23;
    add r23 r6 into r24;
    set r24 into program_balance[2u8];
    cast r4 r5 into r25 as DutchConfig;
    set r25 into dutch_params[r3];
    set 1u8 into settle_status[r3];
    cast r3 r6 r19 r7 r8 into r26 as SettlementProof;
    hash.bhp256 r26 into r27 as field;
    set r27 into settlement_proofs[r3];

function bid_english_usdcx:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u64.private;
    gte r1 1000u128 into r4;
    assert.eq r4 true;
    cast self.caller r0 r1 r2 into r5 as BidCommitment;
    hash.bhp256 r5 into r6 as field;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer obscura_settle_stable_v3.aleo r1 into r7;
    cast self.caller r0 r1 r2 2u8 into r8 as EscrowReceipt.record;
    async bid_english_usdcx r7 r3 r6 r0 r1 into r9;
    output r8 as EscrowReceipt.record;
    output r9 as obscura_settle_stable_v3.aleo/bid_english_usdcx.future;

finalize bid_english_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
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
    branch.eq r10 false to end_then_0_40;
    mul r9 500u128 into r11;
    div r11 10000u128 into r12;
    add r9 r12 into r13;
    gte r4 r13 into r14;
    assert.eq r14 true;
    branch.eq true true to end_otherwise_0_41;
    position end_then_0_40;
    position end_otherwise_0_41;
    set r4 into revealed_bids[r2];
    gt r4 r9 into r15;
    branch.eq r15 false to end_then_0_42;
    set r9 into second_highest_bids[r3];
    set r4 into highest_bids[r3];
    set r2 into auction_winners[r3];
    branch.eq true true to end_otherwise_0_43;
    position end_then_0_42;
    position end_otherwise_0_43;
    get.or_use auction_escrow[r3] 0u128 into r16;
    add r16 r4 into r17;
    set r17 into auction_escrow[r3];
    get.or_use program_balance[1u8] 0u128 into r18;
    add r18 r4 into r19;
    set r19 into program_balance[1u8];

function bid_english_usad:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as field.private;
    input r3 as u64.private;
    gte r1 1000u128 into r4;
    assert.eq r4 true;
    cast self.caller r0 r1 r2 into r5 as BidCommitment;
    hash.bhp256 r5 into r6 as field;
    call test_usad_stablecoin.aleo/transfer_public_as_signer obscura_settle_stable_v3.aleo r1 into r7;
    cast self.caller r0 r1 r2 3u8 into r8 as EscrowReceipt.record;
    async bid_english_usad r7 r3 r6 r0 r1 into r9;
    output r8 as EscrowReceipt.record;
    output r9 as obscura_settle_stable_v3.aleo/bid_english_usad.future;

finalize bid_english_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_as_signer.future;
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
    branch.eq r10 false to end_then_0_44;
    mul r9 500u128 into r11;
    div r11 10000u128 into r12;
    add r9 r12 into r13;
    gte r4 r13 into r14;
    assert.eq r14 true;
    branch.eq true true to end_otherwise_0_45;
    position end_then_0_44;
    position end_otherwise_0_45;
    set r4 into revealed_bids[r2];
    gt r4 r9 into r15;
    branch.eq r15 false to end_then_0_46;
    set r9 into second_highest_bids[r3];
    set r4 into highest_bids[r3];
    set r2 into auction_winners[r3];
    branch.eq true true to end_otherwise_0_47;
    position end_then_0_46;
    position end_otherwise_0_47;
    get.or_use auction_escrow[r3] 0u128 into r16;
    add r16 r4 into r17;
    set r17 into auction_escrow[r3];
    get.or_use program_balance[2u8] 0u128 into r18;
    add r18 r4 into r19;
    set r19 into program_balance[2u8];

function withdraw_fees_usdcx:
    input r0 as u128.private;
    input r1 as address.private;
    cast self.caller into r2 as field;
    call test_usdcx_stablecoin.aleo/transfer_public r1 r0 into r3;
    async withdraw_fees_usdcx r3 r0 into r4;
    output r4 as obscura_settle_stable_v3.aleo/withdraw_fees_usdcx.future;

finalize withdraw_fees_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public.future;
    input r1 as u128.public;
    await r0;
    get platform_treasury[1u8] into r2;
    lte r1 r2 into r3;
    assert.eq r3 true;
    sub r2 r1 into r4;
    set r4 into platform_treasury[1u8];

constructor:
    assert.eq edition 0u16;
