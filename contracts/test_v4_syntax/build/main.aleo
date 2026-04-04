import credits.aleo;
import merkle_tree.aleo;
import test_usdcx_multisig_core.aleo;
import test_usdcx_freezelist.aleo;
import test_usdcx_stablecoin.aleo;
import test_usad_multisig_core.aleo;
import test_usad_freezelist.aleo;
import test_usad_stablecoin.aleo;
program test_v4_syntax.aleo;

mapping balances:
    key as field.public;
    value as u128.public;

function test_cpi_credits:
    input r0 as credits.aleo/credits.record;
    call credits.aleo/transfer_private_to_public r0 test_v4_syntax.aleo 1000u64 into r1 r2;
    async test_cpi_credits r2 into r3;
    output r1 as credits.aleo/credits.record;
    output r3 as test_v4_syntax.aleo/test_cpi_credits.future;

finalize test_cpi_credits:
    input r0 as credits.aleo/transfer_private_to_public.future;
    await r0;
    get.or_use balances[0field] 0u128 into r1;
    add r1 1u128 into r2;
    set r2 into balances[0field];

function test_cpi_usdcx:
    input r0 as u128.private;
    call test_usdcx_stablecoin.aleo/transfer_public_as_signer test_v4_syntax.aleo r0 into r1;
    async test_cpi_usdcx r1 r0 into r2;
    output r2 as test_v4_syntax.aleo/test_cpi_usdcx.future;

finalize test_cpi_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as u128.public;
    await r0;
    get.or_use balances[1field] 0u128 into r2;
    add r2 r1 into r3;
    set r3 into balances[1field];

function test_cpi_usad:
    input r0 as u128.private;
    call test_usad_stablecoin.aleo/transfer_public_as_signer test_v4_syntax.aleo r0 into r1;
    async test_cpi_usad r1 r0 into r2;
    output r2 as test_v4_syntax.aleo/test_cpi_usad.future;

finalize test_cpi_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as u128.public;
    await r0;
    get.or_use balances[2field] 0u128 into r2;
    add r2 r1 into r3;
    set r3 into balances[2field];

constructor:
    assert.eq edition 0u16;
