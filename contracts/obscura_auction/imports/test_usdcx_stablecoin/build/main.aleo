program test_usdcx_stablecoin.aleo;



mapping account:
	key as address.public;
	value as u128.public;


function transfer_public_as_signer:
    input r0 as address.public;
    input r1 as u128.public;
    async transfer_public_as_signer self.signer r0 r1 into r2;
    output r2 as test_usdcx_stablecoin.aleo/transfer_public_as_signer.future;

finalize transfer_public_as_signer:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as u128.public;
    get.or_use account[r0] 0u128 into r3;
    gte r3 r2 into r4;
    assert.eq r4 true;
    sub r3 r2 into r5;
    set r5 into account[r0];
    get.or_use account[r1] 0u128 into r6;
    add r6 r2 into r7;
    set r7 into account[r1];




function transfer_public:
    input r0 as address.public;
    input r1 as u128.public;
    async transfer_public self.caller r0 r1 into r2;
    output r2 as test_usdcx_stablecoin.aleo/transfer_public.future;

finalize transfer_public:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as u128.public;
    get.or_use account[r0] 0u128 into r3;
    gte r3 r2 into r4;
    assert.eq r4 true;
    sub r3 r2 into r5;
    set r5 into account[r0];
    get.or_use account[r1] 0u128 into r6;
    add r6 r2 into r7;
    set r7 into account[r1];

