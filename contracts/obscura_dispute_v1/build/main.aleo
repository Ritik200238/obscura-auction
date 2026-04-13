import credits.aleo;
program obscura_dispute_v1.aleo;

record DisputeReceipt:
    owner as address.private;
    auction_id as field.private;
    bond_amount as u128.private;
    settlement_hash as field.private;

record JurorBond:
    owner as address.private;
    auction_id as field.private;
    juror_slot as u8.private;
    stake_amount as u128.private;
    vote_nonce as field.private;

struct DisputeState:
    disputer_hash as field;
    settlement_hash as field;
    bond_pool as u128;
    status as u8;
    filed_at as u64;
    voting_ends as u64;
    reveal_ends as u64;
    jurors_staked as u8;
    votes_revealed as u8;
    votes_upheld as u8;
    votes_rejected as u8;

struct VoteCommit:
    upheld as boolean;
    nonce as field;

struct SlotKey:
    auction_id as field;
    slot as u8;

mapping disputes:
    key as field.public;
    value as DisputeState.public;

mapping juror_commits:
    key as field.public;
    value as field.public;

mapping treasury_balance:
    key as u8.public;
    value as u128.public;

function file_dispute:
    input r0 as field.private;
    input r1 as field.private;
    input r2 as u128.private;
    input r3 as credits.aleo/credits.record;
    gte r2 5000000u128 into r4;
    assert.eq r4 true;
    cast self.caller into r5 as field;
    hash.bhp256 r5 into r6 as field;
    cast r2 into r7 as u64;
    call credits.aleo/transfer_private_to_public r3 obscura_dispute_v1.aleo r7 into r8 r9;
    cast self.caller r0 r2 r1 into r10 as DisputeReceipt.record;
    async file_dispute r9 r0 r6 r1 r2 into r11;
    output r10 as DisputeReceipt.record;
    output r8 as credits.aleo/credits.record;
    output r11 as obscura_dispute_v1.aleo/file_dispute.future;

finalize file_dispute:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u128.public;
    await r0;
    contains disputes[r1] into r5;
    not r5 into r6;
    assert.eq r6 true;
    cast block.height into r7 as u64;
    add r7 2880u64 into r8;
    add r8 1440u64 into r9;
    cast r2 r3 r4 1u8 r7 r8 r9 0u8 0u8 0u8 0u8 into r10 as DisputeState;
    set r10 into disputes[r1];

function juror_stake:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as boolean.private;
    input r4 as field.private;
    input r5 as credits.aleo/credits.record;
    gte r2 1000000u128 into r6;
    assert.eq r6 true;
    lt r1 3u8 into r7;
    assert.eq r7 true;
    cast r2 into r8 as u64;
    call credits.aleo/transfer_private_to_public r5 obscura_dispute_v1.aleo r8 into r9 r10;
    cast r3 r4 into r11 as VoteCommit;
    hash.bhp256 r11 into r12 as field;
    cast r0 r1 into r13 as SlotKey;
    hash.bhp256 r13 into r14 as field;
    cast self.caller r0 r1 r2 r4 into r15 as JurorBond.record;
    async juror_stake r10 r0 r14 r12 r2 into r16;
    output r15 as JurorBond.record;
    output r9 as credits.aleo/credits.record;
    output r16 as obscura_dispute_v1.aleo/juror_stake.future;

finalize juror_stake:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as field.public;
    input r4 as u128.public;
    await r0;
    get disputes[r1] into r5;
    assert.eq r5.status 1u8;
    cast block.height into r6 as u64;
    lt r6 r5.voting_ends into r7;
    assert.eq r7 true;
    contains juror_commits[r2] into r8;
    not r8 into r9;
    assert.eq r9 true;
    set r3 into juror_commits[r2];
    add r5.jurors_staked 1u8 into r10;
    is.eq r10 3u8 into r11;
    ternary r11 3u8 1u8 into r12;
    add r5.bond_pool r4 into r13;
    cast r5.disputer_hash r5.settlement_hash r13 r12 r5.filed_at r5.voting_ends r5.reveal_ends r10 r5.votes_revealed r5.votes_upheld r5.votes_rejected into r14 as DisputeState;
    set r14 into disputes[r1];

