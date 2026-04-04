import test_cpi_core.aleo;
program test_cpi_settle.aleo;

record EscrowReceipt:
    owner as address.private;
    auction_id as field.private;
    escrowed_amount as u128.private;

mapping escrow_total:
    key as field.public;
    value as u128.public;

function reveal_bid:
    input r0 as test_cpi_core.aleo/TestBid.record;
    cast r0.owner r0.auction_id r0.amount into r1 as EscrowReceipt.record;
    async reveal_bid r0.auction_id r0.amount into r2;
    output r1 as EscrowReceipt.record;
    output r2 as test_cpi_settle.aleo/reveal_bid.future;

finalize reveal_bid:
    input r0 as field.public;
    input r1 as u128.public;
    get.or_use escrow_total[r0] 0u128 into r2;
    add r2 r1 into r3;
    set r3 into escrow_total[r0];

constructor:
    assert.eq edition 0u16;
