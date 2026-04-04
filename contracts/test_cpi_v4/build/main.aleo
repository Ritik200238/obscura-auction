import credits.aleo;
program test_cpi_v4.aleo;

mapping test_balance:
    key as u8.public;
    value as u128.public;

function test_passthrough:
    input r0 as credits.aleo/credits.record;
    call credits.aleo/transfer_private_to_public r0 test_cpi_v4.aleo 1000u64 into r1 r2;
    output r1 as credits.aleo/credits.record;
    output r2 as test_cpi_v4.aleo/test_passthrough.future;

constructor:
    assert.eq edition 0u16;