function juror_reveal:
    input r0 as JurorBond.record;
    input r1 as boolean.private;
    cast r1 r0.vote_nonce into r2 as VoteCommit;
    hash.bhp256 r2 into r3 as field;
    cast r0.auction_id r0.juror_slot into r4 as SlotKey;
    hash.bhp256 r4 into r5 as field;
    async juror_reveal r0.auction_id r5 r3 r1 into r6;
    output r6 as obscura_dispute_v1.aleo/juror_reveal.future;

finalize juror_reveal:
    input r0 as field.public;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as boolean.public;
    get disputes[r0] into r4;
    assert.eq r4.status 3u8;
    cast block.height into r5 as u64;
    lt r5 r4.reveal_ends into r6;
    assert.eq r6 true;
    get juror_commits[r1] into r7;
    assert.eq r7 r2;
    add r4.votes_revealed 1u8 into r8;
    add r4.votes_upheld 1u8 into r9;
    ternary r3 r9 r4.votes_upheld into r10;
    add r4.votes_rejected 1u8 into r11;
    ternary r3 r4.votes_rejected r11 into r12;
    cast r4.disputer_hash r4.settlement_hash r4.bond_pool r4.status r4.filed_at r4.voting_ends r4.reveal_ends r4.jurors_staked r8 r10 r12 into r13 as DisputeState;
    set r13 into disputes[r0];

function resolve_quorum:
    input r0 as field.private;
    async resolve_quorum r0 into r1;
    output r1 as obscura_dispute_v1.aleo/resolve_quorum.future;

finalize resolve_quorum:
    input r0 as field.public;
    get disputes[r0] into r1;
    assert.eq r1.status 3u8;
    assert.eq r1.jurors_staked 3u8;
    cast block.height into r2 as u64;
    gte r2 r1.reveal_ends into r3;
    assert.eq r3 true;
    gt r1.votes_upheld r1.votes_rejected into r4;
    ternary r4 4u8 5u8 into r5;
    mul r1.bond_pool 500u128 into r6;
    div r6 10000u128 into r7;
    get.or_use treasury_balance[0u8] 0u128 into r8;
    add r8 r7 into r9;
    set r9 into treasury_balance[0u8];
    sub r1.bond_pool r7 into r10;
    cast r1.disputer_hash r1.settlement_hash r10 r5 r1.filed_at r1.voting_ends r1.reveal_ends r1.jurors_staked r1.votes_revealed r1.votes_upheld r1.votes_rejected into r11 as DisputeState;
    set r11 into disputes[r0];

function juror_claim:
    input r0 as JurorBond.record;
    input r1 as boolean.private;
    cast r1 r0.vote_nonce into r2 as VoteCommit;
    hash.bhp256 r2 into r3 as field;
    cast r0.auction_id r0.juror_slot into r4 as SlotKey;
    hash.bhp256 r4 into r5 as field;
    mul r0.stake_amount 15u128 into r6;
    div r6 10u128 into r7;
    cast r7 into r8 as u64;
    call credits.aleo/transfer_public_to_private r0.owner r8 into r9 r10;
    async juror_claim r10 r0.auction_id r1 r5 r3 into r11;
    output r9 as credits.aleo/credits.record;
    output r11 as obscura_dispute_v1.aleo/juror_claim.future;

finalize juror_claim:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as boolean.public;
    input r3 as field.public;
    input r4 as field.public;
    await r0;
    get disputes[r1] into r5;
    is.eq r5.status 4u8 into r6;
    and r6 r2 into r7;
    is.eq r5.status 5u8 into r8;
    not r2 into r9;
    and r8 r9 into r10;
    or r7 r10 into r11;
    assert.eq r11 true;
    get juror_commits[r3] into r12;
    assert.eq r12 r4;
    remove juror_commits[r3];

constructor:
    assert.eq edition 0u16;
