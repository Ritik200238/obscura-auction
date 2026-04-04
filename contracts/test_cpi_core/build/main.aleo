program test_cpi_core.aleo;

record TestBid:
    owner as address.private;
    auction_id as field.private;
    amount as u128.private;

mapping bid_count:
    key as field.public;
    value as u64.public;

function create_bid:
    input r0 as field.private;
    input r1 as u128.private;
    cast self.caller r0 r1 into r2 as TestBid.record;
    async create_bid r0 into r3;
    output r2 as TestBid.record;
    output r3 as test_cpi_core.aleo/create_bid.future;

finalize create_bid:
    input r0 as field.public;
    get.or_use bid_count[r0] 0u64 into r1;
    add r1 1u64 into r2;
    set r2 into bid_count[r0];

constructor:
    assert.eq edition 0u16;
